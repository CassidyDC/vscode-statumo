/**
 * Claude Code session titles.
 * @file Read a session's title from the custom-title and ai-title rows near the end of its transcript.
 */

import { parseJson, statFile } from '../../files/files.js'
import { createTailScanner } from '../../files/tail-scan.js'

/**
 * Bytes read from the end of a transcript on its first scan.
 * @type {number}
 */
const tailLength = 256 * 1024

/**
 * The most bytes a first scan reads looking for a title.
 * @type {number}
 */
const maxTailLength = 4 * 1024 * 1024

/**
 * The latest title of each kind found in a transcript.
 * @typedef {object} Titles
 * @property {string | null} custom - The title the user set.
 * @property {string | null} ai - The title Claude generated.
 */

/**
 * A transcript's titles before any row is read.
 * @type {Titles}
 */
const noTitles = Object.freeze({ custom: null, ai: null })

/**
 * Collapse whitespace and control characters to single spaces and trim, so a title stays on one line.
 * @param {unknown} value - The title as the transcript stores it.
 * @returns {string | null} The cleaned title, or null when it's empty or not text.
 */
function cleanTitle(value) {
  if (typeof value !== 'string') return null

  /** The title on one line. */
  const title = value.replace(/[\s\u0000-\u001f\u007f-\u009f]+/g, ' ').trim()
  return title || null
}

/**
 * Fold transcript rows into the latest title of each kind.
 *
 * Claude Code re-appends title rows near the end as the transcript grows. Other rows can be very
 * large, so only rows that mention a title type are parsed.
 * @param {string[]} lines - Transcript rows, oldest first.
 * @param {Titles} titles - The titles so far.
 * @returns {Titles} The updated titles.
 */
function foldTitles(lines, titles) {
  /** The latest title of each kind. */
  let { custom, ai } = titles

  for (const line of lines) {
    if (!line.includes('"custom-title"') && !line.includes('"ai-title"')) continue

    /** The row. */
    const row = parseJson(line)
    if (row?.type === 'custom-title') custom = cleanTitle(row.customTitle) ?? custom
    if (row?.type === 'ai-title') ai = cleanTitle(row.aiTitle) ?? ai
  }

  return { custom, ai }
}

/**
 * Create a reader of session titles, which reads only what each transcript appended since the last read.
 * @returns {(transcriptPath: string | null) => Promise<string | null>} Reads a transcript's title.
 */
function createTitleReader() {
  /** The transcripts' scanner. */
  const scanner = createTailScanner({
    tailLength,
    maxTailLength,
    initial: noTitles,
    fold: foldTitles,

    /**
     * Whether a first scan has found a title of either kind.
     * @param {Titles} titles - The titles so far.
     * @returns {boolean} True once there is a title.
     */
    isSettled: titles => Boolean(titles.custom || titles.ai),
  })

  /**
   * Read a session's title: the latest title the user set, or else the latest one Claude generated.
   * @param {string | null} transcriptPath - The session's transcript.
   * @returns {Promise<string | null>} The title, or null when the transcript is missing or has none.
   */
  async function readTitle(transcriptPath) {
    scanner.retain(transcriptPath ? [transcriptPath] : [])
    if (!transcriptPath) return null

    /** The transcript's stats. */
    const stats = await statFile(transcriptPath)
    if (!stats) return null

    /** The transcript's titles. */
    const titles = await scanner.scan(transcriptPath, stats)
    return titles.custom ?? titles.ai
  }

  return readTitle
}

export { createTitleReader }
