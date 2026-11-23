/**
 * Usage mod hooks.
 * @file Write each Claude Code session's folder, transcript path, and context use, and the account's rate limits, for Statumo to read.
 */

/**
 * Matches a transcript path inside the Claude config folder's `projects/` folder, capturing the config folder.
 * @type {RegExp}
 */
const transcriptLayout = /^(.*)[\\/]projects[\\/][^\\/]+[\\/][^\\/]+$/

/**
 * Keep a finite number, or use null.
 * @param {unknown} value - The value to check.
 * @returns {number | null} The number, or null.
 */
function finiteOrNull(value) {
  return Number.isFinite(value) ? value : null
}

/**
 * Write this session's file, and the limits file when Claude reported limits.
 *
 * Both sit in `statumo/` beside `projects/` in the Claude config folder, so a custom
 * CLAUDE_CONFIG_DIR is followed without reading the environment. Limits are written only when
 * there are some, so a session with no reading yet never erases another session's.
 * @param {object} $ - The mod's runtime API.
 * @param {object} reading - What to report.
 * @param {{ tokens?: number, window?: number, percent?: number } | undefined} reading.context - The session's context reading.
 * @param {Array<{ kind: string, percentUsed: number, resetsAt?: string }>} [reading.rateLimits] - The rate-limit windows Claude reported.
 * @returns {Promise<void>} Resolves once the files are written or skipped.
 */
async function report($, { context, rateLimits = [] }) {
  /** The session's transcript path, id, and project root, and the config folder the transcript is in. */
  const [{ transcriptPath }, id, cwd] = await Promise.all([$.session.info(), $.session.id(), $.session.root()])
  const configFolder = transcriptLayout.exec(transcriptPath ?? '')?.[1]

  if (!configFolder || !id) return

  /** The session's context reading, with null for any value Claude hasn't reported. */
  const reduced = {
    tokens: finiteOrNull(context?.tokens),
    window: finiteOrNull(context?.window),
    percent: finiteOrNull(context?.percent),
  }

  await $.fs.write(`${configFolder}/statumo/sessions/${id}.json`, JSON.stringify({ cwd, transcriptPath, context: reduced }))

  if (rateLimits.length) await $.fs.write(`${configFolder}/statumo/limits.json`, JSON.stringify({ rateLimits }))
}

/**
 * Report the context and limits of the turn that just ended, then pass the event on.
 * @param {object} $ - The mod's runtime API.
 * @param {object} event - The measurement, with `context` and `rateLimits`.
 * @param {(event: object) => Promise<unknown>} next - Passes the event to the next hook.
 * @returns {Promise<unknown>} What the next hook returns.
 */
async function measure($, event, next) {
  try {
    await report($, event)
  } catch {
    // A failed report must never break the session.
  }

  return next(event)
}

/**
 * Report a new, cleared, resumed, or compacted session's context before its first turn, then pass
 * the event on. Its limits wait for a measurement, since a start would stamp an old reading as new.
 * @param {object} $ - The mod's runtime API.
 * @param {object} event - The session event.
 * @param {(event: object) => Promise<unknown>} next - Passes the event to the next hook.
 * @returns {Promise<unknown>} What the next hook returns.
 */
async function start($, event, next) {
  try {
    /** The session's live context reading. */
    const { context } = await $.session.usage()
    await report($, { context })
  } catch {
    // A failed report must never break the session.
  }

  return next(event)
}

/**
 * Register the mod's session hooks.
 * @param {(name: string, hook: Function) => void} on - Registers a hook for an event.
 * @returns {void}
 */
export function register(on) {
  on('session.measure', measure)
  on('session.start', start)
  on('classic.SessionStart', ($, event, next) => (event.source === 'startup' ? next(event) : start($, event, next)))
}
