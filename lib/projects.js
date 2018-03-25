'use strict'

const cheerio = require('cheerio')
const fetch = require('node-fetch')
const comments = require('./comments')
const profiles = require('./profiles')
const util = require('./util')

module.exports.browse = async function({rl, us, id}) {
  const project = await fetchProject(id)

  let quit = false, firstTime = true

  const showNotes = function() {
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
    console.log(`\x1b[33;1m${project.title}\x1b[0m`)
    console.log(`\x1b[2mby ${project.author}; id: ${id}\x1b[0m`)

    if (firstTime) {
      console.log('')
      showNotes()
      firstTime = false
    }

    await util.choose({rl, us}, {
      q: {
        help: 'Quit browsing this project.',
        longcodes: ['quit', 'back'],
        action: () => {
          quit = true
        }
      },

      N: (project.instructions || project.notesAndCredits) ? {
        help: 'View instructions and notes/credits.',
        longcodes: ['instructions', 'notes', 'credits'],
        action: showNotes
      } : undefined,

      a: {
        help: 'Browse the profile of the author of this project.',
        longcodes: ['author', 'profile'],
        action: async () => {
          await profiles.browse({rl, us, username: project.author})
        }
      },

      c: {
        help: 'Browse comments.',
        longcodes: ['comments'],
        action: async () => {
          await comments.browse({rl, us, pageType: 'project', pageId: id})
        }
      }
    })
  }
}

function fetchProject(id) {
  return fetch(`${util.urls.scratch}/projects/${id}`)
    .then(res => res.text())
    .then(html => parseProject(html))
}

function parseProject(html) {
  const $ = cheerio.load(html)

  return {
    title: $('#title').text(),
    author: $('#owner').text(),
    instructions: $('#instructions .overview').text().trim(),
    notesAndCredits: $('#description .overview').text().trim()
  }
}
