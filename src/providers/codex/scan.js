/**
 * Codex log scanning.
 * @file Fold the token count events of a Codex session log into its latest context use and rate limits.
 */

'use strict'

const { parseJson } = require('../../files/files')
const { createTailScanner } = require('../../files/tail-scan')
const { dateOrNull, emptyLimits, finiteOrNull, hasLimits, makeLimit } = require('../../usage/model')

/**
 * Bytes read from the end of a log on its first scan.
 * @type {number}
 */
const tailLength = 1024 * 1024

/**
 * The most bytes a first scan reads looking for context use.
 * @type {number}
 */
const maxTailLength = 4 * 1024 * 1024

/**
 * What a log's latest token counts said.
 * @typedef {object} LogScan
 * @property {import('../../usage/model').ContextReading | null} context - The latest context use.
 * @property {import('../../usage/model').Limits | null} limits - The latest rate limits.
 * @property {Date | null} limitsAt - When those limits were reported.
 * @property {string | null} plan - The plan those limits came with.
 */

/**
 * A log's scan before any line is read.
 * @type {LogScan}
 */
const emptyScan = Object.freeze({ context: null, limits: null, limitsAt: null, plan: null })

/**
 * Turn a token count event's rate limits into the 5-hour and 7-day windows, telling them apart
 * by their length. A window that doesn't give its length is skipped.
 * @param {any} rateLimits - The event's `rate_limits`.
 * @returns {import('../../usage/model').Limits} The windows.
 */
function toLimits(rateLimits) {
  /** The windows found so far. */
  const limits = emptyLimits()

  for (const window of [rateLimits?.primary, rateLimits?.secondary]) {
    /** The window's length in minutes. */
    const minutes = finiteOrNull(window?.window_minutes)
    if (minutes === null) continue

    /** When the window resets, from epoch seconds. */
    const resetsAt = Number.isFinite(window.resets_at) ? new Date(window.resets_at * 1000) : null
    limits[minutes <= 24 * 60 ? 'fiveHour' : 'sevenDay'] ??= makeLimit(window.used_percent, resetsAt)
  }

  return limits
}

/**
 * Format a plan type such as `plus` as `Plus`.
 * @param {unknown} plan - The plan type.
 * @returns {string | null} The plan's name, or null.
 */
function formatPlan(plan) {
  return typeof plan === 'string' && plan ? plan.charAt(0).toUpperCase() + plan.slice(1) : null
}

/**
 * Fold log lines into a scan, newer lines replacing older readings.
 * @param {string[]} lines - Log lines, oldest first.
 * @param {LogScan} scan - The scan so far.
 * @returns {LogScan} The updated scan.
 */
function foldTokenCounts(lines, scan) {
  /** The readings so far, and whether these lines replaced each. */
  let { context, limits, limitsAt, plan } = scan
  let hasNewContext = false
  let hasNewLimits = false

  for (let index = lines.length - 1; index >= 0 && !(hasNewContext && hasNewLimits); index -= 1) {
    /** The line being read. */
    const line = lines[index]

    if (!line.includes('"token_count"')) continue

    /** The line's event, and its payload. */
    const event = parseJson(line)
    const payload = event?.payload

    if (event?.type !== 'event_msg' || payload?.type !== 'token_count') continue

    /** The token use of the event's last turn. */
    const usage = payload.info?.last_token_usage

    if (!hasNewContext && usage) {
      /** The turn's tokens, the model's window, and the percent of it used. */
      const tokens = finiteOrNull(usage.total_tokens)
      const window = finiteOrNull(payload.info.model_context_window)
      const percent = tokens !== null && window ? Math.round((tokens / window) * 100) : null
      context = { tokens, window, percent }
      hasNewContext = true
    }

    /** When the event was logged, and its rate limits. */
    const timestamp = dateOrNull(event.timestamp)
    const eventLimits = toLimits(payload.rate_limits)

    if (!hasNewLimits && hasLimits(eventLimits)) {
      limits = eventLimits
      limitsAt = timestamp
      plan = formatPlan(payload.rate_limits?.plan_type)
      hasNewLimits = true
    }
  }

  return { context, limits, limitsAt, plan }
}

/**
 * Create a scanner that keeps each log's latest token counts, reading further back on a first
 * scan only while the latest context reading is still missing.
 * @returns {import('../../files/tail-scan').TailScanner<LogScan>} The scanner.
 */
function createLogScanner() {
  return createTailScanner({
    tailLength,
    maxTailLength,
    initial: emptyScan,
    fold: foldTokenCounts,

    /**
     * Whether a first scan has found the latest context reading.
     * @param {LogScan} scan - The scan so far.
     * @returns {boolean} True once the scan has a context reading.
     */
    isSettled: scan => scan.context !== null,
  })
}

module.exports = { createLogScanner }
