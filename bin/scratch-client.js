'use strict'

const readline = require('readline')
const Scratch = require('scratch-api')
const messages = require('../lib/messages')
const profiles = require('../lib/profiles')
const projects = require('../lib/projects')
const studios = require('../lib/studios')

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

module.exports.main = async function() {
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

  console.log(`\x1b[1mYou are logged in as \x1b[34;1m${us.username}\x1b[0;1m.`)

  const rl = readline.createInterface({
    input: process.stdin, output: process.stdout
  })

  if (process.argv[2] === 'messages') {
    await messages.browse({rl, us})
  } else {
    const pageId = process.argv[2] || us.username
    const pageType = process.argv[3] || 'user'
    if (pageType === 'user') {
      await profiles.browse({rl, us, username: pageId})
    } else if (pageType === 'project') {
      await projects.browse({rl, us, id: pageId})
    } else if (pageType === 'studio') {
      await studios.browse({rl, us, id: pageId})
    }
  }

  rl.close()
}

if (require.main === module) {
  module.exports.main().catch(err => console.error(err))
}
