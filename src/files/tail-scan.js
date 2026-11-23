/**
 * Incremental tail scanner.
 * @file Fold the lines of growing JSON Lines files into a state, reading the tail first and then only what was appended.
 */

'use strict'

const { readLines } = require('./files')

/**
 * What a scanner is told about a file before scanning it.
 * @typedef {object} FileState
 * @property {number} size - The file's size in bytes.
 * @property {number} mtimeMs - The file's modified time, in epoch milliseconds.
 */

/**
 * Scans files, each file's state cached until it changes.
 * @template S
 * @typedef {object} TailScanner
 * @property {(filePath: string, stats: FileState) => Promise<S>} scan - Brings a file's state up to date.
 * @property {(filePaths: Iterable<string>) => void} retain - Forgets every scanned file not in the list.
 */

/**
 * Create a scanner that folds a file's lines into a state.
 *
 * The first scan of a file, or a scan after the file shrank, reads its last `tailLength` bytes,
 * doubling the length until `isSettled` accepts the state, the read reaches the start of the file,
 * or the length reaches `maxTailLength`. Later scans read only the complete lines appended since,
 * and an unchanged file returns the state it had.
 * @template S
 * @param {object} options - How to read and fold.
 * @param {number} options.tailLength - Bytes read from the end of a file on its first scan.
 * @param {number} options.maxTailLength - The most bytes a first scan reads.
 * @param {S} options.initial - The state before any line is folded in.
 * @param {(lines: string[], state: S) => S} options.fold - Folds lines, oldest first, into a state, returning a new state without changing the one it was given.
 * @param {(state: S) => boolean} options.isSettled - Whether a first scan has read far enough back.
 * @returns {TailScanner<S>} The scanner.
 */
function createTailScanner({ tailLength, maxTailLength, initial, fold, isSettled }) {
  /**
   * Each file's size and modified time when last scanned, the offset after its last complete line, and its state.
   * @type {Map<string, { size: number, mtimeMs: number, end: number, state: S }>}
   */
  const entries = new Map()

  /**
   * Read a file's tail, further back while the state isn't settled.
   * @param {string} filePath - The file to read.
   * @param {number} size - The file's size.
   * @returns {Promise<{ end: number, state: S }>} The offset after the last complete line, and the state.
   */
  async function scanTail(filePath, size) {
    for (let length = tailLength; ; length *= 2) {
      /** Where this read starts. */
      const start = Math.max(0, size - length)

      /** The complete lines in the tail, and the offset after the last one. */
      const { lines, end } = await readLines(filePath, { start, end: size, skipPartialStart: true })

      /** The tail's lines folded into the initial state. */
      const state = fold(lines, initial)
      if (isSettled(state) || start === 0 || length >= maxTailLength) return { end, state }
    }
  }

  /**
   * Bring a file's state up to date.
   * @param {string} filePath - The file to scan.
   * @param {FileState} stats - The file's current size and modified time.
   * @returns {Promise<S>} The up-to-date state.
   */
  async function scan(filePath, { size, mtimeMs }) {
    /** The file's last scan. */
    const entry = entries.get(filePath)

    if (entry && entry.size === size && entry.mtimeMs === mtimeMs) return entry.state

    /** The complete lines appended since the last scan, when the file only grew. */
    const appended = entry && size >= entry.end ? await readLines(filePath, { start: entry.end, end: size }) : null

    /** The new offset and state. */
    const next = appended
      ? { end: appended.end, state: fold(appended.lines, entry.state) }
      : await scanTail(filePath, size)

    entries.set(filePath, { size, mtimeMs, ...next })

    return next.state
  }

  /**
   * Forget every scanned file not in a list, such as files that no longer exist.
   * @param {Iterable<string>} filePaths - The files to keep.
   * @returns {void}
   */
  function retain(filePaths) {
    /** The files to keep. */
    const kept = new Set(filePaths)

    for (const filePath of entries.keys()) {
      if (!kept.has(filePath)) entries.delete(filePath)
    }
  }

  return { scan, retain }
}

module.exports = { createTailScanner }
