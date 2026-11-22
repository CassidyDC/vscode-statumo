/**
 * Status text formatting tests.
 * @file Check the status bar segments, progress rings, per-window warning levels, staleness, and tooltip escaping.
 */

'use strict'

const assert = require('node:assert/strict')
const { test } = require('node:test')
const { buildSegments, buildTooltip, formatTokens, getWindowLevel } = require('../src/format')
const { ringIcon, ringStep } = require('../src/rings')

/**
 * A fixed current time for every test.
 * @type {Date}
 */
const now = new Date(2026, 10, 22, 10, 0)

/**
 * Build a usage reading with a session and both windows.
 * @param {object} [overrides] - Fields to replace.
 * @returns {import('../src/usage').ToolUsage} The usage.
 */
function makeUsage(overrides = {}) {
  return {
    session: {
      title: 'Refactor parser',
      cwd: '/work/project',
      context: { tokens: 48_300, window: 400_000, percent: 12 },
      updatedAt: new Date(2026, 10, 22, 9, 58),
      isEnded: false,
    },
    limits: {
      fiveHour: { percentUsed: 16, resetsAt: new Date(2026, 10, 22, 14, 30) },
      sevenDay: { percentUsed: 39, resetsAt: new Date(2026, 10, 27, 9, 0) },
    },
    limitsUpdatedAt: new Date(2026, 10, 22, 9, 58),
    plan: null,
    ...overrides,
  }
}

/**
 * Reduce segments to their visible text, dropping missing resets.
 * @param {ReturnType<typeof buildSegments>} segments - The segments.
 * @returns {string[]} The texts, left to right.
 */
function texts(segments) {
  return [segments.context.text, ...segments.windows.flatMap(window => [window.text, window.reset])].filter(Boolean)
}

test('builds segments with context used, limits left, and resets apart', () => {
  assert.deepEqual(texts(buildSegments(makeUsage(), now)), [
    '$(statumo-cx-10) 12%',
    '$(statumo-5h-85) 84%',
    '14:30',
    '$(statumo-7d-60) 61%',
    'Nov 27',
  ])
})

test('dashes context with an empty ring when the workspace has no session', () => {
  assert.deepEqual(buildSegments(makeUsage({ session: null }), now).context, { text: '$(statumo-cx-0) —', value: '—' })
})

test('rounds rings to the nearest step, keeping partial values off empty and full', () => {
  assert.equal(ringStep(null), 0)
  assert.equal(ringStep(0), 0)
  assert.equal(ringStep(1), 5)
  assert.equal(ringStep(42), 40)
  assert.equal(ringStep(43), 45)
  assert.equal(ringStep(99), 95)
  assert.equal(ringStep(100), 100)
  assert.equal(ringStep(130), 100)
  assert.equal(ringIcon('7d', 61), '$(statumo-7d-60)')
})

test('dashes a window whose reset has passed and drops its reset', () => {
  const usage = makeUsage({
    limits: {
      fiveHour: { percentUsed: 90, resetsAt: new Date(2026, 10, 22, 9, 0) },
      sevenDay: { percentUsed: 39, resetsAt: new Date(2026, 10, 27, 9, 0) },
    },
  })
  const segments = buildSegments(usage, now)

  assert.deepEqual(texts(segments), ['$(statumo-cx-10) 12%', '$(statumo-5h-0) —', '$(statumo-7d-60) 61%', 'Nov 27'])
  assert.equal(segments.windows[0].value, '—')
  assert.equal(segments.windows[0].isStale, true)
  assert.equal(getWindowLevel(usage.limits.fiveHour, { warningThreshold: 25, errorThreshold: 10 }, now), null)
})

test('warns and errors per window', () => {
  const thresholds = { warningThreshold: 25, errorThreshold: 10 }

  /**
   * Build a current reading at a given percent used.
   * @param {number} percentUsed - Percent of the window used.
   * @returns {import('../src/usage').LimitReading} The reading.
   */
  const limit = percentUsed => ({ percentUsed, resetsAt: null })

  assert.equal(getWindowLevel(limit(50), thresholds, now), null)
  assert.equal(getWindowLevel(limit(75), thresholds, now), 'warning')
  assert.equal(getWindowLevel(limit(95), thresholds, now), 'error')
  assert.equal(getWindowLevel(null, thresholds, now), null)
})

test('formats token counts in thousands and millions', () => {
  assert.equal(formatTokens(48_300), '48.3k')
  assert.equal(formatTokens(1_000_000), '1m')
  assert.equal(formatTokens(null), '—')
})

test('escapes session titles in the tooltip', () => {
  const usage = makeUsage({ plan: 'Plus' })

  usage.session.title = 'Fix [link](https://example.com) *now*'

  const tooltip = buildTooltip('Codex', usage, now)

  assert.match(tooltip, /\\\[link\\\]\\\(https:\/\/example\\\.com\\\) \\\*now\\\*/)
  assert.match(tooltip, /Context: 48\\\.3k \/ 400k · 12% used/)
  assert.match(tooltip, /Plan: Plus/)
})
