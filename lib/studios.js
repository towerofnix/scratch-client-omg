'use strict'

const cheerio = require('cheerio')
const fetch = require('node-fetch')
const comments = require('./comments')
const pagedList = require('./paged-list')
const profiles = require('./profiles')
const projects = require('./projects')
const util = require('./util')

module.exports.browse = async function({rl, us, id, jumpToComment = null}) {
  const studio = await fetchStudio(id, us)

  let quit = false, firstTime = true

  const showDescription = function() {
    if (studio.description) {
      console.log('\x1b[1mDescription:\x1b[0m')
      console.log(studio.description)
      console.log('')
    }
  }

  const showManagers = function() {
    return showMembers({rl, us, fetchMembers: fetchManagers, categoryString: 'managers'})
  }

  const showCurators = function() {
    return showMembers({rl, us, fetchMembers: fetchCurators, categoryString: 'curators'})
  }

  const showMembers = function({rl, us, fetchMembers, categoryString}) {
    return pagedList.browse({
      rl, us,
      getItems: n => fetchMembers(id, n),
      title: `\x1b[32;1m${studio.title}\x1b[0;1m's ${categoryString}\x1b[0m`,
      formatItem: m => `\x1b[34;1m${m.username}\x1b[0m`,
      handleItem: async m => {
        await profiles.browse({rl, us, username: m.username})
      }
    })
  }

  const showProjects = function() {
    return pagedList.browse({
      rl, us,
      getItems: n => fetchProjects(id, n),
      title: `\x1b[32;1m${studio.title}\x1b[0;1m's projects\x1b[0m`,
      formatItem: m => `\x1b[33;1m${m.name}\x1b[0m (by \x1b[34;1m${m.author}\x1b[0m)`,
      handleItem: async p => {
        await projects.browse({rl, us, id: p.id})
      }
    })
  }

  const showActivity = function() {
    return pagedList.browse({
      rl, us,
      getItems: n => fetchActivity(id, n),
      title: `Activity in \x1b[32;1m${studio.title}\x1b[0m`,
      formatItem: a => formatActivity(a),
      pageCount: 10, // Activity is only kept for 10 pages.

      handleItem: async a => {
        console.log(formatActivity(a))
        await util.choose({rl, us}, {
          q: {
            help: 'Quit browsing this activity.',
            longcodes: ['quit', 'back'],
            action: () => {}
          },

          a: {
            help: `View this user's profile, \x1b[34;1m${a.actor}\x1b[0m.`,
            longcodes: ['actor'],
            action: async () => {
              await profiles.browse({rl, us, username: a.actor})
            }
          },

          p: a.what.href.startsWith('/projects/') ? {
            help: `View this project, \x1b[33;1m${a.what.title}\x1b[0m.`,
            longcodes: ['project'],
            action: async () => {
              await projects.browse({rl, us, id: a.what.href.match(/[0-9]+/)[0]})
            }
          } : undefined,

          o: (a.what.href.startsWith('/users/') && a.what.title !== a.actor) ? {
            help: `View the other user's profile, \x1b[34;1m${a.what.title}\x1b[0m.`,
            longcodes: ['other'],
            action: async () => {
              await profiles.browse({rl, us, username: a.what.title})
            }
          } : undefined,

          c: a.did === 'left a' ? {
            help: 'View this comment.',
            longcodes: ['comment'],
            action: async () => {
              await showComments(a.what.href.match(/[0-9]+$/)[0])
            }
          } : undefined
        })
      }
    })
  }

  const showComments = function(jumpTo = null) {
    return comments.browse({rl, us, pageType: 'gallery', pageId: id, pageObj: studio, jumpTo})
  }

  if (jumpToComment) {
    return showComments(jumpToComment)
  }

  while (!quit) {
    console.log(`\x1b[32;1m${studio.title}\x1b[0m`)
    console.log(`\x1b[2mContains ${
      studio.projectCount === '0' ? 'no projects' :
      studio.projectCount === '1' ? '1 project' :
      `${studio.projectCount} projects`
    }\x1b[0m`)

    if (firstTime) {
      console.log('')
      showDescription()
      firstTime = false
    }

    await util.choose({rl, us}, {
      q: {
        help: 'Quit browsing this studio.',
        longcodes: ['quit', 'back'],
        action: () => {
          quit = true
        }
      },

      I: {
        help: 'View the thumbnail of this studio.',
        longcodes: ['image', 'thumbnail', 'thumb'],
        action: async () => {
          await util.showImage(util.urls.studioThumb(id))
        }
      },

      D: studio.description ? {
        help: 'View the studio description.',
        longcodes: ['description'],
        action: showDescription
      } : undefined,

      M: {
        help: 'View managers of this studio.',
        longcodes: ['managers', 'owners'],
        action: showManagers
      },

      C: {
        help: 'View curators of this studio.',
        longcodes: ['curators'],
        action: showCurators
      },

      P: parseInt(studio.projectCount) ? {
        help: 'View projects in this studio.',
        longcodes: ['projects'],
        action: showProjects
      } : undefined,

      A: {
        help: 'View activity in this studio.',
        longcodes: ['activity'],
        action: showActivity
      },

      c: {
        help: 'Browse comments.',
        longcodes: ['comments'],
        action: showComments
      }
    })
  }
}

function fetchStudio(id, us) {
  return fetch(`${util.urls.scratch}/studios/${id}`, {
    headers: util.makeFetchHeaders(us)
  }).then(res => res.text())
    .then(html => parseStudio(html))
}

function parseStudio(html) {
  const $ = cheerio.load(html)

  const scripts = $('script').map((i, scriptEl) => $(scriptEl).html()).get()

  return {
    title: $('h2').text(),
    description: $('#description .overview').text().trim(),
    projectCount: $('span[data-count=projects]').text(), // This is a string!
    areWeAnOwner: scripts.some(str => str.match(/Scratch\.INIT_DATA\.GALLERY = \{[\s\S]*?is_owner: true/))
  }
}

function fetchManagers(id, pageNumber = 1) {
  return fetch(`${util.urls.siteAPI}/users/owners-in/${id}/${pageNumber}/`)
    .then(res => res.text())
    .then(html => parseMembers(html))
}

function fetchCurators(id, pageNumber = 1) {
  return fetch(`${util.urls.siteAPI}/users/curators-in/${id}/${pageNumber}/`)
    .then(res => res.text())
    .then(html => parseMembers(html))
}

function parseMembers(html) {
  const $ = cheerio.load(html)

  if ($('#page-404').length) {
    return []
  }

  return $('li').map((i, memberEl) => {
    return {
      username: $(memberEl).find('.title a').text()
    }
  }).get()
}

function fetchProjects(id, pageNumber = 1) {
  return fetch(`${util.urls.siteAPI}/projects/in/${id}/${pageNumber}/`)
    .then(res => res.text())
    .then(html => parseProjects(html))
}

function parseProjects(html) {
  const $ = cheerio.load(html)

  if ($('#page-404').length) {
    return []
  }

  return $('li').map((i, projectEl) => {
    return {
      name: $(projectEl).find('.title a').text(),
      author: $(projectEl).find('.owner a').text(),
      id: $(projectEl).find('.title a').attr('href').match(/[0-9]+/)[0]
    }
  }).get()
}

function fetchActivity(id, pageNumber = 1) {
  return fetch(`${util.urls.scratch}/studios/${id}/activity/${pageNumber}/`)
    .then(res => res.text())
    .then(html => parseActivity(html))
}

function parseActivity(html) {
  const $ = cheerio.load(html)

  if ($('#page-404').length) {
    return []
  }

  return $('#tabs-content li').map((i, activityEl) => {
    return {
      actor: $(activityEl).find('a').first().text(),
      did: $(activityEl).contents().filter((i, x) => x.nodeType === 3).text().trim(),
      what: {
        title: $(activityEl).find('a').last().text(),
        href: $(activityEl).find('a').last().attr('href')
      }
    }
  }).get()
}

function formatActivity(a) {
  let text = ''
  text += `\x1b[34;1m${a.actor}\x1b[0m `

  if (['added the project', 'removed the project'].includes(a.did)) {
    text += a.did
    text += ` \x1b[33;1m${a.what.title}\x1b[0m`
  } else if (a.did.startsWith('was promoted to manager')) {
    text += 'was promoted to manager by'
    text += ` \x1b[34;1m${a.what.title}\x1b[0m`
  } else if (a.did.startsWith('accepted')) {
    text += 'accepted an invitation from'
    text += ` \x1b[34;1m${a.what.title}\x1b[0m`
  } else if (a.did.startsWith('made edits to title or')) {
    text += a.did
  } else if (a.did === 'left a') {
    text += 'left a comment'
  }

  return text
}
