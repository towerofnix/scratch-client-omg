'use strict'

const readline = require('readline')
const Scratch = require('scratch-api')

const profiles = require('../lib/profiles')
const projects = require('../lib/projects')
const messages = require('../lib/messages')

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

  const rl = readline.createInterface({
    input: process.stdin, output: process.stdout
  })

  if (process.argv[2] === 'messages') {
    await messages.browse({rl, us})
  } else {
    const pageId = process.argv[2] || us.username
    const pageType = process.argv[3] || 'user'
    if (pageType === 'user') {
      await profiles.browse({rl, us}, await profiles.get(pageId))
    } else if (pageType === 'project') {
      await projects.browse({rl, us}, await projects.get(pageId))
    }
  }

  rl.close()
}

if (require.main === module) {
  module.exports.main().catch(err => console.error(err))
}
