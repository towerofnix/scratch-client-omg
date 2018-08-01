'use strict'

const fetch = require('node-fetch')
const npmCommandExists = require('command-exists')
const { spawn } = require('child_process')
const homepage = require('./homepage')
const messages = require('./messages')
const profiles = require('./profiles')
const projects = require('./projects')
const studios = require('./studios')

module.exports.urls = {}
module.exports.urls.scratch = 'https://scratch.mit.edu'
module.exports.urls.siteAPI = 'https://scratch.mit.edu/site-api'
module.exports.urls.newAPI = 'https://api.scratch.mit.edu'
module.exports.urls.cdn2 = 'http://cdn2.scratch.mit.edu' // HTTP because ImageMagick doesn't like HTTPS :(
module.exports.urls.projectThumb = id => `${module.exports.urls.cdn2}/get_image/project/${id}_480x360.png`
module.exports.urls.studioThumb = id => `${module.exports.urls.cdn2}/get_image/gallery/${id}_510x300.png`
module.exports.urls.userThumb = id => `${module.exports.urls.cdn2}/get_image/user/${id}_400x400.png`

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

const commandCache = {}
module.exports.commandExists = async function commandExists(command) {
  // When the command-exists module sees that a given command doesn't exist, it
  // throws an error instead of returning false, which is not what we want.

  if (!(command in commandCache)) {
    try {
      commandCache[command] = await npmCommandExists(command)
    } catch(err) {
      commandCache[command] = false
    }
  }

  return commandCache[command]
}

module.exports.canShowImages = function() {
  // Async!
  return module.exports.commandExists('display')
}

module.exports.showImage = async function(url) {
  if (await module.exports.canShowImages()) {
    console.log('Opening image:', url)
    spawn('display', [url])
  } else {
    console.log('View the image here:', url)
  }
}

module.exports.prompt = function(rl, question = 'prompt: ', defaultValue = '') {
  return new Promise(resolve => {
    rl.question(`\x1b[35;1m${question}\x1b[0m`, answer => {
      resolve(answer)
    })

    if (defaultValue) {
      rl.write(defaultValue)
    }
  })
}

module.exports.confirm = async function(rl, question = 'confirm: ') {
  const response = await module.exports.prompt(rl, question)
  return ['yes', 'y'].includes(response.toLowerCase())
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

    h: {
      help: 'Go to the homepage.',
      longcodes: ['home', 'homepage'],
      action: () => homepage.browse({rl, us})
    },

    u: {
      help: 'Browse a \x1b[34;1muser\x1b[0m by entering their username.',
      longcodes: ['user', 'profile'],
      action: async () => {
        const username = await module.exports.prompt(rl, 'Username? ')
        if (username) {
          await profiles.browse({rl, us, username})
        }
      }
    },

    p: {
      help: 'Browse a \x1b[33;1mproject\x1b[0m by entering its ID.',
      longcodes: ['project'],
      action: async () => {
        const id = await module.exports.prompt(rl, 'Project ID? ')
        if (id) {
          await projects.browse({rl, us, id})
        }
      }
    },

    s: {
      help: 'Browse a \x1b[32;1mstudio\x1b[0m by entering its ID.',
      longcodes: ['studio'],
      action: async () => {
        const id = await module.exports.prompt(rl, 'Studio ID? ')
        if (id) {
          await studios.browse({rl, us, id})
        }
      }
    },

    m: {
      help: 'View your messages.',
      longcodes: ['messages'],
      action: () => messages.browse({rl, us})
    }
  })
}

module.exports.getSessionData = function(us) {
  return fetch(module.exports.urls.scratch + '/session', {
    headers: {
      'Cookie': `scratchsessionsid=${us.sessionId}`,
      'X-Requested-With': 'XMLHttpRequest'
    }
  }).then(res => res.json())
}

module.exports.getAuthToken = function(us) {
  if (us.authToken) {
    return us.authToken
  }

  return module.exports.getSessionData(us).then(obj => {
    return (us.authToken = obj.user.token)
  })
}

module.exports.makeFetchHeaders = function(us) {
  return {
    'Cookie': `scratchsessionsid=${us.sessionId}; scratchcsrftoken=a;`,
    'X-CSRFToken': 'a',
    'referer': 'https://scratch.mit.edu'
  }
}

module.exports.prettyFetch = async function({
  ing = 'Updating', ed = 'Updated',
  success = 200
}, ...fetchArgs) {
  process.stdout.write('Updating...')
  const res = await fetch(...fetchArgs)
  if (res.status === success) {
    console.log(' \x1b[32mUpdated!\x1b[0m')
    return true
  } else {
    console.log(' \x1b[31mFailed, sorry.\x1b[0m')
    return false
  }
}

module.exports.delay = function(ms = 800) {
  return new Promise(res => setTimeout(res, ms))
}

module.exports.delay.notFound = 1600
