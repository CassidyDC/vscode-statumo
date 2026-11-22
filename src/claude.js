/**
 * Claude Code usage reader.
 * @file Read the session files the Usage mod for Claude Code writes, and pick this workspace's session and the latest limits.
 */

'use strict'

const fs = require('node:fs/promises')
const path = require('node:path')
const { listNames, parseJson, statFile } = require('./files')
const { isInWorkspace } = require('./paths')
const { dateOrNull, emptyLimits, finiteOrNull, hasLimits, makeLimit } = require('./usage')

/**
 * The session file format version this reader understands.
 * @type {number}
 */
const formatVersion = 1

/**
 * A parsed session file.
 * @typedef {object} ClaudeRecord
 * @property {string | null} title - The session's title.
 * @property {string | null} cwd - The session's project root.
 * @property {import('./usage').ContextReading} context - The session's context use.
 * @property {import('./usage').Limits} limits - The limits the session last saw.
 * @property {Date} updatedAt - When the mod last wrote the file.
 * @property {boolean} isEnded - Whether the session has ended.
 */

/**
 * Parsed session files by path, kept until the file changes.
 * @type {Map<string, { mtimeMs: number, size: number, record: ClaudeRecord | null }>}
 */
const recordCache = new Map()

/**
 * The folder the Usage mod writes session files to.
 * @param {string} configDirectory - The Claude config folder.
 * @returns {string} The session files' folder.
 */
function sessionsFolder(configDirectory) {
  return path.join(configDirectory, 'usage', 'sessions')
}

/**
 * Turn a session file's JSON into a record, or null when it isn't one.
 * @param {any} data - The parsed JSON.
 * @returns {ClaudeRecord | null} The record, or null.
 */
function toRecord(data) {
  if (data?.version !== formatVersion || data.tool !== 'claude-code') return null

  const updatedAt = dateOrNull(data.updatedAt)

  if (!updatedAt) return null

  /**
   * Build a limit reading from one of the file's windows.
   * @param {any} window - The window as the file stores it.
   * @returns {import('./usage').LimitReading | null} The reading, or null.
   */
  const toLimit = window => makeLimit(window?.percentUsed, dateOrNull(window?.resetsAt))

  return {
    title: typeof data.title === 'string' && data.title.trim() ? data.title.trim() : null,
    cwd: typeof data.cwd === 'string' ? data.cwd : null,
    context: {
      tokens: finiteOrNull(data.context?.tokens),
      window: finiteOrNull(data.context?.window),
      percent: finiteOrNull(data.context?.percent),
    },
    limits: {
      fiveHour: toLimit(data.rateLimits?.fiveHour),
      sevenDay: toLimit(data.rateLimits?.sevenDay),
    },
    updatedAt,
    isEnded: Boolean(data.endedAt),
  }
}

/**
 * Read one session file, reusing the cached record while the file is unchanged.
 * @param {string} filePath - The session file.
 * @returns {Promise<ClaudeRecord | null>} The record, or null when it's missing or invalid.
 */
async function readRecord(filePath) {
  const stats = await statFile(filePath)

  if (!stats) return null

  const cached = recordCache.get(filePath)

  if (cached?.mtimeMs === stats.mtimeMs && cached.size === stats.size) return cached.record

  const text = await fs.readFile(filePath, 'utf8').catch(() => undefined)
  const record = text === undefined ? null : toRecord(parseJson(text))

  // A file caught mid-write fails to parse; keep the last good record until it settles.
  if (!record && cached?.record) return cached.record

  recordCache.set(filePath, { mtimeMs: stats.mtimeMs, size: stats.size, record })
  return record
}

/**
 * Read Claude Code's usage for a workspace.
 * @param {object} options - Where to read and what to match.
 * @param {string} options.configDirectory - The Claude config folder.
 * @param {readonly string[]} options.folders - The workspace folders' paths.
 * @returns {Promise<import('./usage').ToolUsage | null>} The usage, or null when no session file exists.
 */
async function readClaudeUsage({ configDirectory, folders }) {
  const folder = sessionsFolder(configDirectory)
  const paths = (await listNames(folder)).filter(name => name.endsWith('.json')).map(name => path.join(folder, name))
  const seen = new Set(paths)

  for (const cachedPath of recordCache.keys()) {
    if (cachedPath.startsWith(folder) && !seen.has(cachedPath)) recordCache.delete(cachedPath)
  }

  const records = (await Promise.all(paths.map(readRecord))).filter(record => record !== null)

  if (!records.length) return null

  records.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())

  const session = records.find(record => isInWorkspace(record.cwd, folders)) ?? null
  const limitsRecord = records.find(record => hasLimits(record.limits))

  return {
    session: session && {
      title: session.title,
      cwd: session.cwd,
      context: session.context,
      updatedAt: session.updatedAt,
      isEnded: session.isEnded,
    },
    limits: limitsRecord?.limits ?? emptyLimits(),
    limitsUpdatedAt: limitsRecord?.updatedAt ?? null,
    plan: null,
  }
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
  const folder = sessionsFolder(configDirectory)
  let deleted = 0

  for (const name of await listNames(folder)) {
    if (!name.endsWith('.json')) continue

    const filePath = path.join(folder, name)
    const stats = await statFile(filePath)

    if (!stats || now.getTime() - stats.mtimeMs < maxAgeMs) continue

    await fs.rm(filePath, { force: true })
    recordCache.delete(filePath)
    deleted += 1
  }

  return deleted
}

module.exports = { pruneClaudeSessions, readClaudeUsage }
