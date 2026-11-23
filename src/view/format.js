/**
 * Value formatting.
 * @file Format token counts, spans of time, reset times, and reading ages for the status bar and tooltip.
 */

'use strict'

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
 * Format a token count with `k` for thousands and `m` for millions.
 * @param {number | null} tokens - The token count.
 * @returns {string} The formatted count, such as `48.3k`.
 */
function formatTokens(tokens) {
  if (tokens === null) return dash

  /** The count in thousands, to one decimal. */
  const thousands = Math.round(tokens / 100) / 10
  if (thousands < 1000) return `${thousands}k`
  return `${Math.round(tokens / 100_000) / 10}m`
}

/**
 * Format a span of whole minutes in days, hours, and minutes, leaving out units that are zero.
 * @param {number} minutes - The span in minutes.
 * @returns {string} The span, such as `5h 22m` or `1d 3m`, or `<1m` when under a minute.
 */
function formatDuration(minutes) {
  /** Each unit's amount, leaving out units that are zero. */
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
  /** Whole minutes until the reset, rounded up. */
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
  /** Whole minutes since then, rounded down. */
  const minutes = Math.max(0, Math.floor((now.getTime() - date.getTime()) / 60_000))
  return minutes ? `${formatDuration(minutes)} ago` : 'just now'
}

module.exports = { formatAge, formatDuration, formatReset, formatTokens }
