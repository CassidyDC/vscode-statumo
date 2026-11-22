/**
 * Status text formatting tests.
 * @file Check the status bar text, warning levels, staleness, and tooltip escaping.
 */

'use strict'

const assert = require('node:assert/strict')
const { test } = require('node:test')
const { buildStatusText, buildTooltip, formatTokens, getLevel, isUsageStale } = require('../src/format')

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

test('builds compact text with context used and limits left', () => {
  assert.equal(buildStatusText('Claude', makeUsage(), now), 'Claude ctx 12% · 5h 84% 14:30 · 7d 61% Nov 27')
})

test('dashes context when the workspace has no session', () => {
  assert.equal(buildStatusText('Codex', makeUsage({ session: null }), now), 'Codex ctx — · 5h 84% 14:30 · 7d 61% Nov 27')
})

test('dashes a window whose reset has passed and dims the item', () => {
  const usage = makeUsage({
    limits: {
      fiveHour: { percentUsed: 90, resetsAt: new Date(2026, 10, 22, 9, 0) },
      sevenDay: { percentUsed: 39, resetsAt: new Date(2026, 10, 27, 9, 0) },
    },
  })

  assert.equal(buildStatusText('Claude', usage, now), 'Claude ctx 12% · 5h — · 7d 61% Nov 27')
  assert.equal(isUsageStale(usage, now), true)
  assert.equal(getLevel(usage, { warningThreshold: 25, errorThreshold: 10 }, now), null)
})

test('warns and errors on the lowest current window', () => {
  const thresholds = { warningThreshold: 25, errorThreshold: 10 }

  /**
   * Build usage with the 5-hour window at a given percent used.
   * @param {number} percentUsed - Percent of the 5-hour window used.
   * @returns {import('../src/usage').ToolUsage} The usage.
   */
  const withFiveHour = percentUsed => makeUsage({
    limits: { fiveHour: { percentUsed, resetsAt: null }, sevenDay: null },
  })

  assert.equal(getLevel(withFiveHour(50), thresholds, now), null)
  assert.equal(getLevel(withFiveHour(75), thresholds, now), 'warning')
  assert.equal(getLevel(withFiveHour(95), thresholds, now), 'error')
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
