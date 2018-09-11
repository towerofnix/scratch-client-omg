#!/usr/bin/env node

'use strict'

const fs = require('fs')
const readline = require('readline')
const Scratch = require('scratch-api')
const homepage = require('../lib/homepage')
const messages = require('../lib/messages')
const profiles = require('../lib/profiles')
const projects = require('../lib/projects')
const studios = require('../lib/studios')
const util = require('../lib/util')

const { promisify } = require('util')
const writeFile = promisify(fs.writeFile)

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
    } else if (err.message.toLowerCase().startsWith('incorrect')) {
      console.log('Sorry, that\'s not the right username or password. Re-run and try again?')
      return
    } else {
      throw err
    }
  }

  console.log(`\x1b[1mYou are logged in as \x1b[34;1m${us.username}\x1b[0;1m.\x1b[0m`)

  const rl = readline.createInterface({
    input: process.stdin, output: process.stdout
  })

  if (process.argv[2] === 'messages') {
    await messages.browse({rl, us})
  } else if (process.argv[2] === 'debug' && process.argv[3] === 'really') {
    const file = '/tmp/' + Math.random() + '.txt'
    await writeFile(file, await util.getAuthToken(us))
    console.log('Auth token:', file)
  } else if (process.argv[2]) {
    const pageId = process.argv[2] || us.username
    const pageType = process.argv[3] || 'user'
    if (pageType === 'user') {
      await profiles.browse({rl, us, username: pageId})
    } else if (pageType === 'project') {
      await projects.browse({rl, us, id: pageId})
    } else if (pageType === 'studio') {
      await studios.browse({rl, us, id: pageId})
    }
  } else {
    await homepage.browse({rl, us})
  }

  rl.close()
}

if (require.main === module) {
  module.exports.main().catch(err => console.error(err))
}
