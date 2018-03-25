'use strict'

const cheerio = require('cheerio')
const fetch = require('node-fetch')
const comments = require('./comments')
const pagedList = require('./paged-list')
const profiles = require('./profiles')
const projects = require('./projects')
const util = require('./util')

module.exports.browse = async function({rl, us, id}) {
  const studio = await fetchStudio(id)

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

      c: {
        help: 'Browse comments.',
        longcodes: ['comments'],
        action: async () => {
          await comments.browse({rl, us, pageType: 'gallery', pageId: id})
        }
      }
    })
  }
}

function fetchStudio(id) {
  return fetch(`${util.urls.scratch}/studios/${id}`)
    .then(res => res.text())
    .then(html => parseStudio(html))
}

function parseStudio(html) {
  const $ = cheerio.load(html)

  return {
    title: $('h2').text(),
    description: $('#description .overview').text().trim(),
    projectCount: $('span[data-count=projects]').text() // This is a string!
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
