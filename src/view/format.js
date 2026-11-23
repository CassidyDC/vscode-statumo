/**
 * Value formatting.
 * @file Format token counts, spans of time, reset times, and reading ages for the status bar and tooltip.
 */

/**
 * Formats an older reading's date, such as `Nov 27`.
 * @type {Intl.DateTimeFormat}
 */
const shortDate = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' })

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
 * Format a time of day on a 12-hour clock, such as `9:00 AM`, or a 24-hour clock, such as `09:00`.
 * @param {Date} date - The time.
 * @param {'12h' | '24h'} timeFormat - Which clock to use.
 * @returns {string} The time of day.
 */
function formatClock(date, timeFormat) {
  /** The hour on a 24-hour clock, and the minutes, padded to two digits. */
  const hours = date.getHours()
  const minutes = String(date.getMinutes()).padStart(2, '0')
  if (timeFormat === '24h') return `${String(hours).padStart(2, '0')}:${minutes}`
  return `${hours % 12 || 12}:${minutes} ${hours < 12 ? 'AM' : 'PM'}`
}

/**
 * Name a date's day relative to now, as `today`, `tomorrow`, or a short date such as `Nov 27`.
 * @param {Date} date - The date to name.
 * @param {Date} now - The current time.
 * @returns {string} The day's name.
 */
function formatDay(date, now) {
  /** Local midnight at the start of today and of tomorrow. */
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)

  /** Local midnight at the start of the date's day. */
  const day = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
  if (day === today.getTime()) return 'today'
  if (day === tomorrow.getTime()) return 'tomorrow'
  return shortDate.format(date)
}

/**
 * Format when a window resets, and optionally how long until then.
 * @param {Date} date - The reset time.
 * @param {Date} now - The current time.
 * @param {object} [options] - How to format it.
 * @param {'12h' | '24h'} [options.timeFormat] - Which clock to show the time on.
 * @param {boolean} [options.showTimeUntilReset] - Whether to add how long until the reset.
 * @returns {string} The reset, such as `today at 2:30 PM`, `tomorrow at 9:00 AM`, or `Nov 27 at 09:00 (4d 23h)`.
 */
function formatReset(date, now, { timeFormat = '12h', showTimeUntilReset = false } = {}) {
  /** The reset's day and time of day. */
  const when = `${formatDay(date, now)} at ${formatClock(date, timeFormat)}`
  if (!showTimeUntilReset) return when

  /** Whole minutes until the reset, rounded up. */
  const minutes = Math.max(0, Math.ceil((date.getTime() - now.getTime()) / 60_000))
  return `${when} (${formatDuration(minutes)})`
}

/**
 * Format how long ago something happened.
 * @param {Date} date - When it happened.
 * @param {Date} now - The current time.
 * @returns {string} The age, such as `2m ago`, `1d 3h ago`, or `Just now`.
 */
function formatAge(date, now) {
  /** Whole minutes since then, rounded down. */
  const minutes = Math.max(0, Math.floor((now.getTime() - date.getTime()) / 60_000))
  return minutes ? `${formatDuration(minutes)} ago` : 'Just now'
}

export { formatAge, formatClock, formatDuration, formatReset, formatTokens }
