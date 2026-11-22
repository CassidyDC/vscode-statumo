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
 * @property {string} text - The window's ring icon and percent left, such as `$(statumo-5h-85) 84%`, or the empty ring alone when unknown or stale.
 * @property {string | null} value - The percent left, such as `84%`, or null when unknown or stale.
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

  if (!limit || isStale) return { key, text: ringIcon(ring, null), value: null, isStale, limit }

  const remaining = percentLeft(limit)

  return { key, text: `${ringIcon(ring, remaining)} ${remaining}%`, value: `${remaining}%`, isStale, limit }
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
 * How many cells wide a tooltip progress bar is.
 * @type {number}
 */
const barCells = 80

/**
 * Theme colors for a progress bar's fill, by warning level.
 * @type {Record<'normal' | 'warning' | 'error', string>}
 */
const barFills = {
  normal: 'var(--vscode-progressBar-background)',
  warning: 'var(--vscode-editorWarning-foreground)',
  error: 'var(--vscode-editorError-foreground)',
}

/**
 * Theme color for the unfilled part of a progress bar.
 * @type {string}
 */
const barTrack = 'var(--vscode-scrollbarSlider-background)'

/**
 * Show escaped text in the theme's dimmer description color.
 * @param {string} text - The escaped text.
 * @returns {string} The text's HTML.
 */
function dim(text) {
  return `<span style="color:var(--vscode-descriptionForeground);">${text}</span>`
}

/**
 * Draw a progress bar as HTML the hover sanitizer keeps: shrunken non-breaking spaces on theme-colored spans.
 * @param {number} percent - How full the bar is, from 0 to 100.
 * @param {'error' | 'warning' | null} [level] - The warning level that colors the fill.
 * @returns {string} The bar's HTML.
 */
function progressBar(percent, level = null) {
  const filled = Math.round((Math.max(0, Math.min(100, percent)) / 100) * barCells)

  /**
   * Draw one colored run of cells.
   * @param {string} color - The run's background color.
   * @param {number} cells - How many cells the run spans.
   * @returns {string} The run's HTML, or nothing when it spans no cells.
   */
  const run = (color, cells) => cells
    ? `<span style="background-color:${color};display:inline-block;border-radius:2px;">${'&nbsp;'.repeat(cells)}</span>`
    : ''

  return `<small><small>${run(barFills[level ?? 'normal'], filled)}${run(barTrack, barCells - filled)}</small></small>`
}

/**
 * Build one tooltip section: a heading line with a codicon, then optional bar and detail lines.
 * @param {string} icon - The codicon name.
 * @param {string} label - The section's label.
 * @param {string} value - The section's value, such as `84% left`.
 * @param {string | null} bar - The section's progress bar, or null for none.
 * @param {string[]} details - Detail lines, already escaped.
 * @returns {string} The section's Markdown.
 */
function tooltipSection(icon, label, value, bar, details) {
  const lines = [`$(${icon}) **${label}** · ${value}`]

  if (bar) lines.push(bar)

  lines.push(...details.map(detail => `<small>${detail}</small>`))

  return lines.join('  \n')
}

/**
 * Build the tooltip section for the session's context.
 * @param {import('./usage').SessionReading | null} session - The workspace's session.
 * @returns {string} The section's Markdown.
 */
function contextSection(session) {
  if (!session) return tooltipSection('layers', 'Context', 'no session', null, ['No session in this workspace yet'])
  if (!session.context) return tooltipSection('layers', 'Context', 'not reported', null, ['Not reported yet'])

  const { tokens = null, window = null, percent = null } = session.context
  const value = percent === null ? 'unknown' : `${Math.round(percent)}% used`
  const bar = percent === null ? null : progressBar(percent)

  return tooltipSection('layers', 'Context', value, bar, [escapeMarkdown(`${formatTokens(tokens)} / ${formatTokens(window)} tokens`)])
}

/**
 * Build the tooltip section for one rate-limit window.
 * @param {'fiveHour' | 'sevenDay'} key - Which window.
 * @param {import('./usage').LimitReading | null} limit - The window's reading.
 * @param {{ warningThreshold: number, errorThreshold: number }} thresholds - Percent-left thresholds.
 * @param {Date} now - The current time.
 * @returns {string} The section's Markdown.
 */
function limitSection(key, limit, thresholds, now) {
  const icon = key === 'fiveHour' ? 'clock' : 'calendar'
  const label = windowNames[key].replace(/^./, letter => letter.toUpperCase())

  if (!limit) return tooltipSection(icon, label, 'not reported', null, ['Not reported yet'])

  if (isLimitStale(limit, now)) {
    const reset = escapeMarkdown(`Reset ${resetFull.format(limit.resetsAt)}, no reading since`)

    return tooltipSection(icon, label, 'not current', progressBar(0), [reset])
  }

  const remaining = percentLeft(limit)
  const bar = progressBar(remaining, getWindowLevel(limit, thresholds, now))
  const details = limit.resetsAt
    ? [escapeMarkdown(`Resets in ${formatCountdown(limit.resetsAt, now)} · ${resetFull.format(limit.resetsAt)}`)]
    : []

  return tooltipSection(icon, label, `${remaining}% left`, bar, details)
}

/**
 * Build a tool's hover tooltip as Markdown with HTML: a large heading, then context and each window
 * in sections divided by rules, each with a progress bar, and the reading details at the bottom.
 *
 * Render it with `supportHtml` and `supportThemeIcons` on.
 * @param {string} name - The tool's full name.
 * @param {import('./usage').ToolUsage} usage - The tool's readings.
 * @param {{ warningThreshold: number, errorThreshold: number }} thresholds - Percent-left thresholds.
 * @param {Date} now - The current time.
 * @returns {string} The tooltip's Markdown.
 */
function buildTooltip(name, usage, thresholds, now) {
  const { session } = usage
  const header = [`### ${escapeMarkdown(name)}`]
  const footer = []

  if (session?.title) header.push(dim(escapeMarkdown(session.title)))
  if (usage.plan) footer.push(`Plan: ${escapeMarkdown(usage.plan)}`)

  if (session) {
    const state = session.isEnded ? 'ended' : 'updated'
    const folder = session.cwd ? `${escapeMarkdown(tildify(session.cwd))}, ` : ''

    footer.push(`Session: ${folder}${state} ${formatAge(session.updatedAt, now)}`)
  }

  if (usage.limitsUpdatedAt) footer.push(`Limits read ${formatAge(usage.limitsUpdatedAt, now)}`)

  footer.push(`Click to open ${escapeMarkdown(name)}.`)

  return [
    header.join('\n\n'),
    contextSection(session),
    limitSection('fiveHour', usage.limits.fiveHour, thresholds, now),
    limitSection('sevenDay', usage.limits.sevenDay, thresholds, now),
    footer.map(line => dim(`<small>${line}</small>`)).join('  \n'),
  ].join('\n\n---\n\n')
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
