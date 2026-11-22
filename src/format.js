/**
 * Status text formatting.
 * @file Turn usage readings into the status bar text, warning level, and hover tooltips.
 */

'use strict'

const os = require('node:os')
const { ringIcon } = require('./rings')

/**
 * Formats an older reading's date, such as `Nov 27`.
 * @type {Intl.DateTimeFormat}
 */
const shortDate = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' })

/**
 * Formats a reset in the tooltip, such as `Thu, Nov 27, 09:00`.
 * @type {Intl.DateTimeFormat}
 */
const resetFull = new Intl.DateTimeFormat('en-US', {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})

/**
 * Stands in for a value that hasn't been reported.
 * @type {string}
 */
const dash = '—'

/**
 * The full names of the rate-limit windows.
 * @type {Record<'fiveHour' | 'sevenDay', string>}
 */
const windowNames = { fiveHour: '5-hour limit', sevenDay: '7-day limit' }

/**
 * Whether a window's reset time has passed with no newer reading.
 * @param {import('./usage').LimitReading | null} limit - The window's reading.
 * @param {Date} now - The current time.
 * @returns {boolean} True when the reading predates the window's reset.
 */
function isLimitStale(limit, now) {
  return Boolean(limit?.resetsAt && limit.resetsAt.getTime() <= now.getTime())
}

/**
 * Percent of a window left, rounded and kept between 0 and 100.
 * @param {import('./usage').LimitReading} limit - The window's reading.
 * @returns {number} The percent left.
 */
function percentLeft(limit) {
  return Math.max(0, Math.min(100, Math.round(100 - limit.percentUsed)))
}

/**
 * Format a token count with `k` for thousands and `m` for millions.
 * @param {number | null} tokens - The token count.
 * @returns {string} The formatted count, such as `48.3k`.
 */
function formatTokens(tokens) {
  if (tokens === null) return dash

  const thousands = Math.round(tokens / 100) / 10

  if (thousands < 1000) return `${thousands}k`

  return `${Math.round(tokens / 100_000) / 10}m`
}

/**
 * One rate-limit window's part of the status bar.
 * @typedef {object} WindowSegment
 * @property {'fiveHour' | 'sevenDay'} key - Which window.
 * @property {string} text - The window's ring icon and percent left, such as `$(statumo-5h-85) 84%`.
 * @property {string} value - The percent left, such as `84%`, or a dash when unknown or stale.
 * @property {boolean} isStale - Whether the reading predates the window's reset.
 * @property {import('./usage').LimitReading | null} limit - The window's reading.
 */

/**
 * Build one window's segment.
 * @param {'fiveHour' | 'sevenDay'} key - Which window.
 * @param {import('./rings').RingKind} ring - The window's ring.
 * @param {import('./usage').LimitReading | null} limit - The window's reading.
 * @param {Date} now - The current time.
 * @returns {WindowSegment} The segment.
 */
function buildWindowSegment(key, ring, limit, now) {
  const isStale = isLimitStale(limit, now)

  if (!limit || isStale) return { key, text: `${ringIcon(ring, null)} ${dash}`, value: dash, isStale, limit }

  const remaining = percentLeft(limit)

  return { key, text: `${ringIcon(ring, remaining)} ${remaining}%`, value: `${remaining}%`, isStale, limit }
}

/**
 * Format one window for the tooltip.
 * @param {import('./usage').LimitReading | null} limit - The window's reading.
 * @param {Date} now - The current time.
 * @returns {string} The window's description.
 */
function formatLimitLong(limit, now) {
  if (!limit) return 'not reported yet'

  if (isLimitStale(limit, now)) return `reset ${resetFull.format(limit.resetsAt)}, no reading since`

  const reset = limit.resetsAt
    ? `, resets in ${formatCountdown(limit.resetsAt, now)} (${resetFull.format(limit.resetsAt)})`
    : ''

  return `${percentLeft(limit)}% left${reset}`
}

/**
 * Format how long until something happens.
 * @param {Date} date - When it happens.
 * @param {Date} now - The current time.
 * @returns {string} The wait, such as `4 h 30 min` or `2 d 5 h`.
 */
function formatCountdown(date, now) {
  const minutes = Math.max(0, Math.ceil((date.getTime() - now.getTime()) / 60_000))
  const days = Math.floor(minutes / 1440)
  const hours = Math.floor((minutes % 1440) / 60)

  if (days) return hours ? `${days} d ${hours} h` : `${days} d`
  if (hours) return minutes % 60 ? `${hours} h ${minutes % 60} min` : `${hours} h`
  return `${minutes} min`
}

/**
 * Format how long ago something happened.
 * @param {Date} date - When it happened.
 * @param {Date} now - The current time.
 * @returns {string} The age, such as `3 min ago`.
 */
function formatAge(date, now) {
  const seconds = Math.max(0, (now.getTime() - date.getTime()) / 1000)

  if (seconds < 60) return 'just now'
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`
  if (seconds < 86_400) return `${Math.floor(seconds / 3600)} h ago`
  return shortDate.format(date)
}

/**
 * Escape text so Markdown shows it literally.
 * @param {string} text - The text to escape.
 * @returns {string} The escaped text.
 */
function escapeMarkdown(text) {
  return text.replace(/[\\`*_{}[\]()#+\-.!|<>~]/g, '\\$&')
}

/**
 * Shorten a path under the home folder to start with `~`.
 * @param {string} value - The path to shorten.
 * @returns {string} The shortened path.
 */
function tildify(value) {
  const home = os.homedir()

  return value === home || value.startsWith(`${home}/`) ? `~${value.slice(home.length)}` : value
}

/**
 * The context part of the status bar.
 * @typedef {object} ContextSegment
 * @property {string} text - The context ring icon and percent used, such as `$(statumo-cx-10) 12%`, or the empty ring alone when unknown.
 * @property {string | null} value - The percent used, such as `12%`, or null when unknown.
 */

/**
 * Build a tool's status bar segments: context used, then each window's percent left,
 * each percent led by a ring that fills to match it.
 * @param {import('./usage').ToolUsage} usage - The tool's readings.
 * @param {Date} now - The current time.
 * @returns {{ context: ContextSegment, windows: WindowSegment[] }} The context and the windows.
 */
function buildSegments(usage, now) {
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

/**
 * Decide a window's warning level from its percent left.
 * @param {import('./usage').LimitReading | null} limit - The window's reading.
 * @param {object} thresholds - Percent-left thresholds.
 * @param {number} thresholds.warningThreshold - At or below this, warn.
 * @param {number} thresholds.errorThreshold - At or below this, show an error.
 * @param {Date} now - The current time.
 * @returns {'error' | 'warning' | null} The level, or null when the window isn't low or isn't current.
 */
function getWindowLevel(limit, { warningThreshold, errorThreshold }, now) {
  if (!limit || isLimitStale(limit, now)) return null

  const remaining = percentLeft(limit)

  if (remaining <= errorThreshold) return 'error'
  if (remaining <= warningThreshold) return 'warning'
  return null
}

/**
 * Decide a tool's warning level from the lower of its two windows.
 * @param {import('./usage').ToolUsage['limits']} limits - The tool's windows.
 * @param {object} thresholds - Percent-left thresholds.
 * @param {number} thresholds.warningThreshold - At or below this, warn.
 * @param {number} thresholds.errorThreshold - At or below this, show an error.
 * @param {Date} now - The current time.
 * @returns {'error' | 'warning' | null} The more urgent window's level, or null when neither is low.
 */
function getToolLevel(limits, thresholds, now) {
  const levels = [getWindowLevel(limits.fiveHour, thresholds, now), getWindowLevel(limits.sevenDay, thresholds, now)]

  if (levels.includes('error')) return 'error'
  if (levels.includes('warning')) return 'warning'
  return null
}

/**
 * Build a tool's hover tooltip as Markdown.
 * @param {string} name - The tool's full name.
 * @param {import('./usage').ToolUsage} usage - The tool's readings.
 * @param {Date} now - The current time.
 * @returns {string} The tooltip's Markdown.
 */
function buildTooltip(name, usage, now) {
  const { session } = usage
  const title = session?.title ? ` · ${escapeMarkdown(session.title)}` : ''
  const lines = [`**${escapeMarkdown(name)}**${title}`, '']

  if (session) {
    const { tokens = null, window = null, percent = null } = session.context ?? {}
    const used = percent === null ? '' : ` · ${Math.round(percent)}% used`
    const context = session.context ? `${formatTokens(tokens)} / ${formatTokens(window)}${used}` : 'not reported yet'

    lines.push(`Context: ${escapeMarkdown(context)}`)
  } else {
    lines.push('Context: no session in this workspace yet')
  }

  lines.push(
    `5h limit: ${escapeMarkdown(formatLimitLong(usage.limits.fiveHour, now))}`,
    `7d limit: ${escapeMarkdown(formatLimitLong(usage.limits.sevenDay, now))}`,
  )

  if (usage.plan) lines.push(`Plan: ${escapeMarkdown(usage.plan)}`)

  lines.push('')

  if (session) {
    const state = session.isEnded ? 'ended' : 'updated'
    const folder = session.cwd ? `${escapeMarkdown(tildify(session.cwd))}, ` : ''

    lines.push(`Session: ${folder}${state} ${formatAge(session.updatedAt, now)}`)
  }

  if (usage.limitsUpdatedAt) lines.push(`Limits read ${formatAge(usage.limitsUpdatedAt, now)}`)

  lines.push('', `Click to open ${escapeMarkdown(name)}.`)

  return lines.join('  \n')
}

module.exports = {
  buildSegments,
  buildTooltip,
  escapeMarkdown,
  formatTokens,
  getToolLevel,
  getWindowLevel,
  windowNames,
}
