'use strict'

const cheerio = require('cheerio')
const fetch = require('node-fetch')
const comments = require('./comments')
const profiles = require('./profiles')
const projectStudios = require('./project-studios')
const util = require('./util')

module.exports.browse = async function({rl, us, id}) {
  const project = await fetchProject(id, us)

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

    let header = `\x1b[2m${project.isRemix ? 'Remixed' : 'Created'}`
    header += ` by \x1b[34;2;1m${project.author}\x1b[0;2m; id: ${id}`
    if (project.tags.length) {
      header += `; tagged ${project.tags.map(t => `"${t}"`).join(', ')}`
    }
    header += '\x1b[0m'
    console.log(header)
    if (project.isRemix) {
      console.log(`\x1b[2mOriginal project: \x1b[33;2;1m${project.originalProject.title}\x1b[0m`)
    }

    console.log(`\x1b[31mLove-its: ${project.loves}  \x1b[33mFavorites: ${project.favorites}\x1b[0m`)

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

      I: {
        help: 'View the thumbnail of this project.',
        longcodes: ['image', 'thumbnail', 'thumb'],
        action: async () => {
          await util.showImage(util.urls.projectThumb(id))
        }
      },

      N: (project.instructions || project.notesAndCredits) ? {
        help: 'View instructions and notes/credits.',
        longcodes: ['notes', 'credits', 'instructions'],
        action: showNotes
      } : undefined,

      S: project.studioCount ? {
        help: 'Browse studios this project is in.',
        longcodes: ['studios'],
        action: async () => {
          await projectStudios.browse({rl, us, id, projectTitle: project.title})
        }
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
          await comments.browse({rl, us, pageType: 'project', pageId: id, pageObj: project})
        }
      },

      // TODO: These are commented out for now; Scratch is responding lots and lots
      // of 403 Forbidden errors. I have no idea why, since equivalent curls work
      // just fine. Nothing in node-fetch seems like it would have an effect either.
      // Anyways, the 403 error also happens with browser fetch.
      /*
      l: project.weLovedIt ? undefined : {
        help: 'Leave a love-it.',
        longcodes: ['love'],
        action: async () => {
          await fetch(`${util.urls.siteAPI}/users/lovers/${id}/add/?usernames=${us.username}`, {
            method: 'PUT',
            headers: util.makeFetchHeaders(us)
          })

          project.loves++
          project.weLovedIt = true
        }
      },

      L: project.weLovedIt ? {
        help: 'Remove your love-it.',
        longcodes: ['unlove'],
        action: async () => {
          await fetch(`${util.urls.siteAPI}/users/lovers/${id}/remove/?usernames=${us.username}`, {
            method: 'PUT',
            headers: util.makeFetchHeaders(us)
          })

          project.loves--
          project.weLovedIt = false
        }
      } : undefined,

      f: project.weFavedIt ? undefined : {
        help: 'Leave a favorite.',
        longcodes: ['favorite', 'fave'],
        action: async () => {
          await fetch(`${util.urls.siteAPI}/users/favoriters/${id}/add/?usernames=${us.username}`, {
            method: 'PUT',
            headers: util.makeFetchHeaders(us)
          })

          project.favorites++
          project.weFavedIt = true
        }
      },

      F: project.weFavedIt ? {
        help: 'Remove your favorite.',
        longcodes: ['unfave', 'unfavorite'],
        action: async () => {
          await fetch(`${util.urls.siteAPI}/users/favoriters/${id}/remove/?usernames=${us.username}`, {
            method: 'PUT',
            headers: util.makeFetchHeaders(us)
          })

          project.favorites--
          project.weFavedIt = false
        }
      } : undefined
      */
    })
  }
}

function fetchProject(id, us) {
  return fetch(`${util.urls.scratch}/projects/${id}`, {
    headers: util.makeFetchHeaders(us)
  }).then(res => res.text())
    .then(html => parseProject(html))
}

function parseProject(html) {
  const $ = cheerio.load(html)

  const project = {
    title: $('#title').text().trim() || $('#title input').attr('value'),
    author: $('#owner').text(),
    instructions: $('#instructions .overview').text().trim() || $('[name=instructions]').text(),
    notesAndCredits: $('#description .overview').text().trim() || $('[name=description]').text(),
    loves: $('[data-content=love-count]').text().trim(),
    favorites: $('[data-content=fav-count]').text().trim(),
    weLovedIt: $('[data-content=love-count]').attr('data-add') === 'false',
    weFavedIt: $('[data-content=fav-count]').attr('data-add') === 'false',
    tags: $('#project-tags .tag a').map((i, tagElement) => {
      return $(tagElement).text()
    }).get(),
    isRemix: !!$('.attribute').length
  }

  const studioText = $('#galleries h4').text()
  if (studioText) {
    project.studioCount = parseInt(studioText.match(/[0-9]+/)[0])
  } else {
    project.studioCount = 0
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
