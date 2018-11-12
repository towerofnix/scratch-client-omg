'use strict'

const util = require('./util')

module.exports.browse = async function({rl, us, getItems, formatItem, title = '', pageCount, handleItem}) {
  let quit = false, currentPageNumber = 1
  while (!quit) {
    const items = await getItems(currentPageNumber)

    let header = ''

    if (title) {
      header += title + ' '
    }

    header += `(Page ${currentPageNumber}`
    if (pageCount) {
      header += ` / ${pageCount}`
    }
    header += ')'
    console.log(header)

    console.log('')
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

      n: !pageCount || currentPageNumber < pageCount ? {
        help: 'Go to the next page.',
        longcodes: ['next'],
        action: () => {
          currentPageNumber++
        }
      } : undefined,

      p: currentPageNumber > 1 ? {
        help: 'Go to the previous page.',
        longcodes: ['prev', 'previous'],
        action: () => {
          currentPageNumber--
        }
      } : undefined,

      j: typeof pageCount !== 'number' || pageCount > 1 ? {
        help: 'Jump to a particular page.',
        longcodes: ['jump'],
        action: async () => {
          const n = parseInt(await util.prompt(rl, 'What page? '))
          if (!isNaN(n)) {
            if (pageCount) {
              currentPageNumber = Math.min(n, pageCount)
            } else {
              currentPageNumber = n
            }
          }
        }
      } : undefined,

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
