'use strict'

const fetch = require('node-fetch')
const cheerio = require('cheerio')
const readline = require('readline')
const Scratch = require('scratch-api')

const siteAPI = 'https://scratch.mit.edu/site-api'

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

function choose(rl, letters) {
  return new Promise(resolve => {
    const recursive = function() {
      rl.question(`[${letters}] `, answer => {
        if (answer.length === 1 && letters.includes(answer)) {
          resolve(answer)
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
      isReply: false,
      replyId: comment.id,
      replies: setupNextPreviousLinks($(threadEl).find('.reply .comment').map(
        (i, replyEl) => Object.assign(parseCommentEl(replyEl, {$}), {
          isReply: true,
          parent: comment,
          replyId: comment.id
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

function postComment({pageType, pageId, content, us, commenteeId = '', parentId = ''}) {
  return fetch(`${siteAPI}/comments/${pageType}/${pageId}/add/`, {
    method: 'POST',
    body: JSON.stringify({content, commentee_id: commenteeId, parent_id: parentId}),
    headers: {
      'Cookie': `scratchsessionsid=${us.sessionId}; scratchcsrftoken=a;`,
      'X-CSRFToken': 'a',
      'referer': 'https://scratch.mit.edu'
    }
  }).then(res => {
    if (res.status === 200) {
      return res.text().then(text => {
        const $ = cheerio.load(text)
        return parseCommentEl($('.comment'), {$})
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

    const choice = await choose(rl,
      '' +
      (currentComment.next ? 'n' : '') +
      (currentComment.previous ? 'p' : '') +
      (currentComment.replies && currentComment.replies.length ? 'i' +
        (currentComment.replies.length > 1 ? 'I' : '') : '') +
      (currentComment.parent ? 'o' : '') +
      (us ? 'r' : '')
    )

    if (choice === 'n') {
      currentComment = currentComment.next
    } else if (choice === 'p') {
      currentComment = currentComment.previous
    } else if (choice === 'i') {
      currentComment = currentComment.replies[0]
    } else if (choice === 'I') {
      currentComment = currentComment.replies[currentComment.replies.length - 1]
    } else if (choice === 'o') {
      currentComment = currentComment.parent
    } else if (choice === 'r') reply: {
      const message = await prompt(rl, 'Reply with: ')
      if (message.length > 500) {
        console.log('Message too long (> 500 characters).')
        break reply
      }
      if (message.trim().length === 0) {
        console.log('Not sending reply (empty input).')
        break reply
      }
      const reply = await postComment({pageType, pageId, us,
        content: message,
        commenteeId: currentComment.authorId,
        parentId: currentComment.replyId
      })
      const replies = currentComment.parent ? currentComment.parent.replies : currentComment.replies
      replies.push(reply)
      currentComment = reply
      setupNextPreviousLinks(replies)
    }
  }
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

  const page = 'bharvey'
  await browseComments({rl, us, pageType: 'user', pageId: page}, await getComments('user', page))
}

main().catch(err => console.error(err))
