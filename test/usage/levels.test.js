/**
 * Rate-limit level tests.
 * @file Check the per-window and per-tool warning levels, and that a stale window never warns.
 */

'use strict'

const assert = require('node:assert/strict')
const { test } = require('node:test')
const { getToolLevel, getWindowLevel } = require('../../src/usage/levels')

/**
 * A fixed current time for every test.
 * @type {Date}
 */
const now = new Date(2026, 10, 22, 10, 0)

/**
 * The default warning and error thresholds.
 * @type {{ warningThreshold: number, errorThreshold: number }}
 */
const thresholds = { warningThreshold: 25, errorThreshold: 10 }

test('warns and errors per window', () => {
  /**
   * Build a current reading at a given percent used.
   * @param {number} percentUsed - Percent of the window used.
   * @returns {import('../../src/usage/model').LimitReading} The reading.
   */
  const limit = percentUsed => ({ percentUsed, resetsAt: null })
  assert.equal(getWindowLevel(limit(50), thresholds, now), null)
  assert.equal(getWindowLevel(limit(75), thresholds, now), 'warning')
  assert.equal(getWindowLevel(limit(95), thresholds, now), 'error')
  assert.equal(getWindowLevel(null, thresholds, now), null)
  assert.equal(getToolLevel({ fiveHour: limit(95), sevenDay: limit(80) }, thresholds, now), 'error')
  assert.equal(getToolLevel({ fiveHour: limit(10), sevenDay: limit(80) }, thresholds, now), 'warning')
  assert.equal(getToolLevel({ fiveHour: null, sevenDay: limit(10) }, thresholds, now), null)
})

test('never warns for a window whose reset has passed', () => {
  assert.equal(getWindowLevel({ percentUsed: 90, resetsAt: new Date(2026, 10, 22, 9, 0) }, thresholds, now), null)
})
