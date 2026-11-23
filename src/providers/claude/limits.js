/**
 * Claude Code limits file.
 * @file Read the account's latest rate limits from the `statumo/limits.json` file the Usage mod writes.
 */

'use strict'

const path = require('node:path')
const { createCachedJson } = require('../../files/cached-json')
const { dateOrNull, emptyLimits, hasLimits, makeLimit } = require('../../usage/model')

/**
 * Which window each rate-limit kind Claude reports fills; other kinds, such as a gateway's `spend_limit`, are ignored.
 * @type {Record<string, 'fiveHour' | 'sevenDay'>}
 */
const windowKeys = { five_hour: 'fiveHour', seven_day: 'sevenDay' }

/**
 * The account's latest limits, dated by when the mod wrote them.
 * @typedef {object} ClaudeLimits
 * @property {import('../../usage/model').Limits} limits - The 5-hour and 7-day windows.
 * @property {Date} updatedAt - When the limits were read.
 */

/**
 * Turn the limits file's JSON into the 5-hour and 7-day windows, or reject it when it has no list of limits.
 * @param {any} data - The parsed JSON.
 * @returns {import('../../usage/model').Limits | undefined} The windows, or undefined.
 */
function toLimits(data) {
  if (!Array.isArray(data?.rateLimits)) return undefined

  /** The windows found so far. */
  const limits = emptyLimits()

  for (const limit of data.rateLimits) {
    /** The window this kind fills. */
    const key = typeof limit?.kind === 'string' && Object.hasOwn(windowKeys, limit.kind) ? windowKeys[limit.kind] : null
    if (key) limits[key] ??= makeLimit(limit.percentUsed, dateOrNull(limit.resetsAt))
  }

  return limits
}

/**
 * Create a reader of the limits file, reusing the last reading while the file is unchanged.
 * @returns {(configDirectory: string) => Promise<ClaudeLimits | null>} Reads the limits for a Claude config folder.
 */
function createLimitsReader() {
  /** The limits file's reader. */
  const reader = createCachedJson(toLimits)

  /**
   * Read the account's latest 5-hour and 7-day limits.
   * @param {string} configDirectory - The Claude config folder.
   * @returns {Promise<ClaudeLimits | null>} The limits, or null when the file is missing or holds neither window.
   */
  async function readLimits(configDirectory) {
    /** The file's reading. */
    const reading = await reader.read(path.join(configDirectory, 'statumo', 'limits.json'))
    if (!reading || !hasLimits(reading.value)) return null
    return { limits: reading.value, updatedAt: new Date(reading.mtimeMs) }
  }

  return readLimits
}

module.exports = { createLimitsReader }
