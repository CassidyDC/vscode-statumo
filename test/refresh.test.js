/**
 * Refresh loop tests.
 * @file Check that overlapping refreshes fold into one more pass, failures are logged once, and the timer pauses without focus.
 */

'use strict'

const assert = require('node:assert/strict')
const { mock, test } = require('node:test')
const { refreshIntervalMs, startRefreshLoop } = require('../src/refresh')

/**
 * Build a loop over one fake tool whose reads wait until released.
 * @param {object} [options] - How the fake tool behaves.
 * @param {() => boolean} [options.isFocused] - Whether the window has focus.
 * @param {() => Promise<object | null>} [options.read] - Reads the tool's usage.
 * @returns {{ loop: import('../src/refresh').RefreshLoop, reads: number[], renders: number[], warnings: string[] }} The loop, and counters of what it did.
 */
function fakeLoop({ isFocused = () => true, read } = {}) {
  /** How many reads and renders ran, and the warnings logged. */
  const reads = [0]
  const renders = [0]
  const warnings = []

  /** The fake tool. */
  const tool = {
    id: 'claude',
    name: 'Claude Code',

    /**
     * Count the read, then read.
     * @returns {Promise<object | null>} The usage.
     */
    read: async () => {
      reads[0] += 1
      return read ? read() : {}
    },
  }

  /** The fake tool's item. */
  const item = {
    /**
     * Count the render.
     * @returns {void}
     */
    render: () => {
      renders[0] += 1
    },

    /**
     * Do nothing.
     * @returns {void}
     */
    hide: () => {},
  }

  /** The loop under test. */
  const loop = startRefreshLoop({
    tools: [tool],
    items: new Map([['claude', item]]),

    /**
     * Read settings with the tool turned on.
     * @returns {object} The settings.
     */
    readSettings: () => ({ tools: { claude: { enabled: true, clickCommand: '' } } }),

    /**
     * Read no workspace folders.
     * @returns {string[]} No paths.
     */
    readFolders: () => [],
    isFocused,
    log: {
      /**
       * Record a warning.
       * @param {string} message - The warning.
       * @returns {void}
       */
      warn: message => {
        warnings.push(message)
      },
    },
  })

  return { loop, reads, renders, warnings }
}

test('folds refreshes asked for during a pass into one more pass', async () => {
  /** Resolves the first read, and the first read's usage, which waits until then. */
  let release
  const firstUsage = new Promise(resolve => {
    release = resolve
  })

  /** A loop whose first read waits until released. */
  const { loop, reads, renders } = fakeLoop({
    /**
     * Wait on the first read only.
     * @returns {Promise<object> | object} The usage.
     */
    read: () => (reads[0] === 1 ? firstUsage : {}),
  })

  /** The first pass. */
  const first = loop.refresh()

  await loop.refresh()
  await loop.refresh()
  release({})
  await first
  loop.dispose()

  assert.equal(reads[0], 2)
  assert.equal(renders[0], 2)
})

test('logs a repeated read failure once', async () => {
  /** A loop whose reads always fail. */
  const { loop, warnings } = fakeLoop({
    /**
     * Fail.
     * @returns {Promise<never>} A rejection.
     */
    read: () => Promise.reject(new Error('broken')),
  })

  await loop.refresh()
  await loop.refresh()
  loop.dispose()

  assert.deepEqual(warnings, ["Couldn't read Claude Code usage: broken"])
})

test('skips timer passes while the window is unfocused', async t => {
  t.after(() => mock.timers.reset())
  mock.timers.enable({ apis: ['setInterval'] })

  /** Whether the window has focus. */
  let isFocused = false

  /** A loop that follows that focus. */
  const { loop, reads } = fakeLoop({ isFocused: () => isFocused })

  mock.timers.tick(refreshIntervalMs)
  await Promise.resolve()

  assert.equal(reads[0], 0)

  isFocused = true
  mock.timers.tick(refreshIntervalMs)
  await Promise.resolve()
  loop.dispose()

  assert.equal(reads[0], 1)
})
