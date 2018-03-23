'use strict'

const cheerio = require('cheerio')
const fetch = require('node-fetch')
const pagedList = require('./paged-list')
const projects = require('./projects')
const util = require('./util')

module.exports.browse = async function({rl, us}, username) {
  await pagedList.browse({
    rl, us,
    getItems: async n => (await module.exports.get(username, n)).projects,
    title: `\x1b[34;1m${username}'s\x1b[0;1m projects\x1b[0m`,
    formatItem: p => `\x1b[33m${p.name}\x1b[0m`,
    pageCount: (await module.exports.get(username)).pageCount,
    handleItem: async p => {
      await projects.browse({rl, us}, await projects.get(p.id))
    }
  })
}

module.exports.get = function(username, pageNumber = 1) {
  return fetch(`${util.urls.scratch}/users/${username}/projects/?page=${pageNumber}`)
    .then(res => res.text())
    .then(html => parseUserProjects(html))
}

function parseUserProjects(html) {
  const $ = cheerio.load(html)

  return {
    projects: $('.project.thumb').map((i, projectEl) => {
      return {
        name: $(projectEl).find('.title a').text(),
        id: parseInt($(projectEl).find('.title a').attr('href').match(/([0-9]+)/)[1])
      }
    }).get(),
    pageCount: $('.page-links').length ? parseInt($('.page-current').last().text().trim()) : 1
  }
}
