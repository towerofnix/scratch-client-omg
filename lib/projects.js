'use strict'

const cheerio = require('cheerio')
const fetch = require('node-fetch')
const comments = require('./comments')
const profiles = require('./profiles')
const studios = require('./studios')
const thumbs = require('./thumbs')
const util = require('./util')

module.exports.browse = async function({rl, us, id, jumpToComment = null}) {
  const project = await fetchProject(id, us)

  if (project.notFound) {
    console.log('\x1b[31mThat project couldn\'t be found, sorry. It might have been unshared.\x1b[0m')
    return util.delay(util.delay.notFound)
  }

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

  const showComments = function(jumpTo = null) {
    return comments.browse({
      rl, us, pageType: 'project', pageId: id, pageObj: project, jumpTo,
      commentsEnabled: project.commentsEnabled
    })
  }

  if (jumpToComment) {
    return showComments(jumpToComment)
  }

  let quit = false, firstTime = true
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
          await thumbs.browseUnpaged({
            rl, us,
            urlPart: `/projects/${id}/studios/`,
            title: `\x1b[33;1m${project.title}'s\x1b[0;1m studios\x1b[0m`,
            formatItem: s => `\x1b[32m${s.title}\x1b[0m`,
            handleItem: s => studios.browse({rl, us, id: s.id})
          })
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
        action: () => showComments()
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
  return fetch(`${util.urls.newAPI}/projects/${id}`)
    .then(res => res.json())
    .then(data => {
      if (data.code === 'NotFound') {
        return {notFound: true}
      }

      const project = {
        title: data.title,
        author: data.author.username,
        instructions: data.instructions,
        notesAndCredits: data.description,
        loves: data.stats.loves,
        favorites: data.stats.favorites,
        // TODO: tags
        isRemix: !!data.remix.parent,
        // TODO: commentsEnabled
      }

      const loadInteractStatus = (endpoint, projectKey, dataKey) => {
        return util.getAuthToken(us)
          .then(token => fetch(`${util.urls.newAPI}/projects/${id}/${endpoint}/user/${us.username}?x-token=${token}`))
          .then(res => res.json())
          .then(data => {
            project[projectKey] = data[dataKey]
          })
      }

      let unshared = false

      return Promise.all([
        loadInteractStatus('loves', 'weLovedIt', 'userLove'),
        loadInteractStatus('favorites', 'weFavedIt', 'userFavorite'),
        fetchExtraProjectData(id, us).then(data => {
          if (data.notFound) {
            unshared = true
          } else {
            Object.assign(project, data)
          }
        })
      ]).then(() => unshared ? {notFound: true} : project)
    })
}

function fetchExtraProjectData(id, us) {
  return fetch(`${util.urls.scratch}/projects/${id}`, {
    headers: util.makeFetchHeaders(us)
  }).then(res => res.text())
    .then(html => parseProject(html))
}

function parseProject(html) {
  const $ = cheerio.load(html)

  if ($('#page-404').length) {
    return {notFound: true}
  }

  const project = {
    tags: $('#project-tags .tag a').map((i, tagElement) => {
      return $(tagElement).text()
    }).get(),
    commentsEnabled: !$('.comments-off').length
  }

  // TODO: Move to new API
  const studioText = $('#galleries h4').text()
  if (studioText) {
    project.studioCount = parseInt(studioText.match(/[0-9]+/)[0])
  } else {
    project.studioCount = 0
  }

  // TODO: Move to new API
  const isRemix = $('.attribute').length
  if (isRemix) {
    project.originalProject = {
      id: $('.attribute a').attr('href').match(/[0-9]+/)[0],
      title: $('.attribute a').text().trim(),
      author: $('.text:has(> .attribute) > a').attr('href').match(/\/users\/([^\/]+)\//)[1]
    }
  }

  return project
}
