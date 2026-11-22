/**
 * Codex usage reader.
 * @file Read Codex session logs for this workspace's context use and the account's latest rate limits.
 */

'use strict'

const path = require('node:path')
const { listNames, parseJson, readLines, readRange, statFile } = require('./files')
const { isInWorkspace } = require('./paths')
const { dateOrNull, emptyLimits, finiteOrNull, hasLimits, makeLimit } = require('./usage')

/**
 * Bytes read from the start of a log to find its working folder.
 * @type {number}
 */
const headLength = 64 * 1024

/**
 * Bytes read from the end of a log on its first scan.
 * @type {number}
 */
const tailLength = 1024 * 1024

/**
 * The most bytes a first scan reads looking for context use.
 * @type {number}
 */
const maxTailLength = 4 * 1024 * 1024

/**
 * Bytes read from the end of the session index for titles.
 * @type {number}
 */
const indexLength = 512 * 1024

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
 * What a log's latest token counts said.
 * @typedef {object} LogScan
 * @property {number} end - The offset after the last line scanned.
 * @property {import('./usage').ContextReading | null} context - The latest context use.
 * @property {import('./usage').Limits | null} limits - The latest rate limits.
 * @property {Date | null} limitsAt - When those limits were reported.
 * @property {string | null} plan - The plan those limits came with.
 */

/**
 * A session log and what has been read from it.
 * @typedef {object} LogEntry
 * @property {string} filePath - The log file.
 * @property {string | null} id - The session's id.
 * @property {string | null} cwd - The session's working folder.
 * @property {number} size - The log's size when last scanned.
 * @property {number} mtimeMs - The log's modification time when last scanned.
 * @property {LogScan | null} scan - The scan so far, or null before the first.
 */

/**
 * Session logs by path.
 * @type {Map<string, LogEntry>}
 */
const logCache = new Map()

/**
 * Session titles by id, with the index file's state when read.
 * @type {{ mtimeMs: number, size: number, titles: Map<string, string> } | null}
 */
let indexCache = null

/**
 * List numeric folder names, highest first.
 * @param {string} folder - The folder to list.
 * @returns {Promise<string[]>} The names, such as `2026` or `11`.
 */
async function listNumbered(folder) {
  return (await listNames(folder)).filter(name => /^\d+$/.test(name)).sort((a, b) => Number(b) - Number(a))
}

/**
 * List recent session logs, most recently modified first.
 *
 * Codex files logs under `sessions/YYYY/MM/DD/`. A long session keeps writing to
 * the folder of the day it started, so this looks back `lookbackDays` days.
 * @param {string} sessionsFolder - Codex's `sessions` folder.
 * @param {Date} now - The current time.
 * @returns {Promise<Array<{ filePath: string, size: number, mtimeMs: number }>>} The logs.
 */
async function listLogs(sessionsFolder, now) {
  const cutoff = now.getTime() - lookbackDays * dayMs
  const logs = []

  for (const year of await listNumbered(sessionsFolder)) {
    for (const month of await listNumbered(path.join(sessionsFolder, year))) {
      for (const day of await listNumbered(path.join(sessionsFolder, year, month))) {
        const dayEnd = new Date(Number(year), Number(month) - 1, Number(day) + 1).getTime()

        if (dayEnd < cutoff) return sortLogs(logs)

        const folder = path.join(sessionsFolder, year, month, day)

        for (const name of await listNames(folder)) {
          if (!name.startsWith('rollout-') || !name.endsWith('.jsonl')) continue

          const filePath = path.join(folder, name)
          const stats = await statFile(filePath)

          if (stats) logs.push({ filePath, size: stats.size, mtimeMs: stats.mtimeMs })
        }
      }
    }
  }

  return sortLogs(logs)
}

/**
 * Sort logs by modification time, newest first.
 * @param {Array<{ mtimeMs: number }>} logs - The logs to sort.
 * @returns {Array<any>} The same list, sorted.
 */
function sortLogs(logs) {
  return logs.sort((a, b) => b.mtimeMs - a.mtimeMs)
}

/**
 * Read a log's session id and working folder from its first line.
 * @param {string} filePath - The log file.
 * @returns {Promise<{ id: string | null, cwd: string | null }>} The session's id and folder.
 */
async function readHead(filePath) {
  const head = (await readRange(filePath, 0, headLength)).toString('utf8')
  const firstLine = head.split('\n', 1)[0]
  const idMatch = /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.jsonl$/i.exec(filePath)

  if (!firstLine.includes('"session_meta"')) return { id: idMatch?.[1] ?? null, cwd: null }

  // The first line can be far longer than the head, so take `cwd` without parsing it whole.
  const cwdMatch = /"cwd"\s*:\s*("(?:[^"\\]|\\.)*")/.exec(firstLine)
  const cwd = cwdMatch ? parseJson(cwdMatch[1]) : undefined

  return { id: idMatch?.[1] ?? null, cwd: typeof cwd === 'string' ? cwd : null }
}

/**
 * Turn a token count event's rate limits into the 5-hour and 7-day windows.
 * @param {any} rateLimits - The event's `rate_limits`.
 * @param {Date | null} timestamp - When the event was logged.
 * @returns {import('./usage').Limits} The windows.
 */
function toLimits(rateLimits, timestamp) {
  const limits = emptyLimits()
  const windows = [
    { window: rateLimits?.primary, fallback: 'fiveHour' },
    { window: rateLimits?.secondary, fallback: 'sevenDay' },
  ]

  for (const { window, fallback } of windows) {
    if (!window) continue

    const resetsAt = Number.isFinite(window.resets_at)
      ? new Date(window.resets_at * 1000)
      : Number.isFinite(window.resets_in_seconds) && timestamp
        ? new Date(timestamp.getTime() + window.resets_in_seconds * 1000)
        : null

    const reading = makeLimit(window.used_percent, resetsAt)
    const minutes = finiteOrNull(window.window_minutes)
    const key = minutes === null ? fallback : minutes <= 24 * 60 ? 'fiveHour' : 'sevenDay'

    limits[key] ??= reading
  }

  return limits
}

/**
 * Format a plan type such as `plus` as `Plus`.
 * @param {unknown} plan - The plan type.
 * @returns {string | null} The plan's name, or null.
 */
function formatPlan(plan) {
  return typeof plan === 'string' && plan ? plan.charAt(0).toUpperCase() + plan.slice(1) : null
}

/**
 * Fold lines into a scan, newer lines replacing older readings.
 * @param {string[]} lines - Log lines, oldest first.
 * @param {LogScan} scan - The scan to update.
 * @returns {LogScan} The updated scan.
 */
function scanLines(lines, scan) {
  let { context, limits, limitsAt, plan } = scan
  let hasNewContext = false
  let hasNewLimits = false

  for (let index = lines.length - 1; index >= 0 && !(hasNewContext && hasNewLimits); index -= 1) {
    const line = lines[index]

    if (!line.includes('"token_count"')) continue

    const event = parseJson(line)
    const payload = event?.payload

    if (event?.type !== 'event_msg' || payload?.type !== 'token_count') continue

    const usage = payload.info?.last_token_usage

    if (!hasNewContext && usage) {
      const tokens = finiteOrNull(usage.total_tokens)
      const window = finiteOrNull(payload.info.model_context_window)
      const percent = tokens !== null && window ? Math.round((tokens / window) * 100) : null

      context = { tokens, window, percent }
      hasNewContext = true
    }

    const timestamp = dateOrNull(event.timestamp)
    const eventLimits = toLimits(payload.rate_limits, timestamp)

    if (!hasNewLimits && hasLimits(eventLimits)) {
      limits = eventLimits
      limitsAt = timestamp
      plan = formatPlan(payload.rate_limits?.plan_type)
      hasNewLimits = true
    }
  }

  return { end: scan.end, context, limits, limitsAt, plan }
}

/**
 * Bring a log's scan up to date, reading only what was appended since the last scan.
 * @param {LogEntry} entry - The log to scan.
 * @param {{ size: number, mtimeMs: number }} stats - The log's current size and time.
 * @returns {Promise<LogScan>} The up-to-date scan.
 */
async function updateScan(entry, stats) {
  const isUnchanged = entry.scan && entry.size === stats.size && entry.mtimeMs === stats.mtimeMs

  if (isUnchanged) return entry.scan

  const canAppend = entry.scan && stats.size >= entry.scan.end
  let scan

  if (canAppend) {
    const { lines, end } = await readLines(entry.filePath, { start: entry.scan.end, end: stats.size })

    scan = { ...scanLines(lines, entry.scan), end }
  } else {
    const empty = { end: 0, context: null, limits: null, limitsAt: null, plan: null }

    // Read further back only while the latest context reading is still missing.
    for (let length = tailLength; ; length *= 2) {
      const start = Math.max(0, stats.size - length)
      const { lines, end } = await readLines(entry.filePath, { start, end: stats.size, skipPartialStart: true })

      scan = { ...scanLines(lines, empty), end }

      if (scan.context || start === 0 || length >= maxTailLength) break
    }
  }

  entry.scan = scan
  entry.size = stats.size
  entry.mtimeMs = stats.mtimeMs
  return scan
}

/**
 * Get a log's cache entry, reading its head the first time.
 * @param {{ filePath: string }} log - The log.
 * @returns {Promise<LogEntry>} The entry.
 */
async function getEntry({ filePath }) {
  let entry = logCache.get(filePath)

  if (!entry) {
    const { id, cwd } = await readHead(filePath)

    entry = { filePath, id, cwd, size: 0, mtimeMs: 0, scan: null }
    logCache.set(filePath, entry)
  }

  return entry
}

/**
 * Read session titles from the end of Codex's session index.
 * @param {string} homeDirectory - The Codex home folder.
 * @returns {Promise<Map<string, string>>} Titles by session id.
 */
async function readTitles(homeDirectory) {
  const filePath = path.join(homeDirectory, 'session_index.jsonl')
  const stats = await statFile(filePath)

  if (!stats) return new Map()
  if (indexCache?.mtimeMs === stats.mtimeMs && indexCache.size === stats.size) return indexCache.titles

  const start = Math.max(0, stats.size - indexLength)
  const { lines } = await readLines(filePath, { start, end: stats.size, skipPartialStart: true })
  const titles = new Map()

  for (const line of lines) {
    const row = parseJson(line)

    if (typeof row?.id === 'string' && typeof row.thread_name === 'string' && row.thread_name.trim()) {
      titles.set(row.id, row.thread_name.trim())
    }
  }

  indexCache = { mtimeMs: stats.mtimeMs, size: stats.size, titles }
  return titles
}

/**
 * Read Codex's usage for a workspace.
 * @param {object} options - Where to read and what to match.
 * @param {string} options.homeDirectory - The Codex home folder.
 * @param {readonly string[]} options.folders - The workspace folders' paths.
 * @param {Date} options.now - The current time.
 * @returns {Promise<import('./usage').ToolUsage | null>} The usage, or null when there are no recent logs.
 */
async function readCodexUsage({ homeDirectory, folders, now }) {
  const logs = await listLogs(path.join(homeDirectory, 'sessions'), now)
  const seen = new Set(logs.map(log => log.filePath))

  for (const cachedPath of logCache.keys()) {
    if (!seen.has(cachedPath)) logCache.delete(cachedPath)
  }

  if (!logs.length) return null

  let session = null
  let limitsScan = null

  for (const log of logs) {
    if (session && limitsScan) break

    const entry = await getEntry(log)
    const isWorkspaceLog = !session && isInWorkspace(entry.cwd, folders)

    if (!isWorkspaceLog && limitsScan) continue

    const scan = await updateScan(entry, log)

    if (isWorkspaceLog) {
      const titles = await readTitles(homeDirectory)

      session = {
        title: (entry.id && titles.get(entry.id)) || null,
        cwd: entry.cwd,
        context: scan.context,
        updatedAt: new Date(log.mtimeMs),
        isEnded: false,
      }
    }

    if (!limitsScan && scan.limits) limitsScan = scan
  }

  return {
    session,
    limits: limitsScan?.limits ?? emptyLimits(),
    limitsUpdatedAt: limitsScan?.limitsAt ?? null,
    plan: limitsScan?.plan ?? null,
  }
}

module.exports = { readCodexUsage }
