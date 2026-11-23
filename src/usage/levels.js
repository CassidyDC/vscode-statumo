/**
 * Rate-limit levels.
 * @file Decide whether a limit reading is still current, how much of it is used or left, and whether it warns.
 */

/**
 * Whether a window's reset time has passed with no newer reading.
 * @param {import('./model.js').LimitReading | null} limit - The window's reading.
 * @param {Date} now - The current time.
 * @returns {boolean} True when the reading predates the window's reset.
 */
function isLimitStale(limit, now) {
  return Boolean(limit?.resetsAt && limit.resetsAt.getTime() <= now.getTime())
}

/**
 * Percent of a window used, rounded and kept between 0 and 100.
 * @param {import('./model.js').LimitReading} limit - The window's reading.
 * @returns {number} The percent used.
 */
function percentUsed(limit) {
  return Math.max(0, Math.min(100, Math.round(limit.percentUsed)))
}

/**
 * Percent of a window left, rounded and kept between 0 and 100.
 * @param {import('./model.js').LimitReading} limit - The window's reading.
 * @returns {number} The percent left.
 */
function percentLeft(limit) {
  return Math.max(0, Math.min(100, Math.round(100 - limit.percentUsed)))
}

/**
 * Decide a window's warning level from its percent left.
 * @param {import('./model.js').LimitReading | null} limit - The window's reading.
 * @param {object} thresholds - Percent-left thresholds.
 * @param {number} thresholds.warningThreshold - At or below this, warn.
 * @param {number} thresholds.errorThreshold - At or below this, show an error.
 * @param {Date} now - The current time.
 * @returns {'error' | 'warning' | null} The level, or null when the window isn't low or isn't current.
 */
function getWindowLevel(limit, { warningThreshold, errorThreshold }, now) {
  if (!limit || isLimitStale(limit, now)) return null

  /** Percent of the window left. */
  const remaining = percentLeft(limit)
  if (remaining <= errorThreshold) return 'error'
  if (remaining <= warningThreshold) return 'warning'
  return null
}

/**
 * Decide a tool's warning level from the lower of its two windows.
 * @param {import('./model.js').Limits} limits - The tool's windows.
 * @param {object} thresholds - Percent-left thresholds.
 * @param {number} thresholds.warningThreshold - At or below this, warn.
 * @param {number} thresholds.errorThreshold - At or below this, show an error.
 * @param {Date} now - The current time.
 * @returns {'error' | 'warning' | null} The more urgent window's level, or null when neither is low.
 */
function getToolLevel(limits, thresholds, now) {
  /** Each window's level. */
  const levels = [getWindowLevel(limits.fiveHour, thresholds, now), getWindowLevel(limits.sevenDay, thresholds, now)]
  if (levels.includes('error')) return 'error'
  if (levels.includes('warning')) return 'warning'
  return null
}

export { getToolLevel, getWindowLevel, isLimitStale, percentLeft, percentUsed }
