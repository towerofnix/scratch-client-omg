'use strict'

const cheerio = require('cheerio')
const fetch = require('node-fetch')
const profiles = require('./profiles')
const util = require('./util')

module.exports.browse = async function({rl, us, pageType, pageId}) {
  let currentPageNumber = 1

  const comments = await fetchComments(pageType, pageId, 1)

  let currentComment = comments[0]
  let noMoreComments = false
  let quit = false
  while (!quit) {
    if (currentComment) {
      const { author, content } = currentComment
      console.log(`\x1b[2m${currentComment.date}\x1b[0m`)
      console.log(`\x1b[1m${author}:\x1b[0m ${content}`)

      if (currentComment.replies) {
        const len = currentComment.replies.length
        if (len) {
          console.log(`\x1b[2m${len} repl${len === 1 ? 'y' : 'ies'}\x1b[0m`)
        }
      }
    } else {
      console.log('There are no comments here, yet.')
    }

    const cc = currentComment
    await util.choose({rl, us}, {
      q: {
        help: 'Quit browsing comments.',
        longcodes: ['quit', 'back'],
        action: () => {
          quit = true
        }
      },

      w: (us && !(cc && cc.parent)) ? {
        help: 'Write a new comment, to be sent to the top of this comment section.',
        longcodes: ['write', 'new'],
        action: async () => {
          const comment = await commentPrompt({rl, us, pageType, pageId, promptStr: 'Comment: '})
          if (comment) {
            console.log('Sent.')
            comments.unshift(comment)
            setupNextPreviousLinks(comments)
            currentComment = comment
          }
        }
      } : undefined,

      n: (cc && cc.next) ? {
        help: 'View next comment.',
        longcodes: ['next'],
        action: () => {
          currentComment = currentComment.next
        }
      } : undefined,

      p: (cc && cc.previous) ? {
        help: 'View previous comment.',
        longcodes: ['prev', 'previous'],
        action: () => {
          currentComment = currentComment.previous
        }
      } : undefined,

      i: (cc && cc.replies && cc.replies.length) ? {
        help: 'View replies.',
        longcodes: ['in', 'replies'],
        action: () => {
          currentComment = currentComment.replies[0]
        }
      } : undefined,

      I: (cc && cc.replies && cc.replies.length > 1) ? {
        help: 'View the most recent reply.',
        longcodes: ['last', 'lastreply'],
        action: () => {
          currentComment = currentComment.replies[currentComment.replies.length - 1]
        }
      } : undefined,

      o: (cc && cc.parent) ? {
        help: 'Go out of this reply thread.',
        longcodes: ['out', 'top'],
        action: () => {
          currentComment = currentComment.parent
        }
      } : undefined,

      a: cc ? {
        help: `Browse the profile of this user, \x1b[34;1m${currentComment.author}\x1b[0m.`,
        longcodes: ['author', 'profile'],
        action: async () => {
          await profiles.browse({rl, us, username: currentComment.author})
        }
      } : undefined,

      m: !noMoreComments ? {
        help: 'Load more comments.',
        longcodes: ['more'],
        action: async () => {
          const newComments = await fetchComments(pageType, pageId, ++currentPageNumber)
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

      r: (us && cc) ? {
        help: 'Reply to this comment.',
        longcodes: ['reply'],
        action: async () => {
          const reply = await commentPrompt({rl, us, pageType, pageId,
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
    })
  }
}

function fetchComments(type, id, page = 1) {
  return fetch(`${util.urls.siteAPI}/comments/${type}/${id}/?page=${page}`)
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
    content: util.trimWhitespace($(commentEl).find('.content').text()),
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

async function commentPrompt({rl, us, pageType, pageId, commenteeId, parent, promptStr}) {
  const message = await util.prompt(rl, promptStr)

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

function postComment({pageType, pageId, content, us, commenteeId = '', parent = null}) {
  return fetch(`${util.urls.siteAPI}/comments/${pageType}/${pageId}/add/`, {
    method: 'POST',
    body: JSON.stringify(util.clearBlankProperties({
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
        Object.assign(comment, util.clearBlankProperties({
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
