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
    console.log(`\x1b[2m${project.isRemix ? 'Remixed' : 'Created'} by ${project.author}; id: ${id}\x1b[0m`)
    if (project.isRemix) {
      console.log(`\x1b[2mOriginal project: \x1b[33;2m${project.originalProject.title}\x1b[0m`)
    }

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

      O: project.isRemix ? {
        help: `View the project this was remixed from, \x1b[33;1m${project.originalProject.title}\x1b[0m.`,
        longcodes: ['original'],
        action: async () => {
          await module.exports.browse({rl, us, id: project.originalProject.id})
        }
      } : undefined,

      N: (project.instructions || project.notesAndCredits) ? {
        help: 'View instructions and notes/credits.',
        longcodes: ['notes', 'credits', 'instructions'],
        action: showNotes
      } : undefined,

      a: {
        help: `Visit the author of this project, \x1b[34;1m${project.author}\x1b[0m.`,
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

  const project = {
    title: $('#title').text(),
    author: $('#owner').text(),
    instructions: $('#instructions .overview').text().trim(),
    notesAndCredits: $('#description .overview').text().trim(),
    isRemix: !!$('.attribute').length
  }

  if (project.isRemix) {
    project.originalProject = {
      id: $('.attribute a').attr('href').match(/[0-9]+/)[0],
      title: $('.attribute a').text().trim(),
      author: $('.text:has(> .attribute) > a').attr('href').match(/\/users\/([^\/]+)\//)[1]
    }
  }

  return project
}
