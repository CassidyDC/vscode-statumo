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

  assert.equal(formatReset(resetsAt, now), 'today at 2:30 PM')
  assert.equal(formatReset(resetsAt, now, { timeFormat: '24h' }), 'today at 14:30')
  assert.equal(formatReset(resetsAt, now, { showTimeUntilReset: true }), 'today at 2:30 PM (4h 30m)')
  assert.equal(formatReset(resetsAt, now, { showDay: false }), 'at 2:30 PM')
})

test('names the reset day today or tomorrow, and dates any later day', () => {
  /** A fixed late-evening current time. */
  const now = new Date(2026, 10, 22, 23, 30)

  assert.equal(formatReset(new Date(2026, 10, 22, 23, 45), now), 'today at 11:45 PM')
  assert.equal(formatReset(new Date(2026, 10, 23, 0, 15), now), 'tomorrow at 12:15 AM')
  assert.equal(formatReset(new Date(2026, 10, 23, 23, 59), now), 'tomorrow at 11:59 PM')
  assert.equal(formatReset(new Date(2026, 10, 24, 0, 0), now), 'Nov 24 at 12:00 AM')
  assert.equal(formatReset(new Date(2026, 11, 1, 9, 0), new Date(2026, 10, 30, 9, 0)), 'tomorrow at 9:00 AM')
})
