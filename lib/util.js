'use strict'

const fetch = require('node-fetch')

const profiles = require('./profiles')
const projects = require('./projects')
const messages = require('./messages')

module.exports.urls = {}
module.exports.urls.scratch = 'https://scratch.mit.edu'
module.exports.urls.siteAPI = 'https://scratch.mit.edu/site-api'
module.exports.urls.newAPI = 'https://api.scratch.mit.edu'

module.exports.clearBlankProperties = function(obj) {
  const newObj = Object.assign({}, obj)

  for (const [ prop, value ] of Object.entries(newObj)) {
    if (typeof value === 'undefined') {
      delete newObj[prop]
    }
  }

  return newObj
}

module.exports.trimWhitespace = function(string) {
  return string.split('\n').map(str => str.trim()).filter(Boolean).join(' ')
}

// :)
let smileSize = 1

module.exports.smile = function() {
  return ':' + ')'.repeat(smileSize++)
}

module.exports.timeAgo = function(date) {
  const now = Date.now()
  const diff = now - date

  const second = 1000
  const minute = 60 * second
  const hour = 60 * minute
  const day = 24 * hour

  const days = Math.floor(diff / day)
  const hours = Math.floor((diff % day) / hour)
  const minutes = Math.floor((diff % hour) / minute)
  const seconds = Math.floor((diff % minute) / second)

  let str
  if (days) {
    str = days + ' day'
    if (days > 1) {
      str += 's'
    }
  } else if (hours) {
    str = hours + 'h'
    if (minutes) {
      str += ', ' + minutes + 'm'
    }
  } else if (minutes) {
    str = minutes + 'm'
    if (seconds) {
      str += ', ' + seconds + 's'
    }
  } else {
    return 'now'
  }
  str += ' ago'
  return str
}

module.exports.prompt = function(rl, question = 'prompt: ') {
  return new Promise(resolve => {
    rl.question(question, answer => {
      resolve(answer)
    })
  })
}

module.exports.choose = function({rl, us}, choiceDict) {
  if (!('#' in choiceDict)) {
    choiceDict['#'] = {
      help: 'Menu - go somewhere or do something.',
      longcodes: ['menu'],
      action: () => showGlobalMenu({rl, us})
    }
  }

  choiceDict = module.exports.clearBlankProperties(choiceDict)

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

async function showGlobalMenu({rl, us}) {
  await module.exports.choose({rl, us}, {
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
        const username = await module.exports.prompt(rl, 'Username? ')
        if (username) {
          await profiles.browse({rl, us}, await profiles.get(username))
        }
      }
    },
    p: {
      help: 'Browse a project by entering its ID.',
      longcodes: ['project'],
      action: async () => {
        const id = await module.exports.prompt(rl, 'Project ID? ')
        if (id) {
          await projects.browse({rl, us}, await projects.get(id))
        }
      }
    },
    m: {
      help: 'View your messages.',
      longcodes: ['messages'],
      action: async () => {
        await messages.browse({rl, us})
      }
    }
  })
}

module.exports.getSessionData = function(us) {
  return fetch(module.exports.urls.scratch + '/session', {
    headers: {
      'Cookie': `scratchsessionsid=${us.sessionId}`
    }
  }).then(res => res.json())
}

module.exports.getAuthToken = function(us) {
  return module.exports.getSessionData(us)
    .then(obj => obj.user.token)
}
