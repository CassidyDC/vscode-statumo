/**
 * Session title reader.
 * @file Read a session's saved title from its transcript, continuing from where the last read stopped.
 */

/**
 * Bytes read from the transcript at a time.
 * @type {number}
 */
const chunkSize = 256 * 1024

/**
 * Matches a transcript row that may hold a title.
 * @type {RegExp}
 */
const titleField = /"(?:customTitle|aiTitle|summary)"\s*:/

/**
 * Titles found in a transcript, by where they came from.
 * @typedef {object} Titles
 * @property {string} [custom] - The title the user set.
 * @property {string} [generated] - The title Claude generated.
 * @property {string} [summary] - The summary of a compacted conversation.
 */

/**
 * Where the last read of a transcript stopped.
 * @typedef {object} TitleCursor
 * @property {string} path - The transcript's path.
 * @property {number} mtimeMs - The transcript's modified time at the last read.
 * @property {number} offset - The byte offset the last read stopped at.
 * @property {string | null} partial - The unfinished last row, or null while skipping an oversized row.
 * @property {Titles} titles - The titles found so far.
 */

/**
 * Record any title a transcript row holds.
 * @param {string} line - One transcript row, as a byte string.
 * @param {Titles} titles - The titles to update.
 * @returns {void}
 */
function collectTitle(line, titles) {
  if (!titleField.test(line)) return

  // Byte strings let a UTF-8 character span two file reads without losing bytes.
  let row

  try {
    const bytes = Uint8Array.from(line, character => character.charCodeAt(0))
    row = JSON.parse(new TextDecoder().decode(bytes))
  } catch {
    return
  }

  if (typeof row?.customTitle === 'string') titles.custom = row.customTitle.trim()

  if (typeof row?.aiTitle === 'string') titles.generated = row.aiTitle.trim()

  if (row?.type === 'summary' && typeof row.summary === 'string') titles.summary = row.summary.trim()
}

/**
 * Read a session's title from its transcript.
 * @param {object} $ - The mod's runtime API.
 * @param {TitleCursor} [previous] - Where the last read stopped, to continue from there.
 * @returns {Promise<{ cursor?: TitleCursor, title?: string }>} Where this read stopped, and the best title found.
 */
export async function readSessionTitle($, previous) {
  const { transcriptPath: path } = await $.session.info()

  if (!path) return {}

  const { size, mtimeMs } = await $.fs.stat(path)
  const canContinue = previous?.path === path && size >= previous.offset &&
    (size > previous.offset || mtimeMs === previous.mtimeMs)
  const cursor = canContinue
    ? { ...previous, titles: { ...previous.titles }, mtimeMs }
    : { path, mtimeMs, offset: 0, partial: '', titles: {} }

  while (cursor.offset < size) {
    const { base64 } = await $.fs.read(path, {
      as: 'bytes',
      offset: cursor.offset,
      length: Math.min(chunkSize, size - cursor.offset),
    })

    const bytes = atob(base64)

    if (!bytes.length) break

    cursor.offset += bytes.length

    // Skip oversized message rows while retaining complete title metadata rows.
    const lines = ((cursor.partial ?? '') + bytes).split('\n')
    const partial = lines.pop()
    const stillSkipping = cursor.partial === null && !lines.length

    if (cursor.partial === null) lines.shift()

    for (const line of lines) collectTitle(line, cursor.titles)

    cursor.partial = stillSkipping || partial.length > chunkSize ? null : partial
  }

  const titles = { ...cursor.titles }

  if (cursor.partial) collectTitle(cursor.partial, titles)

  return { cursor, title: titles.custom || titles.generated || titles.summary }
}
