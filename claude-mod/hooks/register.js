/**
 * Usage mod hooks.
 * @file Write each Claude Code session's context use, rate limits, and title to a JSON file for Statumo to read.
 */

import { readSessionTitle } from './session-title.js'

/**
 * The session file format version Statumo's reader understands.
 * @type {number}
 */
const formatVersion = 1

/**
 * Matches a transcript path inside the Claude config folder's `projects/` folder, capturing the config folder.
 * @type {RegExp}
 */
const transcriptLayout = /^(.*)[\\/]projects[\\/][^\\/]+[\\/][^\\/]+$/

/**
 * Find one rate-limit window in the limits Claude reported.
 * @param {any[]} limits - The rate limits Claude reported.
 * @param {string} kind - The window's kind, such as `five_hour`.
 * @returns {{ percentUsed: number, resetsAt: string | null } | null} The window, or null when Claude hasn't reported it.
 */
function readLimit(limits, kind) {
  const limit = limits.find(entry => entry.kind === kind)

  if (!Number.isFinite(limit?.percentUsed)) return null

  return {
    percentUsed: limit.percentUsed,
    resetsAt: typeof limit.resetsAt === 'string' ? limit.resetsAt : null,
  }
}

/**
 * Copy Claude's context reading, using null for any value it hasn't reported.
 * @param {any} context - The context reading Claude reported.
 * @returns {{ tokens: number | null, window: number | null, percent: number | null }} The reading.
 */
function readContext(context) {
  /**
   * Keep a finite number, or use null.
   * @param {unknown} value - The value to check.
   * @returns {number | null} The number, or null.
   */
  const number = value => (Number.isFinite(value) ? value : null)

  return {
    tokens: number(context?.tokens),
    window: number(context?.window),
    percent: number(context?.percent),
  }
}

/**
 * Find where this session's file goes.
 *
 * Session files sit beside `projects/` in the Claude config folder, so a custom
 * CLAUDE_CONFIG_DIR is followed without reading the environment.
 * @param {object} $ - The mod's runtime API.
 * @returns {Promise<string | undefined>} The file's path, or undefined when the transcript isn't in a config folder.
 */
async function resolveOutputPath($) {
  const [{ transcriptPath }, id] = await Promise.all([$.session.info(), $.session.id()])
  const match = transcriptLayout.exec(transcriptPath ?? '')

  if (match && id) return `${match[1]}/usage/sessions/${id}.json`
}

/**
 * The timer that rechecks the title and project root while the session is open.
 * @type {{ cancel: () => void } | undefined}
 */
let timer

/**
 * Where the last title read stopped in the transcript.
 * @type {import('./session-title.js').TitleCursor | undefined}
 */
let transcript

/**
 * This session's file.
 * @type {string | undefined}
 */
let outputPath

/**
 * The fields last written to the session file, and when they last changed.
 * @type {{ fields: object, updatedAt: string } | undefined}
 */
let snapshot

/**
 * Counts writes so a slower, older write doesn't overwrite a newer one.
 * @type {number}
 */
let revision = 0

/**
 * Write the session file when Claude reports usage, or when the title or project root changed.
 * @param {object} $ - The mod's runtime API.
 * @param {object} options - Why the file is being written.
 * @param {boolean} options.isObserved - Whether a session event asked for the write, which always rewrites the file.
 * @returns {Promise<void>} Resolves once the file is written or skipped.
 */
async function publish($, { isObserved }) {
  const current = ++revision

  outputPath ??= await resolveOutputPath($)

  if (!outputPath) return

  const [usage, metadata, root, sessionId] = await Promise.all([
    $.session.usage().catch(() => undefined),
    readSessionTitle($, transcript).catch(() => ({})),
    $.session.root(),
    $.session.id(),
  ])

  if (current !== revision) return

  transcript = metadata.cursor

  const limits = usage?.rateLimits ?? []
  const title = metadata.title?.replace(/[\s\u0000-\u001f\u007f-\u009f]+/g, ' ').trim()

  const fields = {
    version: formatVersion,
    tool: 'claude-code',
    sessionId,
    cwd: root,
    title: title || null,
    context: readContext(usage?.context),
    rateLimits: {
      fiveHour: readLimit(limits, 'five_hour'),
      sevenDay: readLimit(limits, 'seven_day'),
    },
    endedAt: null,
  }

  // Timer passes only rewrite the file when something changed, so `updatedAt`
  // keeps saying when Claude last reported usage or the session last changed.
  const isChanged = JSON.stringify(fields) !== JSON.stringify(snapshot?.fields)

  if (!isObserved && !isChanged) return

  snapshot = { fields, updatedAt: new Date().toISOString() }
  await write($, snapshot)
}

/**
 * Save a snapshot to the session file.
 * @param {object} $ - The mod's runtime API.
 * @param {object} saved - What to save.
 * @param {object} saved.fields - The session's fields.
 * @param {string} saved.updatedAt - When the fields last changed.
 * @returns {Promise<void>} Resolves once the file is written.
 */
function write($, { fields, updatedAt }) {
  return $.fs.write(outputPath, `${JSON.stringify({ ...fields, updatedAt }, null, 2)}\n`)
}

/**
 * Start rechecking the session every 10 seconds, unless already started.
 * @param {object} $ - The mod's runtime API.
 * @returns {void}
 */
function startTimer($) {
  // Saved titles and the project root can change while the conversation is idle.
  timer ??= $.clock.every(10_000, () => {
    void publish($, { isObserved: false }).catch(() => {})
  })
}

/**
 * Write the session file for a session event, then pass the event on.
 * @param {object} $ - The mod's runtime API.
 * @param {object} event - The session event.
 * @param {(event: object) => Promise<unknown>} next - Passes the event to the next hook.
 * @returns {Promise<unknown>} What the next hook returns.
 */
async function observe($, event, next) {
  startTimer($)
  await publish($, { isObserved: true }).catch(() => {})
  return next(event)
}

/**
 * Mark the session file as ended, stop the timer, and pass the event on.
 * @param {object} $ - The mod's runtime API.
 * @param {object} event - The session end event.
 * @param {(event: object) => Promise<unknown>} next - Passes the event to the next hook.
 * @returns {Promise<unknown>} What the next hook returns.
 */
async function end($, event, next) {
  revision += 1
  timer?.cancel()
  timer = undefined

  if (outputPath && snapshot) {
    const endedAt = new Date().toISOString()
    snapshot = { fields: { ...snapshot.fields, endedAt }, updatedAt: endedAt }
    await write($, snapshot).catch(() => {})
  }

  transcript = undefined
  outputPath = undefined
  snapshot = undefined

  return next(event)
}

/**
 * Register the mod's session hooks.
 * @param {(name: string, hook: Function) => void} on - Registers a hook for an event.
 * @returns {void}
 */
export function register(on) {
  on('session.start', observe)
  on('session.attach', observe)
  on('session.measure', observe)
  on('session.end', end)
  on('classic.SessionStart', ($, event, next) =>
    event.source === 'startup' ? next(event) : observe($, event, next),
  )
}
