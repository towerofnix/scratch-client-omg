'use strict'

const fetch = require('node-fetch')
const pagedList = require('./paged-list')
const projects = require('./projects')
const profiles = require('./profiles')
const studios = require('./studios')
const util = require('./util')

module.exports.browse = async function({rl, us}) {
  const token = await util.getAuthToken(us)

  await pagedList.browse({
    rl, us,
    getItems: n => fetchMessages(us.username, token, n),
    title: `\x1b[34;1m${us.username}'s\x1b[0;1m messages\x1b[0m`,
    formatItem: m => formatMessage({us}, m),
    pageCount: null,

    handleItem: async m => {
      console.log(formatMessage({us}, m))
      console.log('')

      await util.choose({rl, us}, {
        q: {
          help: 'Quit viewing this message.',
          longcodes: ['quit', 'back'],
          action: () => {
            // No need to set a "quit" flag - we'll automatically quit after
            // the user makes a choice anyways.
          }
        },

        // "There was activity in.." messages have the actor 'systemuser'.
        a: m.actor_username === 'systemuser' ? undefined : {
          help: `View this user's profile, \x1b[34;1m${m.actor_username}\x1b[0m.`,
          longcodes: ['actor', 'profile'],
          action: async () => {
            await profiles.browse({rl, us, username: m.actor_username})
          }
        },

        p: m.project_id ? {
          help: `View this project, \x1b[33;1m${m.project_title || m.title}\x1b[0m.`,
          longcodes: ['project'],
          action: async () => {
            await projects.browse({rl, us, id: m.project_id})
          }
        } : undefined,

        s: m.gallery_id ? {
          help: `View this studio, \x1b[32;1m${m.gallery_title || m.title}\x1b[0m.`,
          longcodes: ['studio'],
          action: async () => {
            // TODO: Studio view.
            console.log('Err, sorry, studios aren\'t implemented yet! ' + util.smile())
            await new Promise(res => setTimeout(res, 800))
          }
        } : undefined,

        f: m.topic_id ? {
          help: `View this topic, \x1b[35;1m${m.topic_title}[x1b[0m.`,
          longcodes: ['forum', 'topic', 'thread'],
          action: async () => {
            // TODO: Forum view.
            console.log('Sorry, forum threads aren\'t implemented yet! ' + util.smile())
            await new Promise(res => setTimeout(res, 800))
          }
        } : undefined,

        g: m.comment_obj_id ? {
          help: `Go to where this comment was posted, ${
            m.comment_type === 0 ? `\x1b[33;1m${m.comment_obj_title}\x1b[0m` :
            m.comment_type === 1 ? `\x1b[34;1m${m.comment_obj_title}\x1b[0m's profile` :
            m.comment_type === 2 ? `\x1b[32;1m${m.comment_obj_title}\x1b[0m` :
            'sooomewhere in the muuuuuultiverse~'
          }\x1b[0m.`,
          longcodes: ['go'],
          action: async () => {
            if (m.comment_type === 0) {
              await projects.browse({rl, us, id: m.comment_obj_id})
            } else if (m.comment_type === 1) {
              await profiles.browse({rl, us, username: m.comment_obj_title})
            } else {
              await studios.browse({rl, us, id: m.comment_obj_id})
            }
          }
        } : undefined,

        c: m.comment_obj_id ? {
          help: 'View this comment.',
          longcodes: ['comment'],
          action: async () => {
            if (m.comment_type === 0) {
              await projects.browse({rl, us, id: m.comment_obj_id, jumpToComment: m.comment_id})
            } else if (m.comment_type === 1) {
              await profiles.browse({rl, us, username: m.comment_obj_title, jumpToComment: m.comment_id})
            } else {
              await studios.browse({rl, us, id: m.comment_obj_id, jumpToComment: m.comment_id})
            }
          }
        } : undefined
      })
    }
  })
}

function fetchMessages(username, token, pageNum = 1) {
  return fetch(`${util.urls.newAPI}/users/${username}/messages` +
    `?x-token=${token}` +
    `&limit=10` +
    `&offset=${10 * (pageNum - 1)}`).then(res => res.json())
}

function formatMessage({us}, m) {
  let eventStr = ''

  const actor = `\x1b[34;1m${m.actor_username}\x1b[0m`
  const project = `\x1b[33;1m${m.title}\x1b[0m`
  const project2 = `\x1b[33;1m${m.project_title}\x1b[0m`
  const studio = `\x1b[32;1m${m.title}\x1b[0m`
  const studio2 = `\x1b[32;1m${m.gallery_title}\x1b[0m`
  const topic = `\x1b[35;1m${m.topic_title}\x1b[0m`

  switch (m.type) {
    case 'loveproject': eventStr += `${actor} \x1b[31mloved your project ${project}\x1b[31m.\x1b[0m`; break
    case 'favoriteproject': eventStr += `${actor} \x1b[33mfavorited your project ${project2}\x1b[33m.\x1b[0m`; break
    case 'remixproject': eventStr += `${actor} \x1b[35mremixed your project ${project}\x1b[34m.\x1b[0m`; break

    case 'addcomment': {
      const text = m.comment_fragment
      eventStr += `${actor} \x1b[36mleft a comment`

      if (m.comment_type === 0) {
        eventStr += ` on \x1b[33;1m${m.comment_obj_title}\x1b[0m`
      } else if (m.comment_type === 1) {
        if (m.comment_obj_title === m.actor_username) {
          eventStr += ' on their profile'
        } else if (m.comment_obj_title === us.username) {
          eventStr += ' on your profile'
        } else {
          eventStr += ` on \x1b[34;1m${m.comment_obj_title}\x1b[0;36m's profile`
        }
      } else if (m.comment_type === 2) {
        eventStr += ` on \x1b[32;1m${m.comment_obj_title}\x1b[0m`
      }

      eventStr += '\x1b[36m:\x1b[0m "'
      if (text.length >= 40) {
        eventStr += `${text.slice(0, 40)}...`
      } else {
        eventStr += text
      }
      eventStr += '"'
      break
    }

    case 'followuser': eventStr += `${actor} \x1b[35mfollowed you.\x1b[0m`; break
    case 'curatorinvite': eventStr += `${actor} \x1b[32minvited you to ${studio}\x1b[32m.\x1b[0m`; break
    case 'becomeownerstudio': eventStr += `${actor} \x1b[32mpromoted you to a manager of ${studio2}\x1b[32m.\x1b[0m`; break
    case 'studioactivity': eventStr += `\x1b[32mThere was activity in ${studio}\x1b[32m.\x1b[0m`; break
    case 'forumpost': eventStr += `${actor} \x1b[35mmade a post in ${topic}\x1b[0m\x1b[35m.\x1b[0m`; break
    case 'userjoin': eventStr += `\x1b[39;1mWelcome to Scratch! \x1b[0;39mAfter you make projects and comments, you'll get messages about them here.\x1b[0m`; break

    default: eventStr += `Something along the lines of "${m.type}" happened.`
  }

  const date = new Date(m.datetime_created)
  eventStr += ` \x1b[2m(${util.timeAgo(date)})\x1b[0m`

  return eventStr
}
