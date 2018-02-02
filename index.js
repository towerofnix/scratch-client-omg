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
    const promptString = (
      '[' +
      (keys.every(k => k.length === 1) ? keys.join('') : keys.reduce((acc, key) => {
        return acc + '|' + key
      })) +
      '] '
    )

    const recursive = function() {
      rl.question(promptString, answer => {
        if (keys.includes(answer)) {
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
      ).get())
    })
    return comment
  }).get())
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

function showComments(comments) {
  for (const comment of comments) {
    console.log(showOneComment(comment))
    for (const reply of comment.replies) {
      console.log('-', showOneComment(reply))
    }
    console.log('')
  }
}

function showOneComment({ author, content }) {
  return `\x1b[1m${author}:\x1b[0m ${content}`
}

function trimWhitespace(string) {
  return string.split('\n').map(str => str.trim()).filter(Boolean).join(' ')
}

async function browseComments({rl, us, pageType, pageId}, comments) {
  let currentComment = comments[0]

  while (true) {
    console.log(`\x1b[2m${currentComment.date}\x1b[0m`)
    console.log(showOneComment(currentComment))

    if (currentComment.replies) {
      const len = currentComment.replies.length
      if (len) {
        console.log(`\x1b[2m${len} repl${len === 1 ? 'y' : 'ies'}\x1b[0m`)
      }
    }

    const choice = await choose(rl, clearBlankProperties({
      n: currentComment.next ? {
        action: () => {
          currentComment = currentComment.next
        }
      } : undefined,

      p: currentComment.previous ? {
        action: () => {
          currentComment = currentComment.previous
        }
      } : undefined,

      i: currentComment.replies ? {
        action: () => {
          currentComment = currentComment.replies[0]
        }
      } : undefined,

      I: currentComment.replies && currentComment.replies.length > 1 ? {
        action: () => {
          currentComment = currentComment.replies[currentComment.replies.length - 1]
        }
      } : undefined,

      o: currentComment.parent ? {
        action: () => {
          currentComment = currentComment.parent
        }
      } : undefined,

      r: us ? {
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

async function getProfile(username) {
  return fetch(`${scratch}/users/${username}`)
    .then(res => res.text())
    .then(html => parseProfile(html))
}

function parseProfile(html) {
  const $ = cheerio.load(html)

  return {
    username: $('#profile-data h2').text(),
    rank: $('#profile-data .group').text().trim(),
    location: $('#profile-data .location').text(),
    joinDate: new Date($('span[title]').attr('title')),
    aboutMe: $('#bio-readonly .overview').text(),
    wiwo: $('#status-readonly .overview').text(),
    featuredProjectHeading: $('.featured-project-heading').text(),
    featuredProject: {
      name: $('.player a.project-name').text(),
      id: parseInt($('.player a.project-name').attr('href').match(/([0-9]+)/)[1])
    },
    projectCount: $('.box-head:has(a[href*=projects]) h4').text()
  }
}

async function browseProfile({rl, us}, profile) {
  console.log(profile)
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
  await browseComments({rl, us, pageType, pageId}, await getComments(pageType, pageId))
  // await browseProfile({rl, us}, await getProfile('_nix'))
}

main().catch(err => console.error(err))
