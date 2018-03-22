'use strict'

const fetch = require('node-fetch')
const cheerio = require('cheerio')
const readline = require('readline')
const Scratch = require('scratch-api')

const scratch = 'https://scratch.mit.edu'
const siteAPI = scratch + '/site-api'

function clearBlankProperties(obj) {
  const newObj = Object.assign({}, obj)

  for (const [ prop, value ] of Object.entries(newObj)) {
    if (typeof value === 'undefined') {
      delete newObj[prop]
    }
  }

  return newObj
}

function login() {
  return new Promise((resolve, reject) => {
    Scratch.UserSession.load(function(err, user) {
      if (err) {
        reject(err)
      } else {
        resolve(user)
      }
    })
  })
}

function choose({rl, us}, choiceDict) {
  if (!('#' in choiceDict)) {
    choiceDict['#'] = {
      help: 'Menu - go somewhere or do something.',
      longcodes: ['menu'],
      action: () => showGlobalMenu({rl, us})
    }
  }

  choiceDict = clearBlankProperties(choiceDict)

  return new Promise(resolve => {
    const keys = Object.keys(choiceDict)
    const visibleKeys = keys.filter(k => choiceDict[k].invisible !== true)
    const promptString = (
      '[' +
      (visibleKeys.every(k => k.length === 1) ? visibleKeys.join('') : visibleKeys.reduce((acc, key) => {
        return acc + '|' + key
      })) +
      '] '
    )

    const recursive = function() {
      rl.question(promptString, answer => {
        if (answer === '?' || answer === 'help') {
          for (const [ key, { longcodes, help } ] of Object.entries(choiceDict)) {
            if (help) {
              console.log(`- \x1b[34;1m${key + (longcodes ? ` (${longcodes.join(', ')})` : '')}:\x1b[0m ${help}`)
            }
          }
          recursive()
          return
        }

        const match = (
          keys.includes(answer) ? choiceDict[answer] :
          Object.values(choiceDict).find(
            o => o.longcodes && o.longcodes.includes(
              answer.replace(/[- ]/g, '')
            )
          )
        )

        if (match) {
          resolve(match.action(answer))
        } else {
          recursive()
        }
      })
    }

    recursive()
  })
}

function prompt(rl, question = 'prompt: ') {
  return new Promise(resolve => {
    rl.question(question, answer => {
      resolve(answer)
    })
  })
}

async function showGlobalMenu({rl, us}) {
  await choose({rl, us}, {
    '#': undefined,
    q: {
      help: 'Go back to what you were doing or browsing before.',
      longcodes: ['quit', 'back'],
      action: () => {}
    },
    u: {
      help: 'Browse a user by entering their username.',
      longcodes: ['user', 'profile'],
      action: async () => {
        const username = await prompt(rl, 'Username? ')
        if (username) {
          await browseProfile({rl, us}, await getProfile(username))
        }
      }
    },
    p: {
      help: 'Browse a project by entering its ID.',
      longcodes: ['project'],
      action: async () => {
        const id = await prompt(rl, 'Project ID? ')
        if (id) {
          await browseProject({rl, us}, await getProject(id))
        }
      }
    }
  })
}

function getComments(type, id, page = 1) {
  return fetch(`${siteAPI}/comments/${type}/${id}/?page=${page}`)
    .then(res => res.text())
    .then(html => parseComments(html))
}

async function messagePrompt({rl, us, pageType, pageId, commenteeId, parent, promptStr}) {
  const message = await prompt(rl, promptStr)

  if (message.length > 500) {
    console.log('Message too long (> 500 characters).')
    return
  }

  if (message.trim().length === 0) {
    console.log('Not sending reply (empty input).')
    return
  }

  const reply = await postComment({pageType, pageId, us,
    content: message, commenteeId, parent
  })

  return reply
}

function parseComments(html) {
  const $ = cheerio.load(html)

  return setupNextPreviousLinks($('.top-level-reply').map((i, threadEl) => {
    const commentEl = $(threadEl).find('> .comment')
    const comment = parseCommentEl(commentEl, {$})
    Object.assign(comment, {
      threadTopComment: comment,
      replies: setupNextPreviousLinks($(threadEl).find('.reply .comment').map(
        (i, replyEl) => Object.assign(parseCommentEl(replyEl, {$}), {
          parent: comment,
          threadTopComment: comment
        })
      ).get().filter(c => c.content !== '[deleted]'))
    })
    return comment
  }).get().filter(c => c.content !== '[deleted]'))
}

function parseCommentEl(commentEl, {$}) {
  return {
    author: $(commentEl).find('.name a').text(),
    authorId: $(commentEl).find('.reply').attr('data-commentee-id'),
    content: trimWhitespace($(commentEl).find('.content').text()),
    id: $(commentEl).attr('data-comment-id'),
    date: new Date($(commentEl).find('.time').attr('title'))
  }
}

function setupNextPreviousLinks(comments) {
  for (let i = 0; i < comments.length; i++) {
    const comment = comments[i]
    if (i > 0) {
      comment.previous = comments[i - 1]
    }
    if (i < comments.length - 1) {
      comment.next = comments[i + 1]
    }
  }
  return comments
}

function postComment({pageType, pageId, content, us, commenteeId = '', parent = null}) {
  return fetch(`${siteAPI}/comments/${pageType}/${pageId}/add/`, {
    method: 'POST',
    body: JSON.stringify(clearBlankProperties({
      content,
      commentee_id: commenteeId || '',
      parent_id: parent ? parent.id : ''
    })),
    headers: {
      'Cookie': `scratchsessionsid=${us.sessionId}; scratchcsrftoken=a;`,
      'X-CSRFToken': 'a',
      'referer': 'https://scratch.mit.edu'
    }
  }).then(res => {
    if (res.status === 200) {
      return res.text().then(text => {
        const $ = cheerio.load(text)
        const comment = parseCommentEl($('.comment'), {$})
        Object.assign(comment, clearBlankProperties({
          parent: parent ? parent : undefined,
          threadTopComment: parent ? parent : comment
        }))
        return comment
      })
    } else {
      return res.text().then(text => {
        console.log(text)
        throw new Error(res.status)
      })
    }
  })
}

function showOneComment({ author, content }) {
  return `\x1b[1m${author}:\x1b[0m ${content}`
}

function trimWhitespace(string) {
  return string.split('\n').map(str => str.trim()).filter(Boolean).join(' ')
}

async function browseComments({rl, us, pageType, pageId}) {
  let currentPageNumber = 1

  const comments = await getComments(pageType, pageId, 1)

  if (comments.length === 0) {
    console.log('There are no comments on this.')
    return
  }

  let currentComment = comments[0]
  let noMoreComments = false
  let quit = false
  while (!quit) {
    console.log(`\x1b[2m${currentComment.date}\x1b[0m`)
    console.log(showOneComment(currentComment))

    if (currentComment.replies) {
      const len = currentComment.replies.length
      if (len) {
        console.log(`\x1b[2m${len} repl${len === 1 ? 'y' : 'ies'}\x1b[0m`)
      }
    }

    await choose({rl, us}, clearBlankProperties({
      q: {
        help: 'Quit browsing comments.',
        longcodes: ['quit', 'back'],
        action: () => {
          quit = true
        }
      },

      n: currentComment.next ? {
        help: 'View next comment.',
        longcodes: ['next'],
        action: () => {
          currentComment = currentComment.next
        }
      } : undefined,

      p: currentComment.previous ? {
        help: 'View previous comment.',
        longcodes: ['prev', 'previous'],
        action: () => {
          currentComment = currentComment.previous
        }
      } : undefined,

      i: (currentComment.replies && currentComment.replies.length) ? {
        help: 'View replies.',
        longcodes: ['in', 'replies'],
        action: () => {
          currentComment = currentComment.replies[0]
        }
      } : undefined,

      I: currentComment.replies && currentComment.replies.length > 1 ? {
        help: 'View the most recent reply.',
        longcodes: ['last', 'lastreply'],
        action: () => {
          currentComment = currentComment.replies[currentComment.replies.length - 1]
        }
      } : undefined,

      o: currentComment.parent ? {
        help: 'Go out of this reply thread.',
        longcodes: ['out', 'top'],
        action: () => {
          currentComment = currentComment.parent
        }
      } : undefined,

      a: {
        help: 'Browse the profile of the author of this comment.',
        longcodes: ['author', 'profile'],
        action: async () => {
          await browseProfile({rl, us}, await getProfile(currentComment.author))
        }
      },

      m: !noMoreComments ? {
        help: 'Load more comments.',
        longcodes: ['more'],
        action: async () => {
          const newComments = await getComments(pageType, pageId, ++currentPageNumber)
          if (newComments.length) {
            comments.push(...newComments)
            setupNextPreviousLinks(comments)
            currentComment = newComments[0]
          } else {
            console.log('There are no more comments.')
            noMoreComments = true
          }
        }
      } : undefined,

      r: us ? {
        help: 'Reply to this comment.',
        longcodes: ['reply'],
        action: async () => {
          const reply = await messagePrompt({rl, us, pageType, pageId,
            commenteeId: currentComment.authorId,
            parent: currentComment.threadTopComment,
            promptStr: 'Reply with: '
          })

          const replies = currentComment.parent ? currentComment.parent.replies : currentComment.replies
          replies.push(reply)
          setupNextPreviousLinks(replies)

          currentComment = reply
        }
      } : undefined
    }))
  }
}

function getProfile(username) {
  return fetch(`${scratch}/users/${username}`)
    .then(res => res.text())
    .then(html => parseProfile(html))
}

function parseProfile(html) {
  const $ = cheerio.load(html)

  if ($('#profile-data').length === 0) {
    return {notFound: true}
  }

  const profile = {
    username: $('#profile-data h2').text().match(/[^*]*/),
    rank: $('#profile-data .group').text().trim(),
    location: $('#profile-data .location').text(),
    joinDate: new Date($('span[title]').attr('title')),
    aboutMe: $('#bio-readonly .overview').text(),
    wiwo: $('#status-readonly .overview').text(),
    projectCount: parseInt($('.box:has(#shared) h4').text().match(/([0-9]+)/)[1])
  }

  if ($('.player a.project-name').length && $('.player a.project-name').text().trim().length) {
    profile.featuredProjectHeading = $('.featured-project-heading').text()
    profile.featuredProject = {
      name: $('.player a.project-name').text(),
      id: parseInt($('.player a.project-name').attr('href').match(/([0-9]+)/)[1])
    }
  } else {
    profile.featuredProjectHeading = profile.featuredProject = null
  }

  return profile
}

async function browseProfile({rl, us}, profile) {
  if (profile.notFound) {
    console.log('That user profile is not found, sorry.')
    return
  }

  let quit = false
  while (!quit) {
    console.log(
      `\x1b[34;1m${profile.username}\x1b[0m` +
      `  \x1b[2m${profile.rank}; Joined ${profile.joinDate.toDateString()}\x1b[0m`
    )
    console.log(`\x1b[1mAbout me:\x1b[0m ${profile.aboutMe}`)
    console.log(`\x1b[1mWhat I'm working on:\x1b[0m ${profile.wiwo}`)

    if (profile.featuredProject) {
      const h = profile.featuredProjectHeading
      console.log(
        `\x1b[1m${h + (h.endsWith('!') ? '' : ':')}\x1b[0m` +
        ` \x1b[33m${profile.featuredProject.name}\x1b[0m`)
    }

    if (profile.projectCount) {
      console.log(`${profile.username} has shared ${profile.projectCount} project${
        profile.projectCount === 1 ? '' : 's'
      }.`)
    } else {
      console.log(`${profile.username} has not shared any projects.`)
    }

    await choose({rl, us}, clearBlankProperties({
      q: {
        help: 'Quit browsing this profile.',
        longcodes: ['quit', 'back'],
        action: async () => {
          quit = true
        }
      },

      f: profile.featuredProject ? {
        help: 'Browse this user\'s featured project.',
        longcodes: ['featured'],
        action: async () => {
          await browseProject({rl, us}, await getProject(profile.featuredProject.id))
        }
      } : undefined,

      P: profile.projectCount ? {
        help: 'Browse this user\'s shared projects.',
        longcodes: ['projects', 'shared'],
        action: async () => {
          await browseUserProjects({rl, us}, profile.username)
        }
      } : undefined,

      c: {
        help: 'Browse comments.',
        longcodes: ['comments'],
        action: async () => {
          await browseComments({
            rl, us, pageType: 'user', pageId: profile.username
          })
        }
      },

      C: {
        help: 'Leave a comment.',
        longcodes: ['comment', 'reply'],
        action: async () => {
          if (await messagePrompt({rl, us, pageType: 'user', pageId: profile.username, promptStr: 'Comment: '})) {
            console.log('Sent.')
          }
        }
      }
    }))
  }
}

function getProject(projectId) {
  return fetch(`${scratch}/projects/${projectId}`)
    .then(res => res.text())
    .then(html => parseProject(html))
}

function parseProject(html) {
  const $ = cheerio.load(html)

  return {
    id: $('#project').attr('data-project-id'),
    title: $('#title').text(),
    author: $('#owner').text(),
    instructions: $('#instructions .overview').text().trim(),
    notesAndCredits: $('#description .overview').text().trim()
  }
}

async function browseProject({rl, us}, project) {
  let quit = false, firstTime = true

  const showNotes = () => {
    if (project.instructions) {
      console.log('\x1b[1mInstructions:\x1b[0m')
      console.log(project.instructions)
      console.log('')
    }

    if (project.notesAndCredits) {
      console.log('\x1b[1mNotes and Credits:\x1b[0m')
      console.log(project.notesAndCredits)
      console.log('')
    }
  }

  while (!quit) {
    console.log(`\x1b[33m${project.title}\x1b[0m`)
    console.log(`\x1b[2mby ${project.author}; id: ${project.id}\x1b[0m`)

    if (firstTime) {
      console.log('')
      showNotes()
      firstTime = false
    }

    await choose({rl, us}, clearBlankProperties({
      q: {
        help: 'Quit browsing this project.',
        longcodes: ['quit', 'back'],
        action: () => {
          quit = true
        }
      },

      N: (project.instructions || project.notesAndCredits) ? {
        help: 'View instructions and notes/credits.',
        longcodes: ['instructions', 'notes', 'credits'],
        action: () => {
          showNotes()
        }
      } : undefined,

      a: {
        help: 'Browse the profile of the author of this project.',
        longcodes: ['author', 'profile'],
        action: async () => {
          await browseProfile({rl, us}, await getProfile(project.author))
        }
      },

      c: {
        help: 'Browse comments.',
        longcodes: ['comments'],
        action: async () => {
          await browseComments({
            rl, us, pageType: 'project', pageId: project.id
          })
        }
      }
    }))
  }
}

async function browsePagedList({rl, us, getItems, formatItem, title = '', pageCount, handleItem}) {
  let quit = false, currentPageNumber = 1
  while (!quit) {
    const items = await getItems(currentPageNumber)

    let header = ''

    if (title) {
      header += title + ' '
    }

    header += `(Page ${currentPageNumber}`
    if (pageCount) {
      header += ` / ${pageCount}`
    }
    header += ')'
    console.log(header)

    console.log(`${title ? title + ' ' : ''}(Page ${currentPageNumber} / ${pageCount})`)
    for (let i = 0; i < items.length; i++) {
      console.log(`[${i + 1}]: ${await formatItem(items[i])}`)
    }
    await choose({rl, us}, Object.assign(clearBlankProperties({
      q: {
        help: 'Quit browsing this list.',
        longcodes: ['quit', 'back'],
        action: () => {
          quit = true
        }
      },

      n: currentPageNumber < pageCount ? {
        help: 'Go to the next page.',
        longcodes: ['next'],
        action: () => {
          currentPageNumber++
        }
      } : undefined,

      p: currentPageNumber > 1 ? {
        help: 'Go to the previous page.',
        longcodes: ['prev', 'previous'],
        action: () => {
          currentPageNumber--
        }
      } : undefined,

      ['1-' + items.length]: {
        help: 'Choose an item from the list.',
        action: () => {}
      }
    }), items.reduce((acc, item, i) => {
      acc[i + 1] = {
        invisible: true,
        action: async () => {
          await handleItem(item)
        }
      }
      return acc
    }, {})))
  }
}

function getUserProjects(username, pageNumber = 1) {
  return fetch(`${scratch}/users/${username}/projects/?page=${pageNumber}`)
    .then(res => res.text())
    .then(html => parseUserProjects(html))
}

function parseUserProjects(html) {
  const $ = cheerio.load(html)

  return {
    projects: $('.project.thumb').map((i, projectEl) => {
      return {
        name: $(projectEl).find('.title a').text(),
        id: parseInt($(projectEl).find('.title a').attr('href').match(/([0-9]+)/)[1])
      }
    }).get(),
    pageCount: $('.page-links').length ? parseInt($('.page-current').last().text().trim()) : 1
  }
}

async function browseUserProjects({rl, us}, username) {
  await browsePagedList({
    rl, us,
    getItems: async n => (await getUserProjects(username, n)).projects,
    title: `\x1b[34;1m${username}'s\x1b[0;1m projects\x1b[0m`,
    formatItem: p => `\x1b[33m${p.name}\x1b[0m`,
    pageCount: (await getUserProjects(username)).pageCount,
    handleItem: async p => {
      await browseProject({rl, us}, await getProject(p.id))
    }
  })
}

async function main() {
  let us

  try {
    us = await login()
  } catch (err) {
    if (err.message === 'canceled') {
      console.log('')
      return
    } else {
      throw err
    }
  }

  const rl = readline.createInterface({
    input: process.stdin, output: process.stdout
  })

  const pageId = process.argv[2] || us.username
  const pageType = process.argv[3] || 'user'
  if (pageType === 'user') {
    await browseProfile({rl, us}, await getProfile(pageId))
  } else if (pageType === 'project') {
    await browseProject({rl, us}, await getProject(pageId))
  }
  rl.close()
}

main().catch(err => console.error(err))
