'use strict'

const cheerio = require('cheerio')
const fetch = require('node-fetch')
const comments = require('./comments')
const pagedList = require('./paged-list')
const projects = require('./projects')
const studios = require('./studios')
const thumbs = require('./thumbs')
const util = require('./util')

module.exports.browse = async function({rl, us, username, jumpToComment}) {
  const profile = await fetchProfile(username)

  if (profile.notFound) {
    console.log('\x1b[31mThat user profile couldn\'t be found, sorry.\x1b[0m')
    return util.delay(util.delay.notFound)
  }

  const updateDescription = async function({promptStr, property, apiProperty}) {
    const newValue = await util.prompt(rl, promptStr, profile[property])
    if (newValue.length > 200) {
      console.log('Sorry, this is limited to 200 characters.')
      return
    }

    if (newValue !== profile.aboutMe) {
      if (await util.prettyFetch({}, `${util.urls.siteAPI}/users/all/${profile.username}/`, {
        method: 'PUT',
        body: JSON.stringify({
          [apiProperty]: newValue
        }),
        headers: util.makeFetchHeaders(us)
      })) {
        profile[property] = newValue
      }
    }
  }

  const showComments = async function(jumpTo = null) {
    await comments.browse({
      rl, us, pageType: 'user', pageId: profile.username, jumpTo,
      commentsEnabled: profile.commentsEnabled
    })
  }

  if (jumpToComment) {
    return showComments(jumpToComment)
  }

  let quit = false, firstTime = true
  while (!quit) {
    let locationStr = ' from ' + profile.location
    if (profile.location === 'Location not given') {
      locationStr = '; ' + profile.location
    }
    console.log(
      `\x1b[34;1m${profile.username}\x1b[0m` +
      `  \x1b[2m${profile.rank + locationStr}` +
      `; Joined ${profile.joinDate.toDateString()}\x1b[0m`
    )

    if (firstTime) {
      console.log('\x1b[1mAbout me:\x1b[0m')
      console.log(util.wrap(profile.aboutMe))
      console.log('\x1b[1mWhat I\'m working on:\x1b[0m')
      console.log(util.wrap(profile.wiwo))

      if (profile.featuredProject) {
        const h = profile.featuredProjectHeading
        console.log(
          `\x1b[1m${h + (h.endsWith('!') ? '' : ':')}\x1b[0m` +
          ` \x1b[33m${profile.featuredProject.name}\x1b[0m`)
      }

      if (profile.projectCount) {
        console.log(`${profile.username} has shared ${profile.projectCount} project${
          profile.projectCount === 1 ? '' : 's'
        }.`)
      } else {
        console.log(`${profile.username} has not shared any projects.`)
      }

      firstTime = false
    }

    await util.choose({rl, us}, {
      q: {
        help: 'Quit browsing this profile.',
        longcodes: ['quit', 'back'],
        action: async () => {
          quit = true
        }
      },

      I: {
        help: 'View the avatar of this user.',
        longcodes: ['image', 'avatar', 'thumbnail', 'thumb'],
        action: async () => {
          await util.showImage(util.urls.userThumb(profile.id))
        }
      },

      f: profile.featuredProject ? {
        help: 'Browse this user\'s featured project.',
        longcodes: ['featured'],
        action: async () => {
          await projects.browse({rl, us, id: profile.featuredProject.id})
        }
      } : undefined,

      P: profile.projectCount ? {
        help: 'Browse this user\'s shared projects.',
        longcodes: ['projects', 'shared'],
        action: async () => {
          await thumbs.browsePaged({
            rl, us,
            urlPart: `/users/${username}/projects/`,
            title: `\x1b[34;1m${username}\x1b[0;1m's shared projects\x1b[0m`,
            formatItem: p => `\x1b[33m${p.title}\x1b[0m`,
            handleItem: p => projects.browse({rl, us, id: p.href.match(/([0-9]+)/)[1]})
          })
        }
      } : undefined,

      F: profile.hasFavorites ? {
        help: 'Browse this user\'s favorite projects.',
        longcodes: ['favorites'],
        action: async () => {
          await thumbs.browsePaged({
            rl, us,
            urlPart: `/users/${username}/favorites/`,
            title: `\x1b[34;1m${username}\x1b[0;1m's favorite projects\x1b[0m`,
            formatItem: p => `\x1b[33m${p.title}\x1b[0m`,
            handleItem: p => projects.browse({rl, us, id: p.href.match(/[0-9]+/)[0]})
          })
        }
      } : undefined,

      u: profile.isFollowing ? {
        help: 'Browse the user profiles that this user is following.',
        longcodes: ['following'],
        action: async () => {
          await thumbs.browsePaged({
            rl, us,
            urlPart: `/users/${username}/following/`,
            title: `\x1b[1mUsers \x1b[34;1m${username}\x1b[0;1m follows\x1b[0m`,
            formatItem: u => `\x1b[34;1m${u.title}\x1b[0m`,
            handleItem: u => module.exports.browse({rl, us, username: u.title})
          })
        }
      } : undefined,

      U: profile.hasFollowers ? {
        help: 'Browse the profiles of users who are following this user.',
        longcodes: ['followers'],
        action: async () => {
          await thumbs.browsePaged({
            rl, us,
            urlPart: `/users/${username}/followers/`,
            title: `\x1b[34;1m${username}\x1b[0;1m's followers\x1b[0m`,
            formatItem: u => `\x1b[34;1m${u.title}\x1b[0m`,
            handleItem: u => module.exports.browse({rl, us, username: u.title})
          })
        }
      } : undefined,

      s: profile.isCuratingStudios ? {
        help: 'Browse the studios this user is curating.',
        longcodes: ['curatnig-studios'],
        action: async () => {
          await thumbs.browsePaged({
            rl, us,
            urlPart: `/users/${username}/studios/`,
            title: `\x1b[1mStudios \x1b[34;1m${username}\x1b[0;1m curates\x1b[0m`,
            formatItem: s => `\x1b[32;1m${s.title}\x1b[0m`,
            handleItem: s => studios.browse({rl, us, id: s.href.match(/[0-9]+/)[0]})
          })
        }
      } : undefined,

      S: profile.isFollowingStudios ? {
        help: 'Browse the studios this user is following.',
        longcodes: ['following-studios'],
        action: async () => {
          await thumbs.browsePaged({
            rl, us,
            urlPart: `/users/${username}/studios_following/`,
            title: `\x1b[1mStudios \x1b[34;1m${username}\x1b[0;1m follows\x1b[0m`,
            formatItem: s => `\x1b[32;1m${s.title}\x1b[0m`,
            handleItem: s => studios.browse({rl, us, id: s.href.match(/[0-9]+/)[0]})
          })
        }
      } : undefined,

      A: profile.username === us.username ? {
        help: 'Change your about me.',
        longcodes: ['change-about'],
        action: async () => {
          await updateDescription({
            promptStr: "New about me: ",
            property: 'aboutMe', apiProperty: 'bio'
          })
        }
      } : undefined,

      W: profile.username === us.username ? {
        help: 'Change what you\'re working on.',
        longcodes: ['change-about'],
        action: async () => {
          await updateDescription({
            promptStr: "New what I'm working on: ",
            property: 'wiwo', apiProperty: 'status'
          })
        }
      } : undefined,

      c: {
        help: 'Browse comments.',
        longcodes: ['comments'],
        action: async () => {
          await showComments()
        }
      }
    })
  }
}

function fetchProfile(username) {
  return fetch(`${util.urls.scratch}/users/${username}`)
    .then(res => res.text())
    .then(html => parseProfile(html))
}

function parseProfile(html) {
  const $ = cheerio.load(html)

  if ($('#page-404').length) {
    return {notFound: true}
  }

  const readMultiline = el => {
    el.find('br').replaceWith('\n')
    return el.text().replace(/\s*\n\s*/g, ' ')
  }

  const scripts = $('script').map((i, scriptEl) => $(scriptEl).html()).get()

  const profile = {
    id: scripts.map(str => str.match(/Scratch\.INIT_DATA\.PROFILE = \{[\s\S]*?userId: ([^,]*),/)).filter(Boolean)[0][1],
    username: $('#profile-data h2').text().match(/[^*]*/)[0],
    rank: $('#profile-data .group').text().trim(),
    location: $('#profile-data .location').text(),
    joinDate: new Date($('span[title]').attr('title')),
    aboutMe: readMultiline($('#bio-readonly .overview')),
    wiwo: readMultiline($('#status-readonly .overview')),
    projectCount: parseInt($('.box:has(#shared) h4').text().match(/([0-9]+)/)[1]),
    isFollowing: !!$('.box-head:contains("Following") a').length,
    hasFollowers: !!$('.box-head:contains("Followers") a').length,
    hasFavorites: !!$('.box-head:contains("Favorite Projects") a').length,
    isFollowingStudios: !!$('.box-head:contains("Studios I\'m Following") a').length,
    isCuratingStudios: !!$('.box-head:contains("Studios I Curate") a').length,
    commentsEnabled: !$('.comments-off').length
  }

  if ($('.player a.project-name').length && $('.player a.project-name').text().trim().length) {
    profile.featuredProjectHeading = $('.featured-project-heading').text()
    profile.featuredProject = {
      name: $('.player a.project-name').text(),
      id: parseInt($('.player a.project-name').attr('href').match(/([0-9]+)/)[1])
    }
  } else {
    profile.featuredProjectHeading = profile.featuredProject = null
  }

  return profile
}
