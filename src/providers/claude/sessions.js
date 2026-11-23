/**
 * Claude Code session files.
 * @file Read the session files the Usage mod writes to `statumo/sessions/`, newest first, and delete old ones.
 */

'use strict'

const fs = require('node:fs/promises')
const path = require('node:path')
const { createCachedJson } = require('../../files/cached-json')
const { listNames, statFile } = require('../../files/files')
const { finiteOrNull } = require('../../usage/model')

/**
 * One session file, dated by when the mod last wrote it.
 * @typedef {object} ClaudeSession
 * @property {string | null} cwd - The session's project root.
 * @property {string | null} transcriptPath - The session's transcript, or null when it keeps none.
 * @property {import('../../usage/model').ContextReading | null} context - The session's context use.
 * @property {Date} updatedAt - When the mod last wrote the file.
 */

/**
 * The folder the Usage mod writes session files to.
 * @param {string} configDirectory - The Claude config folder.
 * @returns {string} The session files' folder.
 */
function sessionsFolder(configDirectory) {
  return path.join(configDirectory, 'statumo', 'sessions')
}

/**
 * Turn a session file's JSON into its fields, or reject it when it isn't a session file.
 * @param {any} data - The parsed JSON.
 * @returns {Omit<ClaudeSession, 'updatedAt'> | undefined} The fields, or undefined.
 */
function toSession(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return undefined

  /** The file's context reading, when it has one. */
  const context = data.context && typeof data.context === 'object' ? data.context : null

  return {
    cwd: typeof data.cwd === 'string' && data.cwd ? data.cwd : null,
    transcriptPath: typeof data.transcriptPath === 'string' && data.transcriptPath ? data.transcriptPath : null,
    context: context && {
      tokens: finiteOrNull(context.tokens),
      window: finiteOrNull(context.window),
      percent: finiteOrNull(context.percent),
    },
  }
}

/**
 * List the session files in the folder.
 * @param {string} folder - The session files' folder.
 * @returns {Promise<string[]>} The files' paths.
 */
async function listSessionFiles(folder) {
  return (await listNames(folder)).filter(name => name.endsWith('.json')).map(name => path.join(folder, name))
}

/**
 * Create a reader of the session files, reusing each file's reading while it's unchanged.
 * @returns {(configDirectory: string) => Promise<ClaudeSession[]>} Reads the valid session files, newest first.
 */
function createSessionReader() {
  /** The session files' reader. */
  const reader = createCachedJson(toSession)

  /**
   * Read every valid session file, newest first.
   * @param {string} configDirectory - The Claude config folder.
   * @returns {Promise<ClaudeSession[]>} The sessions.
   */
  async function readSessions(configDirectory) {
    /** The session files. */
    const filePaths = await listSessionFiles(sessionsFolder(configDirectory))

    reader.retain(filePaths)

    /** Each file's reading, or null for a file that's gone or invalid. */
    const readings = await Promise.all(filePaths.map(reader.read))

    return readings
      .filter(reading => reading !== null)
      .map(({ value, mtimeMs }) => ({ ...value, updatedAt: new Date(mtimeMs) }))
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
  }

  return readSessions
}

/**
 * Delete session files that haven't changed in `maxAgeMs`.
 *
 * The mod can't delete files, so the folder would otherwise keep one file for every
 * session ever run.
 * @param {object} options - What to prune.
 * @param {string} options.configDirectory - The Claude config folder.
 * @param {number} options.maxAgeMs - How old a file must be to delete it.
 * @param {Date} options.now - The current time.
 * @returns {Promise<number>} How many files were deleted.
 */
async function pruneClaudeSessions({ configDirectory, maxAgeMs, now }) {
  /** How many files were deleted so far. */
  let deleted = 0

  for (const filePath of await listSessionFiles(sessionsFolder(configDirectory))) {
    /** The file's stats. */
    const stats = await statFile(filePath)
    if (!stats || now.getTime() - stats.mtimeMs < maxAgeMs) continue
    await fs.rm(filePath, { force: true })
    deleted += 1
  }

  return deleted
}

module.exports = { createSessionReader, pruneClaudeSessions }
