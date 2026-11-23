/**
 * Codex session titles.
 * @file Read session titles from the end of Codex's session index, then only what was appended.
 */

import path from 'node:path'
import { parseJson, statFile } from '../../files/files.js'
import { createTailScanner } from '../../files/tail-scan.js'

/**
 * Bytes read from the end of the session index for titles.
 * @type {number}
 */
const indexLength = 512 * 1024

/**
 * Fold session index rows into titles by session id, later rows replacing earlier ones.
 * @param {string[]} lines - Index rows, oldest first.
 * @param {Map<string, string>} titles - The titles so far.
 * @returns {Map<string, string>} The updated titles.
 */
function foldTitles(lines, titles) {
  /** A copy of the titles, so the given map stays unchanged. */
  const next = new Map(titles)

  for (const line of lines) {
    /** The index row. */
    const row = parseJson(line)

    if (typeof row?.id === 'string' && typeof row.thread_name === 'string' && row.thread_name.trim()) {
      next.set(row.id, row.thread_name.trim())
    }
  }

  return next
}

/**
 * Create a reader of Codex's session titles.
 * @returns {(homeDirectory: string) => Promise<Map<string, string>>} Reads titles by session id from a Codex home folder.
 */
function createTitleReader() {
  /** The session index's scanner. */
  const scanner = createTailScanner({
    tailLength: indexLength,
    maxTailLength: indexLength,
    initial: new Map(),
    fold: foldTitles,

    /**
     * Settle on the first read, since only the end of the index is read for titles.
     * @returns {boolean} Always true.
     */
    isSettled: () => true,
  })

  /**
   * Read session titles from Codex's session index.
   * @param {string} homeDirectory - The Codex home folder.
   * @returns {Promise<Map<string, string>>} Titles by session id.
   */
  async function readTitles(homeDirectory) {
    /** The index file, and its stats. */
    const filePath = path.join(homeDirectory, 'session_index.jsonl')
    const stats = await statFile(filePath)
    if (!stats) return new Map()
    return scanner.scan(filePath, stats)
  }

  return readTitles
}

export { createTitleReader }
