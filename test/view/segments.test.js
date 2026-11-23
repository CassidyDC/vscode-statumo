/**
 * Status bar segment tests.
 * @file Check the context and rate-limit segments, including unreported, reset, and Fable windows.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildSegments } from '../../src/view/segments.js'

/**
 * A fixed current time for every test.
 * @type {Date}
 */
const now = new Date(2026, 10, 22, 10, 0)

/**
 * Build a usage reading with a session and both windows.
 * @param {object} [overrides] - Fields to replace.
 * @returns {import('../../src/usage/model.js').ToolUsage} The usage.
 */
function makeUsage(overrides = {}) {
  return {
    session: {
      title: 'Refactor parser',
      cwd: '/work/project',
      context: { tokens: 48_300, window: 400_000, percent: 12 },
      updatedAt: new Date(2026, 10, 22, 9, 58),
    },
    limits: {
      fiveHour: { percentUsed: 16, resetsAt: new Date(2026, 10, 22, 14, 30) },
      sevenDay: { percentUsed: 39, resetsAt: new Date(2026, 10, 27, 9, 0) },
    },
    limitsUpdatedAt: new Date(2026, 10, 22, 9, 58),
    plan: null,
    access: null,
    ...overrides,
  }
}

/**
 * Reduce segments to their visible text.
 * @param {ReturnType<typeof buildSegments>} segments - The segments.
 * @returns {string[]} The texts, left to right.
 */
function texts(segments) {
  return [segments.context.text, ...segments.windows.map(window => window.text)]
}

test('builds segments with context and limits used', () => {
  assert.deepEqual(texts(buildSegments(makeUsage(), now)), ['$(statumo-cx-10) 12%', '$(statumo-5h-15) 16%', '$(statumo-7d-40) 39%'])
})

test('shows only an empty context ring when the workspace has no session', () => {
  assert.deepEqual(buildSegments(makeUsage({ session: null }), now).context, { text: '$(statumo-cx-0)', value: null })
})

test('shows 0% for a window whose reset has passed', () => {
  /** Usage whose 5-hour window reset an hour ago. */
  const usage = makeUsage({
    limits: {
      fiveHour: { percentUsed: 90, resetsAt: new Date(2026, 10, 22, 9, 0) },
      sevenDay: { percentUsed: 39, resetsAt: new Date(2026, 10, 27, 9, 0) },
    },
  })

  /** The usage's segments. */
  const segments = buildSegments(usage, now)

  assert.deepEqual(texts(segments), ['$(statumo-cx-10) 12%', '$(statumo-5h-0) 0%', '$(statumo-7d-40) 39%'])
  assert.equal(segments.windows[0].value, '0%')
  assert.equal(segments.windows[0].isStale, true)
})

test('shows only an empty ring for a window that was never reported', () => {
  /** The segments of usage with no 5-hour reading. */
  const segments = buildSegments(makeUsage({ limits: { fiveHour: null, sevenDay: makeUsage().limits.sevenDay } }), now)

  assert.deepEqual(texts(segments), ['$(statumo-cx-10) 12%', '$(statumo-5h-0)', '$(statumo-7d-40) 39%'])
  assert.equal(segments.windows[0].value, null)
  assert.equal(segments.windows[0].isStale, false)
})

test('adds the Fable window last only once it is reported', () => {
  /** Usage with and without a Fable reading. */
  const withFable = makeUsage({ limits: { ...makeUsage().limits, sevenDayFable: { percentUsed: 61, resetsAt: new Date(2026, 10, 24, 2, 0) } } })
  const withoutFable = makeUsage({ limits: { ...makeUsage().limits, sevenDayFable: null } })

  assert.deepEqual(texts(buildSegments(withFable, now)), ['$(statumo-cx-10) 12%', '$(statumo-5h-15) 16%', '$(statumo-7d-40) 39%', '$(statumo-fb-60) 61%'])
  assert.equal(buildSegments(withFable, now).windows.at(-1).key, 'sevenDayFable')
  assert.equal(buildSegments(withoutFable, now).windows.length, 2)
})
