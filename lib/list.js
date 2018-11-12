// Totally a clone of paged list.
// The same thing, but without the pages.

'use strict'

const util = require('./util')

module.exports.browse = async function({rl, us, items, formatItem, title = '', handleItem}) {
  let quit = false
  while (!quit) {
    if (title) {
      console.log(title)
    }

    for (let i = 0; i < items.length; i++) {
      console.log(`[${i + 1}]: ${await formatItem(items[i])}`)
    }
    console.log('')

    await util.choose({rl, us}, Object.assign({
      q: {
        help: 'Quit browsing this list.',
        longcodes: ['quit', 'back'],
        action: () => {
          quit = true
        }
      },

      ['1-' + items.length]: {
        help: 'Choose an item from the list.',
        action: () => {}
      }
    }, items.reduce((acc, item, i) => {
      acc[i + 1] = {
        invisible: true,
        action: async () => {
          await handleItem(item)
        }
      }
      return acc
    }, {})))
  }
}
