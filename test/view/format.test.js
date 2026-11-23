/**
 * Value formatting tests.
 * @file Check how token counts are shortened and reset times are written on each clock.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { formatClock, formatReset, formatTokens } from '../../src/view/format.js'

test('formats token counts in thousands and millions', () => {
  assert.equal(formatTokens(48_300), '48.3k')
  assert.equal(formatTokens(1_000_000), '1m')
  assert.equal(formatTokens(null), '—')
})

test('writes times of day on a 12-hour or 24-hour clock', () => {
  assert.equal(formatClock(new Date(2026, 10, 22, 0, 5), '12h'), '12:05 AM')
  assert.equal(formatClock(new Date(2026, 10, 22, 9, 0), '12h'), '9:00 AM')
  assert.equal(formatClock(new Date(2026, 10, 22, 12, 0), '12h'), '12:00 PM')
  assert.equal(formatClock(new Date(2026, 10, 22, 14, 30), '12h'), '2:30 PM')
  assert.equal(formatClock(new Date(2026, 10, 22, 0, 5), '24h'), '00:05')
  assert.equal(formatClock(new Date(2026, 10, 22, 9, 0), '24h'), '09:00')
  assert.equal(formatClock(new Date(2026, 10, 22, 14, 30), '24h'), '14:30')
})

test('adds the time until a reset only when asked', () => {
  /** A fixed current time, and a reset four and a half hours later. */
  const now = new Date(2026, 10, 22, 10, 0)
  const resetsAt = new Date(2026, 10, 22, 14, 30)

  assert.equal(formatReset(resetsAt, now), 'Nov 22 at 2:30 PM')
  assert.equal(formatReset(resetsAt, now, { timeFormat: '24h' }), 'Nov 22 at 14:30')
  assert.equal(formatReset(resetsAt, now, { showTimeUntilReset: true }), 'Nov 22 at 2:30 PM (4h 30m)')
})
