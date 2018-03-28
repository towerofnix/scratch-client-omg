// Basically the same code as user-projects.js, but with some slight
// adjustments, because the project studio list isn't paginated.

'use strict'

const cheerio = require('cheerio')
const fetch = require('node-fetch')
const list = require('./list')
const studios = require('./studios')
const util = require('./util')

module.exports.browse = async function({rl, us, id, projectTitle}) {
  await list.browse({
    rl, us,
    items: await fetchProjectStudios(id),
    title: `\x1b[33;1m${projectTitle}'s\x1b[0;1m studios\x1b[0m`,
    formatItem: p => `\x1b[32m${p.name}\x1b[0m`,
    handleItem: async s => {
      await studios.browse({rl, us, id: s.id})
    }
  })
}

function fetchProjectStudios(id) {
  return fetch(`${util.urls.scratch}/projects/${id}/studios/`)
    .then(res => res.text())
    .then(html => parseProjectStudios(html))
}

function parseProjectStudios(html) {
  const $ = cheerio.load(html)

  return $('.gallery.thumb').map((i, projectEl) => {
    return {
      name: $(projectEl).find('.title a').text().trim(),
      id: parseInt($(projectEl).find('.title a').attr('href').match(/([0-9]+)/)[1])
    }
  }).get()
}
