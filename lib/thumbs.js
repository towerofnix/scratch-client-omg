'use strict'

const cheerio = require('cheerio')
const fetch = require('node-fetch')
const list = require('./list')
const pagedList = require('./paged-list')
const projects = require('./projects')
const util = require('./util')

module.exports.browsePaged = async function({rl, us, urlPart, title, handleItem, formatItem}) {
  await pagedList.browse({
    rl, us, title, handleItem, formatItem,
    getItems: async n => (await fetchThumbs(urlPart, n)).items,
    pageCount: (await fetchThumbs(urlPart)).pageCount
  })
}

module.exports.browseUnpaged = async function({rl, us, urlPart, title, handleItem, formatItem}) {
  await list.browse({
    rl, us, title, handleItem, formatItem,
    items: (await fetchThumbs(urlPart)).items,
  })
}

function fetchThumbs(urlPart, pageNumber = 1) {
  return fetch(`${util.urls.scratch}${urlPart}?page=${pageNumber}`)
    .then(res => res.text())
    .then(html => parseThumbs(html))
}

function parseThumbs(html) {
  const $ = cheerio.load(html)

  return {
    items: $('.thumb').map((i, thumbEl) => {
      return {
        title: $(thumbEl).find('.title a').text().trim(),
        href: $(thumbEl).find('.title a').attr('href')
      }
    }).get(),
    pageCount: $('.page-links').length ? parseInt($('.page-current').last().text().trim()) : 1
  }
}
