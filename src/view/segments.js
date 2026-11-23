/**
 * Status bar segments.
 * @file Build the context and rate-limit parts of a tool's status bar item, each led by a progress ring.
 */

'use strict'

const { isLimitStale, percentUsed } = require('../usage/levels')
const { ringIcon } = require('./rings')

/**
 * The full names of the rate-limit windows.
 * @type {Record<'fiveHour' | 'sevenDay', string>}
 */
const windowNames = { fiveHour: '5-hour limit', sevenDay: '7-day limit' }

/**
 * One rate-limit window's part of the status bar.
 * @typedef {object} WindowSegment
 * @property {'fiveHour' | 'sevenDay'} key - Which window.
 * @property {string} text - The window's ring icon and percent used, such as `$(statumo-5h-15) 16%`, or the empty ring alone when unknown or stale.
 * @property {string | null} value - The percent used, such as `16%`, or null when unknown or stale.
 * @property {boolean} isStale - Whether the reading predates the window's reset.
 * @property {import('../usage/model').LimitReading | null} limit - The window's reading.
 */

/**
 * The context part of the status bar.
 * @typedef {object} ContextSegment
 * @property {string} text - The context ring icon and percent used, such as `$(statumo-cx-10) 12%`, or the empty ring alone when unknown.
 * @property {string | null} value - The percent used, such as `12%`, or null when unknown.
 */

/**
 * Build one window's segment.
 * @param {'fiveHour' | 'sevenDay'} key - Which window.
 * @param {import('./rings').RingKind} ring - The window's ring.
 * @param {import('../usage/model').LimitReading | null} limit - The window's reading.
 * @param {Date} now - The current time.
 * @returns {WindowSegment} The segment.
 */
function buildWindowSegment(key, ring, limit, now) {
  /** Whether the reading predates the window's reset. */
  const isStale = isLimitStale(limit, now)
  if (!limit || isStale) return { key, text: ringIcon(ring, null), value: null, isStale, limit }

  /** The rounded percent used. */
  const used = percentUsed(limit)
  return { key, text: `${ringIcon(ring, used)} ${used}%`, value: `${used}%`, isStale, limit }
}

/**
 * Build a tool's status bar segments: the percent of context used, then of each window used,
 * each percent led by a ring that fills to match it.
 * @param {import('../usage/model').ToolUsage} usage - The tool's readings.
 * @param {Date} now - The current time.
 * @returns {{ context: ContextSegment, windows: WindowSegment[] }} The context and the windows.
 */
function buildSegments(usage, now) {
  /** The session's context percent, rounded, and as text. */
  const percent = usage.session?.context?.percent ?? null
  const used = percent === null ? null : Math.round(percent)
  const value = used === null ? null : `${used}%`

  return {
    context: { text: value === null ? ringIcon('cx', null) : `${ringIcon('cx', used)} ${value}`, value },
    windows: [
      buildWindowSegment('fiveHour', '5h', usage.limits.fiveHour, now),
      buildWindowSegment('sevenDay', '7d', usage.limits.sevenDay, now),
    ],
  }
}

module.exports = { buildSegments, windowNames }
