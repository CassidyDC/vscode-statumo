/**
 * File reading helpers.
 * @file Read parts of large JSON Lines files without loading them whole.
 */

'use strict'

const fs = require('node:fs/promises')

/**
 * Read a byte range of a file.
 * @param {string} filePath - The file to read.
 * @param {number} start - The first byte to read.
 * @param {number} end - The byte to stop before.
 * @returns {Promise<Buffer>} The bytes in the range.
 */
async function readRange(filePath, start, end) {
  /** How many bytes the range spans. */
  const length = Math.max(0, end - start)

  if (!length) return Buffer.alloc(0)

  /** The open file. */
  const handle = await fs.open(filePath, 'r')

  try {
    /** The buffer the read fills, and how many bytes it filled. */
    const buffer = Buffer.alloc(length)
    const { bytesRead } = await handle.read(buffer, 0, length, start)
    return buffer.subarray(0, bytesRead)
  } finally {
    await handle.close()
  }
}

/**
 * Read the complete lines in a byte range of a file.
 *
 * A trailing line with no newline yet is left for a later read, and `end` in the
 * result says where that read should start. With `skipPartialStart`, the first line
 * is dropped because the range may begin in the middle of it.
 * @param {string} filePath - The file to read.
 * @param {object} range - The range to read.
 * @param {number} range.start - The first byte to read.
 * @param {number} range.end - The byte to stop before.
 * @param {boolean} [range.skipPartialStart] - Drop the first line when `start` is past 0.
 * @returns {Promise<{ lines: string[], end: number }>} The lines, oldest first, and the offset after the last newline.
 */
async function readLines(filePath, { start, end, skipPartialStart = false }) {
  /** The range's bytes, and where the last newline in them sits. */
  const buffer = await readRange(filePath, start, end)
  const lastNewline = buffer.lastIndexOf(0x0a)
  if (lastNewline === -1) return { lines: [], end: start }

  /** The lines before the last newline. */
  const lines = buffer.subarray(0, lastNewline).toString('utf8').split('\n')
  if (skipPartialStart && start > 0) lines.shift()
  return { lines: lines.filter(line => line.trim() !== ''), end: start + lastNewline + 1 }
}

/**
 * Parse one JSON value, or return undefined when it isn't valid JSON.
 * @param {string} text - The JSON text.
 * @returns {any} The parsed value, or undefined.
 */
function parseJson(text) {
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}

/**
 * List a folder's entry names, or an empty list when the folder is missing.
 * @param {string} folder - The folder to list.
 * @returns {Promise<string[]>} The entry names.
 */
async function listNames(folder) {
  try {
    return await fs.readdir(folder)
  } catch (error) {
    if (error.code === 'ENOENT' || error.code === 'ENOTDIR') return []
    throw error
  }
}

/**
 * Stat a file, or return undefined when it's gone.
 * @param {string} filePath - The file to stat.
 * @returns {Promise<import('node:fs').Stats | undefined>} The file's stats, or undefined.
 */
async function statFile(filePath) {
  try {
    return await fs.stat(filePath)
  } catch (error) {
    if (error.code === 'ENOENT') return undefined
    throw error
  }
}

module.exports = { listNames, parseJson, readLines, readRange, statFile }
