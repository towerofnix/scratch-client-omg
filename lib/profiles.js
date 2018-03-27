'use strict'

const cheerio = require('cheerio')
const fetch = require('node-fetch')
const comments = require('./comments')
const projects = require('./projects')
const userProjects = require('./user-projects')
const util = require('./util')

module.exports.browse = async function({rl, us, username}) {
  const profile = await fetchProfile(username)

  if (profile.notFound) {
    console.log('That user profile is not found, sorry.')
    return
  }

  const updateDescription = async function ({promptStr, property, apiProperty}) {
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

  let quit = false, firstTime = true
  while (!quit) {
    console.log(
      `\x1b[34;1m${profile.username}\x1b[0m` +
      `  \x1b[2m${profile.rank} from ${profile.location}` +
      `; Joined ${profile.joinDate.toDateString()}\x1b[0m`
    )

    if (firstTime) {
      console.log(`\x1b[1mAbout me:\x1b[0m ${profile.aboutMe}`)
      console.log(`\x1b[1mWhat I'm working on:\x1b[0m ${profile.wiwo}`)

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
          await userProjects.browse({rl, us, username: profile.username})
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
          await comments.browse({
            rl, us, pageType: 'user', pageId: profile.username
          })
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

  if ($('#profile-data').length === 0) {
    return {notFound: true}
  }

  const readMultiline = el => {
    el.find('br').replaceWith('\n')
    return el.text().replace(/\s*\n\s*/g, ' ')
  }

  const profile = {
    id: $('#profile-avatar img').attr('src').match(/user\/([0-9]+)/)[1],
    username: $('#profile-data h2').text().match(/[^*]*/)[0],
    rank: $('#profile-data .group').text().trim(),
    location: $('#profile-data .location').text(),
    joinDate: new Date($('span[title]').attr('title')),
    aboutMe: readMultiline($('#bio-readonly .overview')),
    wiwo: readMultiline($('#status-readonly .overview')),
    projectCount: parseInt($('.box:has(#shared) h4').text().match(/([0-9]+)/)[1])
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
