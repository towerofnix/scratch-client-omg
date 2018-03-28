'use strict'

const cheerio = require('cheerio')
const fetch = require('node-fetch')
const list = require('./list')
const pagedList = require('./paged-list')
const projects = require('./projects')
const util = require('./util')

module.exports.browsePaged = async function({rl, us, urlPart, title, handleItem, formatItem}) {
  const { pageCount, totalCount } = await fetchThumbs(urlPart)
  await pagedList.browse({
    rl, us, handleItem, formatItem, pageCount,
    title: `${title} (${totalCount})`,
    getItems: async n => (await fetchThumbs(urlPart, n)).items
  })
}

module.exports.browseUnpaged = async function({rl, us, urlPart, title, handleItem, formatItem}) {
  const { totalCount } = await fetchThumbs(urlPart)
  await list.browse({
    rl, us, handleItem, formatItem,
    title: `${title} (${totalCount})`,
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

  let totalCount = $('h2').text().trim().match(/([0-9]+)\)$/)
  totalCount = totalCount ? totalCount[1] : $('.thumb').length
  return {
    items: $('.thumb').map((i, thumbEl) => {
      return {
        title: $(thumbEl).find('.title a').text().trim(),
        href: $(thumbEl).find('.title a').attr('href')
      }
    }).get(),
    pageCount: $('.page-links').length ? parseInt($('.page-current').last().text().trim()) : 1,
    totalCount
  }
}
