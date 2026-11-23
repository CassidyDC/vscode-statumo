/**
 * Usage data shapes.
 * @file Describe the usage readings both readers return and build their parts from raw values.
 */

/**
 * One rate-limit window.
 * @typedef {object} LimitReading
 * @property {number} percentUsed - Percent of the window used, 0 to 100.
 * @property {Date | null} resetsAt - When the window resets, if reported.
 */

/**
 * The 5-hour, 7-day, and 7-day Fable rate-limit windows.
 * @typedef {object} Limits
 * @property {LimitReading | null} fiveHour - The 5-hour window.
 * @property {LimitReading | null} sevenDay - The 7-day window.
 * @property {LimitReading | null} sevenDayFable - The 7-day window for the Fable model, which only Claude Code reports.
 */

/**
 * A session's context window use.
 * @typedef {object} ContextReading
 * @property {number | null} tokens - Tokens in the context window.
 * @property {number | null} window - The context window's size in tokens.
 * @property {number | null} percent - Percent of the window used.
 */

/**
 * The workspace session a tool's item follows.
 * @typedef {object} SessionReading
 * @property {string | null} title - The session's title.
 * @property {string | null} cwd - The session's working folder.
 * @property {ContextReading | null} context - The session's context use.
 * @property {Date} updatedAt - When the session last changed.
 */

/**
 * Everything one tool's status bar item shows.
 * @typedef {object} ToolUsage
 * @property {SessionReading | null} session - The latest session in this workspace.
 * @property {Limits} limits - The account's latest rate-limit readings.
 * @property {Date | null} limitsUpdatedAt - When the 5-hour and 7-day limits were read.
 * @property {Date | null} [fableUpdatedAt] - When the Fable limit was read, when it's reported.
 * @property {string | null} plan - The account's plan, when the tool reports it.
 * @property {'subscription' | 'api' | null} access - Whether the tool signs in with a subscription or an API key, when known.
 */

/**
 * Return a finite number, or null.
 * @param {unknown} value - The value to check.
 * @returns {number | null} The number, or null.
 */
function finiteOrNull(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

/**
 * Parse a date from an ISO string or epoch milliseconds, or return null.
 * @param {unknown} value - The value to parse.
 * @returns {Date | null} The date, or null when it isn't valid.
 */
function dateOrNull(value) {
  if (typeof value !== 'string' && typeof value !== 'number') return null

  /** The parsed date, which may be invalid. */
  const date = new Date(value)
  return Number.isFinite(date.getTime()) ? date : null
}

/**
 * Build a limit reading, or null when the percentage is missing.
 * @param {unknown} percentUsed - Percent of the window used.
 * @param {Date | null} resetsAt - When the window resets.
 * @returns {LimitReading | null} The reading, or null.
 */
function makeLimit(percentUsed, resetsAt) {
  /** The percent used as a finite number. */
  const percent = finiteOrNull(percentUsed)
  return percent === null ? null : { percentUsed: percent, resetsAt }
}

/**
 * An empty set of limit readings.
 * @returns {Limits} Limits with no window reported.
 */
function emptyLimits() {
  return { fiveHour: null, sevenDay: null, sevenDayFable: null }
}

/**
 * Whether the 5-hour or 7-day window has a reading.
 * @param {Limits} limits - The limits to check.
 * @returns {boolean} True when at least one of the two is reported.
 */
function hasLimits(limits) {
  return Boolean(limits.fiveHour || limits.sevenDay)
}

export { dateOrNull, emptyLimits, finiteOrNull, hasLimits, makeLimit }
