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
 * Formats a reset's time of day, such as `09:00`.
 * @type {Intl.DateTimeFormat}
 */
const clockTime = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })

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
 * Percent of a window used, rounded and kept between 0 and 100.
 * @param {import('./usage').LimitReading} limit - The window's reading.
 * @returns {number} The percent used.
 */
function percentUsed(limit) {
  return Math.max(0, Math.min(100, Math.round(limit.percentUsed)))
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
 * @property {string} text - The window's ring icon and percent used, such as `$(statumo-5h-15) 16%`, or the empty ring alone when unknown or stale.
 * @property {string | null} value - The percent used, such as `16%`, or null when unknown or stale.
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

  const used = percentUsed(limit)

  return { key, text: `${ringIcon(ring, used)} ${used}%`, value: `${used}%`, isStale, limit }
}

/**
 * Format a span of whole minutes in days, hours, and minutes, leaving out units that are zero.
 * @param {number} minutes - The span in minutes.
 * @returns {string} The span, such as `5h 22m` or `1d 3m`, or `<1m` when under a minute.
 */
function formatDuration(minutes) {
  const parts = [
    [Math.floor(minutes / 1440), 'd'],
    [Math.floor((minutes % 1440) / 60), 'h'],
    [minutes % 60, 'm'],
  ].filter(([amount]) => amount > 0)

  return parts.length ? parts.map(([amount, unit]) => `${amount}${unit}`).join(' ') : '<1m'
}

/**
 * Format when a window resets and how long until then.
 * @param {Date} date - The reset time.
 * @param {Date} now - The current time.
 * @returns {string} The reset, such as `Nov 27 at 09:00 (4d 23h)`.
 */
function formatReset(date, now) {
  const minutes = Math.max(0, Math.ceil((date.getTime() - now.getTime()) / 60_000))

  return `${shortDate.format(date)} at ${clockTime.format(date)} (${formatDuration(minutes)})`
}

/**
 * Format how long ago something happened.
 * @param {Date} date - When it happened.
 * @param {Date} now - The current time.
 * @returns {string} The age, such as `2m ago` or `1d 3h ago`.
 */
function formatAge(date, now) {
  const minutes = Math.max(0, Math.floor((now.getTime() - date.getTime()) / 60_000))

  return minutes ? `${formatDuration(minutes)} ago` : 'just now'
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
 * Escape text so HTML shows it literally, for text inside HTML blocks, where Markdown escapes don't apply.
 * @param {string} text - The text to escape.
 * @returns {string} The escaped text.
 */
function escapeHtml(text) {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
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
 * Shorten a long path in the middle, keeping its first folder and as many trailing folders as fit.
 * @param {string} value - The path to shorten.
 * @param {number} [maxLength] - The longest the result may be.
 * @returns {string} The path, such as `~/…/Packages/Repos/_statumo`.
 */
function truncatePath(value, maxLength = 40) {
  if (value.length <= maxLength) return value

  const parts = value.split('/')
  const head = parts[0] === '' ? `/${parts[1]}` : parts[0]
  const tail = []

  for (let index = parts.length - 1; index > (parts[0] === '' ? 1 : 0); index--) {
    const candidate = [parts[index], ...tail].join('/')

    if (`${head}/…/${candidate}`.length > maxLength) break

    tail.unshift(parts[index])
  }

  if (tail.length) return `${head}/…/${tail.join('/')}`

  return `…${value.slice(-(maxLength - 1))}`
}

/**
 * The context part of the status bar.
 * @typedef {object} ContextSegment
 * @property {string} text - The context ring icon and percent used, such as `$(statumo-cx-10) 12%`, or the empty ring alone when unknown.
 * @property {string | null} value - The percent used, such as `12%`, or null when unknown.
 */

/**
 * Build a tool's status bar segments: the percent of context used, then of each window used,
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
 * How many cells wide a tooltip progress bar is, about 320px at the hover's 13px text.
 * @type {number}
 */
const barCells = 41

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
 * Theme color for the unfilled part of a progress bar: the hover's border, which is opaque so the cells join without seams.
 * @type {string}
 */
const barTrack = 'var(--vscode-editorHoverWidget-border)'

/**
 * Show escaped text in the theme's dimmer description color.
 * @param {string} text - The escaped text.
 * @returns {string} The text's HTML.
 */
function dim(text) {
  return `<span style="color:var(--vscode-descriptionForeground);">${text}</span>`
}

/**
 * Draw a progress bar as HTML the hover sanitizer keeps: runs of lower-quarter block characters,
 * which join into a solid line a quarter of the text's height, about 4px, colored with theme colors.
 * @param {number} percent - How full the bar is, from 0 to 100.
 * @param {'error' | 'warning' | null} [level] - The warning level that colors the fill.
 * @returns {string} The bar's HTML.
 */
function progressBar(percent, level = null) {
  const filled = Math.round((Math.max(0, Math.min(100, percent)) / 100) * barCells)

  /**
   * Draw one colored run of cells.
   * @param {string} color - The run's color.
   * @param {number} cells - How many cells the run spans.
   * @returns {string} The run's HTML, or nothing when it spans no cells.
   */
  const run = (color, cells) => cells ? `<span style="color:${color};">${'▂'.repeat(cells)}</span>` : ''

  return `${run(barFills[level ?? 'normal'], filled)}${run(barTrack, barCells - filled)}`
}

/**
 * Format a section's amount as a second-level heading, the only way a hover shows text larger than
 * normal: the percent, then a smaller dimmed word.
 * @param {number} percent - The percent.
 * @param {string} word - What the percent measures, such as `used`.
 * @returns {string} The amount's Markdown.
 */
function amount(percent, word) {
  return `## ${percent}% ${dim(`<small>${word}</small>`)}`
}

/**
 * Build one tooltip section: a bold label with an optional dimmed note aligned to the right edge,
 * the amount, then an optional bar. The heading is a full-width table, the only way the hover
 * sanitizer allows right alignment, so the note ends where the bar ends.
 * @param {string} label - The section's label.
 * @param {string | null} note - The note across from the label, unescaped, or null for none.
 * @param {string} value - The section's amount, or a dimmed status, as Markdown.
 * @param {string | null} bar - The section's progress bar, or null for none.
 * @returns {string} The section's Markdown.
 */
function tooltipSection(label, note, value, bar) {
  const noteCell = note ? `<td align="right">${dim(escapeHtml(note))}</td>` : ''
  const heading = `<table width="100%"><tr><td><b>${escapeHtml(label)}</b></td>${noteCell}</tr></table>`

  return [heading, value, bar].filter(Boolean).join('\n\n')
}

/**
 * Build the tooltip section for the session's context.
 * @param {import('./usage').SessionReading | null} session - The workspace's session.
 * @returns {string} The section's Markdown.
 */
function contextSection(session) {
  if (!session) return tooltipSection('Context', null, dim('No session in this workspace yet'), null)
  if (!session.context) return tooltipSection('Context', null, dim('Not reported yet'), null)

  const { tokens = null, window = null, percent = null } = session.context
  const note = `${formatTokens(tokens)} / ${formatTokens(window)} tokens`

  if (percent === null) return tooltipSection('Context', note, dim('Unknown'), null)

  return tooltipSection('Context', note, amount(Math.round(percent), 'used'), progressBar(percent))
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
  const label = windowNames[key].replace(/^./, letter => letter.toUpperCase())

  if (!limit) return tooltipSection(label, null, dim('Not reported yet'), null)

  if (isLimitStale(limit, now)) {
    const note = `Reset ${shortDate.format(limit.resetsAt)} at ${clockTime.format(limit.resetsAt)}`

    return tooltipSection(label, note, dim('No reading since the reset'), progressBar(0))
  }

  const used = percentUsed(limit)
  const note = limit.resetsAt ? `Resets ${formatReset(limit.resetsAt, now)}` : null

  return tooltipSection(label, note, amount(used, 'used'), progressBar(used, getWindowLevel(limit, thresholds, now)))
}

/**
 * Build the tooltip's footer lines: the plan, the session's title and folder, and when the session
 * and limits were last updated, merged into one line when both read the same.
 * @param {import('./usage').ToolUsage} usage - The tool's readings.
 * @param {Date} now - The current time.
 * @returns {string[]} The lines, already escaped.
 */
function footerLines(usage, now) {
  const { session } = usage
  const lines = []
  const sessionAge = session ? formatAge(session.updatedAt, now) : null
  const limitsAge = usage.limitsUpdatedAt ? formatAge(usage.limitsUpdatedAt, now) : null

  if (usage.plan) lines.push(`Plan: ${escapeMarkdown(usage.plan)}`)
  if (session?.title) lines.push(`Chat Title: ${escapeMarkdown(session.title)}`)
  if (session?.cwd) lines.push(`Session: ${escapeMarkdown(truncatePath(tildify(session.cwd)))}`)

  if (sessionAge && sessionAge === limitsAge && !session.isEnded) {
    lines.push(`Updated: ${sessionAge}`)
  } else {
    if (sessionAge) lines.push(`Session ${session.isEnded ? 'Ended' : 'Updated'}: ${sessionAge}`)
    if (limitsAge) lines.push(`Limits Read: ${limitsAge}`)
  }

  return lines
}

/**
 * Build a tool's hover tooltip as Markdown with HTML: a plain title, then context and each window
 * in sections divided by rules, each with a progress bar, and the session and reading details at the bottom.
 *
 * Render it with `supportHtml` on.
 * @param {string} name - The tool's full name.
 * @param {import('./usage').ToolUsage} usage - The tool's readings.
 * @param {{ warningThreshold: number, errorThreshold: number }} thresholds - Percent-left thresholds.
 * @param {Date} now - The current time.
 * @returns {string} The tooltip's Markdown.
 */
function buildTooltip(name, usage, thresholds, now) {
  return [
    escapeMarkdown(`${name} - Statumo`),
    contextSection(usage.session),
    limitSection('fiveHour', usage.limits.fiveHour, thresholds, now),
    limitSection('sevenDay', usage.limits.sevenDay, thresholds, now),
    footerLines(usage, now).map(dim).join('  \n'),
  ].filter(Boolean).join('\n\n---\n\n')
}

module.exports = {
  buildSegments,
  buildTooltip,
  escapeMarkdown,
  formatTokens,
  getToolLevel,
  getWindowLevel,
  truncatePath,
  windowNames,
}
