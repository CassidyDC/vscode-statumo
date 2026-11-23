/**
 * Codex session logs.
 * @file List recent Codex session logs and read each log's session id and working folder from its head.
 */

import path from 'node:path'
import { listNames, parseJson, readRange, statFile } from '../../files/files.js'

/**
 * Bytes read from the start of a log to find its working folder.
 * @type {number}
 */
const headLength = 64 * 1024

/**
 * How many days of session folders to look through.
 * @type {number}
 */
const lookbackDays = 30

/**
 * One day in milliseconds.
 * @type {number}
 */
const dayMs = 86_400_000

/**
 * A session log's path, size, and modified time.
 * @typedef {object} LogFile
 * @property {string} filePath - The log file.
 * @property {number} size - The log's size in bytes.
 * @property {number} mtimeMs - The log's modified time, in epoch milliseconds.
 */

/**
 * A session log's session id and working folder.
 * @typedef {object} LogHead
 * @property {string | null} id - The session's id.
 * @property {string | null} cwd - The session's working folder.
 */

/**
 * List numeric folder names, highest first.
 * @param {string} folder - The folder to list.
 * @returns {Promise<string[]>} The names, such as `2026` or `11`.
 */
async function listNumbered(folder) {
  return (await listNames(folder)).filter(name => /^\d+$/.test(name)).sort((a, b) => Number(b) - Number(a))
}

/**
 * List one day folder's session logs, stating them in parallel.
 * @param {string} folder - The day folder.
 * @returns {Promise<LogFile[]>} The logs that still exist.
 */
async function listDayLogs(folder) {
  /** The day's log paths, and each log's stats. */
  const filePaths = (await listNames(folder))
    .filter(name => name.startsWith('rollout-') && name.endsWith('.jsonl'))
    .map(name => path.join(folder, name))
  const stats = await Promise.all(filePaths.map(statFile))
  return filePaths.flatMap((filePath, index) => (stats[index] ? [{ filePath, size: stats[index].size, mtimeMs: stats[index].mtimeMs }] : []))
}

/**
 * Sort logs by modification time, newest first.
 * @param {LogFile[]} logs - The logs to sort.
 * @returns {LogFile[]} The same list, sorted.
 */
function sortLogs(logs) {
  return logs.sort((a, b) => b.mtimeMs - a.mtimeMs)
}

/**
 * List recent session logs, most recently modified first.
 *
 * Codex files logs under `sessions/YYYY/MM/DD/`. A long session keeps writing to
 * the folder of the day it started, so this looks back `lookbackDays` days.
 * @param {string} sessionsFolder - Codex's `sessions` folder.
 * @param {Date} now - The current time.
 * @returns {Promise<LogFile[]>} The logs.
 */
async function listLogs(sessionsFolder, now) {
  /** The oldest day end still looked at, and the logs found so far. */
  const cutoff = now.getTime() - lookbackDays * dayMs
  const logs = []

  for (const year of await listNumbered(sessionsFolder)) {
    for (const month of await listNumbered(path.join(sessionsFolder, year))) {
      for (const day of await listNumbered(path.join(sessionsFolder, year, month))) {
        /** When the folder's day ends. */
        const dayEnd = new Date(Number(year), Number(month) - 1, Number(day) + 1).getTime()
        if (dayEnd < cutoff) return sortLogs(logs)
        logs.push(...(await listDayLogs(path.join(sessionsFolder, year, month, day))))
      }
    }
  }

  return sortLogs(logs)
}

/**
 * Read a log's session id and working folder from its first line.
 * @param {string} filePath - The log file.
 * @returns {Promise<LogHead>} The session's id and folder.
 */
async function readHead(filePath) {
  /** The log's first bytes, its first line, and the session id in its file name. */
  const head = (await readRange(filePath, 0, headLength)).toString('utf8')
  const firstLine = head.split('\n', 1)[0]
  const idMatch = /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.jsonl$/i.exec(filePath)
  if (!firstLine.includes('"session_meta"')) return { id: idMatch?.[1] ?? null, cwd: null }

  /**
   * The quoted `cwd` value, and that value parsed. The first line can be far longer than the
   * head, so this takes `cwd` without parsing the line whole.
   */
  const cwdMatch = /"cwd"\s*:\s*("(?:[^"\\]|\\.)*")/.exec(firstLine)
  const cwd = cwdMatch ? parseJson(cwdMatch[1]) : undefined
  return { id: idMatch?.[1] ?? null, cwd: typeof cwd === 'string' ? cwd : null }
}

/**
 * Create a reader that reads each log's head once and keeps it.
 * @returns {{ read: (filePath: string) => Promise<LogHead>, retain: (filePaths: Iterable<string>) => void }} The reader.
 */
function createHeadReader() {
  /**
   * Each log's head, by path.
   * @type {Map<string, LogHead>}
   */
  const heads = new Map()

  /**
   * Read a log's head, the first time only.
   * @param {string} filePath - The log file.
   * @returns {Promise<LogHead>} The log's head.
   */
  async function read(filePath) {
    /** The log's cached head. */
    let head = heads.get(filePath)

    if (!head) {
      head = await readHead(filePath)
      heads.set(filePath, head)
    }

    return head
  }

  /**
   * Forget every log not in a list, such as logs that no longer exist or are too old.
   * @param {Iterable<string>} filePaths - The logs to keep.
   * @returns {void}
   */
  function retain(filePaths) {
    /** The logs to keep. */
    const kept = new Set(filePaths)

    for (const filePath of heads.keys()) {
      if (!kept.has(filePath)) heads.delete(filePath)
    }
  }

  return { read, retain }
}

export { createHeadReader, listLogs }
