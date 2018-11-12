'use strict'

const fetch = require('node-fetch')
const list = require('./list')
const projects = require('./projects')
const studios = require('./studios')
const util = require('./util')

module.exports.browse = async function({rl, us}) {
  const home = await fetchHome(us)

  const pick = arr => arr[Math.floor(Math.random() * arr.length)]

  const FP = home.fp[0],
        FS = home.fs[0],
        CP = home.cp[0],
        SDS = pick(home.sds),
        RP = pick(home.rp),
        BF = pick(home.bf),
        LF = pick(home.lf),
        SF = pick(home.sf),
        CR = pick(home.cr),
        CL = pick(home.cl)

  const proj = p => `\x1b[33;1m${p.title.trim()}\x1b[0m, by \x1b[34;1m${p.creator || p.author.username}\x1b[0m`
  const studio = s => `\x1b[32;1m${s.title.trim()}\x1b[0m`

  const showDetails = function() {
    if (FP) console.log("[all: fp] Latest featured project: [FP ->]", proj(FP))
    if (FS) console.log("[all: fs] Latest featured studio: [FS ->]", studio(FS))
    if (CP) console.log("[all: cp] Latest curated project: [CP ->]", proj(CP))
    if (SDS) console.log("[all: sds] From the Scratch Design Studio: [SDS ->]", proj(SDS))
    if (CR) console.log("[all: cr] What the community is remixing: [CR ->]", proj(CR))
    if (CL) console.log("[all: cl] What the community is loving: [CL ->]", proj(CL))
    if (RP) console.log("[all: rp] A recent project: [RP ->]", proj(RP))
    if (BF) console.log("[all: bf] Made by a Scratcher you're following: [BF ->]", proj(BF))
    if (LF) console.log("[all: lf] Loved by a Scratcher you're following: [LF ->]", proj(LF))
    if (SF) console.log("[all: sf] From a studio you're following: [SF ->]", proj(SF))
  }

  const listEntries = function(items, title) {
    return list.browse({
      rl, us, items,
      title: `\x1b[1m${title}\x1b[0m`,
      formatItem: x => 'instructions' in x ? proj(x) : studio(x),
      handleItem: x => ('instructions' in x
        ? projects.browse({rl, us, id: x.id})
        : studios.browse({rl, us, id: x.id}))
    })
  }

  let quit = false, firstTime = true
  while (!quit) {
    console.log('\x1b[1mScratch Homepage\x1b[0m')
    if (firstTime) {
      showDetails()
      firstTime = false
    }
    console.log('')

    await util.choose({rl, us}, {
      q: {
        help: 'Quit browsing the homepage.',
        longcodes: ['quit', 'back'],
        action: () => {
          quit = true
        }
      },
      FP: FP ? {
        help: `View the latest featured project, ${proj(FP)}.`,
        longcodes: ['featured-project'],
        action: () => projects.browse({rl, us, id: FP.id})
      } : undefined,
      FS: FS ? {
        help: `View the latest featured studio, ${studio(FS)}.`,
        longcodes: ['featured-studio'],
        action: () => studios.browse({rl, us, id: FS.id})
      } : undefined,
      CP: CP ? {
        help: `View the latest curated project, ${proj(CP)}.`,
        longcodes: ['curated'],
        action: () => projects.browse({rl, us, id: CP.id})
      } : undefined,
      SDS: SDS ? {
        help: `View a project from the Scratch Design Studio, ${proj(SDS)}.`,
        longcodes: ['from-sds'],
        action: () => projects.browse({rl, us, id: SDS.id})
      } : undefined,
      CR: CR ? {
        help: `View a project that the community is remixing, ${proj(CR)}.`,
        longcodes: ['community-remixed'],
        action: () => projects.browse({rl, us, id: CR.id})
      } : undefined,
      CL: CL ? {
        help: `View a project that the community is loving, ${proj(CL)}.`,
        longcodes: ['community-loved'],
        action: () => projects.browse({rl, us, id: CL.id})
      } : undefined,
      RP: RP ? {
        help: `View a recent project, ${proj(RP)}.`,
        longcodes: ['recent'],
        action: () => projects.browse({rl, us, id: RP.id})
      } : undefined,
      BF: BF ? {
        help: `View a project made by a Scratcher you're following, ${proj(BF)}.`,
        longcodes: ['friend-made'],
        action: () => projects.browse({rl, us, id: BF.id})
      } : undefined,
      LF: LF ? {
        help: `View a project loved by a Scratcher you're following, ${proj(LF)}.`,
        longcodes: ['friend-loved'],
        action: () => projects.browse({rl, us, id: LF.id})
      } : undefined,
      SF: SF ? {
        help: `View a project from a studio you're following, ${proj(SF)}.`,
        longcodes: ['from-studio'],
        action: () => projects.browse({rl, us, id: SF.id})
      } : undefined,
      fp: FP ? {
        help: 'Browse a list of featured projects.',
        longcodes: ['list-featured-projects'],
        action: () => listEntries(home.fp, 'Featured projects')
      } : undefined,
      fs: FS ? {
        help: 'Browse a list of featured studios.',
        longcodes: ['list-featured-studios'],
        action: () => listEntries(home.fs, 'Featured studios')
      } : undefined,
      cp: CP ? {
        help: 'Browse a list of curated projects.',
        longcodes: ['list-curated'],
        action: () => listEntries(home.cp, 'Featured projects')
      } : undefined,
      sds: SDS ? {
        help: 'Browse a list of projects in the Scratch Design Studio.',
        longcodes: ['list-sds'],
        action: () => listEntries(home.sds, 'Scratch Design Studio')
      } : undefined,
      cr: CR ? {
        help: 'Browse a list of projects the community is remixing.',
        longcodes: ['list-community-remixed'],
        action: () => listEntries(home.cr, 'What the community is remixing')
      } : undefined,
      cl: CL ? {
        help: 'Browse a list of projects the community is loving.',
        longcodes: ['list-community-loved'],
        action: () => listEntries(home.cl, 'What the community is loving')
      } : undefined,
      rp: RP ? {
        help: 'Browse a list of recent projects.',
        longcodes: ['list-recent'],
        action: () => listEntries(home.rp, 'Recent projects')
      } : undefined,
      bf: BF ? {
        help: 'Browse a list of projects made by Scratchers you\'re following.',
        longcodes: ['list-friend-made'],
        action: () => listEntries(home.bf, 'Projects made by Scratchers you\'re following')
      } : undefined,
      lf: LF ? {
        help: 'Browse a list of projects loved by Scratchers you\'re following.',
        longcodes: ['list-friend-loved'],
        action: () => listEntries(home.lf, 'Projects loved by Scratchers you\'re following')
      } : undefined,
      sf: SF ? {
        help: 'Browse a list of projects from studios you\'re following.',
        longcodes: ['list-from-studio'],
        action: () => listEntries(home.sf, 'Projects from studios you\'re following')
      } : undefined
    })
  }
}

async function fetchHome(us) {
  const authToken = await util.getAuthToken(us)
  const following = x => `${util.urls.newAPI}/users/${us.username}/following/${x}?x-token=${authToken}`
  const [
    featuredData,
    byFollowersData,
    lovedByFollowersData,
    inStudiosData
  ] = await Promise.all([
    `${util.urls.newAPI}/proxy/featured`,
    following('users/projects'),
    following('users/loves'),
    following('studios/projects')
  ].map(u => fetch(u).then(res => res.json())))

  return {
    fp: featuredData.community_featured_projects,
    fs: featuredData.community_featured_studios,
    cp: featuredData.curator_top_projects,
    sds: featuredData.scratch_design_studio,
    rp: featuredData.community_newest_projects,
    cr: featuredData.community_most_remixed_projects,
    cl: featuredData.community_most_loved_projects,
    bf: byFollowersData,
    lf: lovedByFollowersData,
    sf: inStudiosData
  }
}
