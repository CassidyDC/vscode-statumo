/**
 * Status bar segments.
 * @file Build the context and rate-limit parts of a tool's status bar item, each led by a progress ring.
 */

import { isLimitStale, percentUsed } from '../usage/levels.js'
import { iconStyles } from './rings.js'

/**
 * Which rate-limit window a segment or section shows.
 * @typedef {'fiveHour' | 'sevenDay' | 'sevenDayFable'} WindowKey
 */

/**
 * The full names of the rate-limit windows.
 * @type {Record<WindowKey, string>}
 */
const windowNames = { fiveHour: '5-hour limit', sevenDay: 'weekly limit', sevenDayFable: 'weekly Fable limit' }

/**
 * The ring each rate-limit window's icons draw.
 * @type {Record<WindowKey, import('./rings.js').RingKind>}
 */
const windowRings = { fiveHour: '5h', sevenDay: '7d', sevenDayFable: 'fb' }

/**
 * One rate-limit window's part of the status bar.
 * @typedef {object} WindowSegment
 * @property {WindowKey} key - Which window.
 * @property {string} text - The window's ring icon and percent used, such as `$(statumo-5h-15) 16%`, `0%` once it has reset with no newer reading, or the empty ring alone when unreported.
 * @property {string | null} value - The percent used, such as `16%`, or null when unreported.
 * @property {boolean} isStale - Whether the reading predates the window's reset.
 * @property {import('../usage/model.js').LimitReading | null} limit - The window's reading.
 */

/**
 * The context part of the status bar.
 * @typedef {object} ContextSegment
 * @property {string} text - The context ring icon and percent used, such as `$(statumo-cx-10) 12%`, or the empty ring alone when unknown.
 * @property {string | null} value - The percent used, such as `12%`, or null when unknown.
 */

/**
 * Build one window's segment. A window whose reset has passed with no newer reading has reset, so it shows 0%.
 * @param {WindowKey} key - Which window.
 * @param {import('./rings.js').RingKind} ring - The window's ring.
 * @param {import('../usage/model.js').LimitReading | null} limit - The window's reading.
 * @param {Date} now - The current time.
 * @param {(ring: import('./rings.js').RingKind, percent: number | null) => string} icon - Draws the segment's icon.
 * @returns {WindowSegment} The segment.
 */
function buildWindowSegment(key, ring, limit, now, icon) {
  if (!limit) return { key, text: icon(ring, null), value: null, isStale: false, limit }

  /** Whether the reading predates the window's reset, and the rounded percent used. */
  const isStale = isLimitStale(limit, now)
  const used = isStale ? 0 : percentUsed(limit)
  return { key, text: `${icon(ring, used)} ${used}%`, value: `${used}%`, isStale, limit }
}

/**
 * Build a tool's status bar segments: the percent of context used, then of each window used,
 * each percent led by a ring that fills to match it. The Fable window only appears once it's reported.
 * @param {import('../usage/model.js').ToolUsage} usage - The tool's readings.
 * @param {Date} now - The current time.
 * @param {import('./rings.js').IconStyle} [iconStyle] - How to draw the icon before each percent.
 * @returns {{ context: ContextSegment, windows: WindowSegment[] }} The context and the windows.
 */
function buildSegments(usage, now, iconStyle = 'ring') {
  /** Draws a segment's icon. */
  const icon = iconStyles[iconStyle]

  /** The session's context percent, rounded, and as text. */
  const percent = usage.session?.context?.percent ?? null
  const used = percent === null ? null : Math.round(percent)
  const value = used === null ? null : `${used}%`

  return {
    context: { text: value === null ? icon('cx', null) : `${icon('cx', used)} ${value}`, value },
    windows: [
      buildWindowSegment('fiveHour', windowRings.fiveHour, usage.limits.fiveHour, now, icon),
      buildWindowSegment('sevenDay', windowRings.sevenDay, usage.limits.sevenDay, now, icon),
      ...(usage.limits.sevenDayFable ? [buildWindowSegment('sevenDayFable', windowRings.sevenDayFable, usage.limits.sevenDayFable, now, icon)] : []),
    ],
  }
}

export { buildSegments, windowNames, windowRings }
