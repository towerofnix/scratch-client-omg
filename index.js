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

function choose(rl, choiceDict) {
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
        if (answer === '?') {
          for (const [ key, { help } ] of Object.entries(choiceDict)) {
            if (help) {
              console.log(`- \x1b[34;1m${key}:\x1b[0m ${help}`)
            }
          }
          recursive()
        } else if (keys.includes(answer)) {
          const choice = choiceDict[answer]
          resolve(choice.action(answer))
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

function getComments(type, id, page = 1) {
  return fetch(`${siteAPI}/comments/${type}/${id}/?page=${page}`)
    .then(res => res.text())
    .then(html => parseComments(html))
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
    body: JSON.stringify({
      content,
      commentee_id: commenteeId,
      parent_id: parent ? parent.id : undefined
    }),
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
      throw new Error(res.status)
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

    await choose(rl, clearBlankProperties({
      q: currentComment.parent ? {
        help: 'Quit browsing these replies.',
        action: () => {
          currentComment = currentComment.parent
        }
      } : {
        help: 'Quit browsing comments.',
        action: () => {
          quit = true
        }
      },

      n: currentComment.next ? {
        help: 'View next comment.',
        action: () => {
          currentComment = currentComment.next
        }
      } : undefined,

      p: currentComment.previous ? {
        help: 'View previous comment.',
        action: () => {
          currentComment = currentComment.previous
        }
      } : undefined,

      i: (currentComment.replies && currentComment.replies.length) ? {
        help: 'View replies.',
        action: () => {
          currentComment = currentComment.replies[0]
        }
      } : undefined,

      I: currentComment.replies && currentComment.replies.length > 1 ? {
        help: 'View the most recent reply.',
        action: () => {
          currentComment = currentComment.replies[currentComment.replies.length - 1]
        }
      } : undefined,

      o: currentComment.parent ? {
        help: 'Go out of this reply thread.',
        action: () => {
          currentComment = currentComment.parent
        }
      } : undefined,

      a: {
        help: 'Browse the profile of the author of this comment.',
        action: async () => {
          await browseProfile({rl, us}, await getProfile(currentComment.author))
        }
      },

      m: !noMoreComments ? {
        help: 'Load more comments.',
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
        action: async () => {
          const message = await prompt(rl, 'Reply with: ')

          if (message.length > 500) {
            console.log('Message too long (> 500 characters).')
            return
          }

          if (message.trim().length === 0) {
            console.log('Not sending reply (empty input).')
            return
          }

          const reply = await postComment({pageType, pageId, us,
            content: message,
            commenteeId: currentComment.authorId,
            parent: currentComment.threadTopComment
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
      console.log(
        `\x1b[1m${profile.featuredProjectHeading}:\x1b[0m` +
        ` \x1b[33m${profile.featuredProject.name}\x1b[0m`)
    }

    if (profile.projectCount) {
      console.log(`${profile.username} has shared ${profile.projectCount} project${
        profile.projectCount === 1 ? '' : 's'
      }.`)
    } else {
      console.log(`${profile.username} has not shared any projects.`)
    }

    await choose(rl, clearBlankProperties({
      q: {
        help: 'Quit browsing this profile.',
        action: async () => {
          quit = true
        }
      },

      f: profile.featuredProject ? {
        help: 'Browse this user\'s featured project.',
        action: async () => {
          await browseProject({rl, us}, await getProject(profile.featuredProject.id))
        }
      } : undefined,

      P: profile.projectCount ? {
        help: 'Browse this user\'s shared projects.',
        action: async () => {
          await browseUserProjects({rl, us}, profile.username)
        }
      } : undefined,

      c: {
        help: 'Browse comments.',
        action: async () => {
          await browseComments({
            rl, us, pageType: 'user', pageId: profile.username
          })
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

    await choose(rl, clearBlankProperties({
      q: {
        help: 'Quit browsing this project.',
        action: () => {
          quit = true
        }
      },

      N: (project.instructions || project.notesAndCredits) ? {
        help: 'View instructions and notes/credits.',
        action: () => {
          showNotes()
        }
      } : undefined,

      a: {
        help: 'Browse the profile of the author of this project.',
        action: async () => {
          await browseProfile({rl, us}, await getProfile(project.author))
        }
      },

      c: {
        help: 'Browse comments.',
        action: async () => {
          await browseComments({
            rl, us, pageType: 'project', pageId: project.id
          })
        }
      }
    }))
  }
}

async function browsePagedList({rl, getItems, formatItem, title = '', pageCount, handleItem}) {
  let quit = false, currentPageNumber = 1
  while (!quit) {
    const items = await getItems(currentPageNumber)
    console.log(`${title ? title + ' ' : ''}(Page ${currentPageNumber} / ${pageCount})`)
    for (let i = 0; i < items.length; i++) {
      console.log(`[${i + 1}]: ${await formatItem(items[i])}`)
    }
    await choose(rl, Object.assign(clearBlankProperties({
      q: {
        help: 'Quit browsing this list.',
        action: () => {
          quit = true
        }
      },

      n: currentPageNumber < pageCount ? {
        help: 'Go to the next page.',
        action: () => {
          currentPageNumber++
        }
      } : undefined,

      p: currentPageNumber > 1 ? {
        help: 'Go to the previous page.',
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
    rl,
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

  const pageId = process.argv[2] || '_nix'
  const pageType = process.argv[3] || 'user'
  if (pageType === 'user') {
    await browseProfile({rl, us}, await getProfile(pageId))
  } else if (pageType === 'project') {
    await browseProject({rl, us}, await getProject(pageId))
  }
  rl.close()
}

main().catch(err => console.error(err))
