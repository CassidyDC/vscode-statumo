/**
 * Cached JSON file reader.
 * @file Read small JSON files, reusing each file's last reading while it's unchanged and keeping the last good one while it's broken.
 */

'use strict'

const fs = require('node:fs/promises')
const { parseJson, statFile } = require('./files')

/**
 * A file's converted value, and the file's modified time when that value was read.
 * @template T
 * @typedef {object} JsonReading
 * @property {T} value - The converted value.
 * @property {number} mtimeMs - The file's modified time, in epoch milliseconds.
 */

/**
 * Reads JSON files through one converter, each file cached until it changes.
 * @template T
 * @typedef {object} CachedJsonReader
 * @property {(filePath: string) => Promise<JsonReading<T> | null>} read - Reads a file, or resolves null when it's missing or has never held a valid value.
 * @property {(filePaths: Iterable<string>) => void} retain - Forgets every cached file not in the list.
 * @property {(filePath: string) => void} forget - Forgets one cached file.
 */

/**
 * Create a reader that turns JSON files into values, reusing a file's reading while its modified
 * time and size are unchanged.
 *
 * A file caught mid-write fails to parse. Then, or when the converter rejects the file by
 * returning undefined, the reader keeps the last good reading until the file settles.
 * @template T
 * @param {(data: any) => T | undefined} convert - Turns the parsed JSON into a value, or returns undefined to reject it.
 * @returns {CachedJsonReader<T>} The reader.
 */
function createCachedJson(convert) {
  /**
   * Each file's size and modified time when last read, and the reading kept for it.
   * @type {Map<string, { mtimeMs: number, size: number, reading: JsonReading<T> | null }>}
   */
  const cache = new Map()

  /**
   * Read a file, reusing its cached reading while it's unchanged.
   * @param {string} filePath - The file to read.
   * @returns {Promise<JsonReading<T> | null>} The reading, or null when the file is missing or has never held a valid value.
   */
  async function read(filePath) {
    /** The file's current stats. */
    const stats = await statFile(filePath)

    if (!stats) {
      cache.delete(filePath)
      return null
    }

    /** The file's cached entry. */
    const cached = cache.get(filePath)

    if (cached?.mtimeMs === stats.mtimeMs && cached.size === stats.size) return cached.reading

    /** The file's text, its parsed JSON, and the converted value. */
    const text = await fs.readFile(filePath, 'utf8').catch(() => undefined)
    const data = text === undefined ? undefined : parseJson(text)
    const value = data === undefined ? undefined : convert(data)

    /** The new reading, or the last good one when the file is broken or rejected. */
    const reading = value === undefined ? (cached?.reading ?? null) : { value, mtimeMs: stats.mtimeMs }

    cache.set(filePath, { mtimeMs: stats.mtimeMs, size: stats.size, reading })

    return reading
  }

  /**
   * Forget every cached file not in a list, such as files that no longer exist.
   * @param {Iterable<string>} filePaths - The files to keep.
   * @returns {void}
   */
  function retain(filePaths) {
    /** The files to keep. */
    const kept = new Set(filePaths)

    for (const filePath of cache.keys()) {
      if (!kept.has(filePath)) cache.delete(filePath)
    }
  }

  /**
   * Forget one cached file.
   * @param {string} filePath - The file to forget.
   * @returns {void}
   */
  function forget(filePath) {
    cache.delete(filePath)
  }

  return { read, retain, forget }
}

module.exports = { createCachedJson }
