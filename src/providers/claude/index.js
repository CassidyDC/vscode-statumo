/**
 * Claude Code usage reader.
 * @file Combine the Usage mod's session and limits files with the session's transcript title, the signed-in account, and Claude Code's cached usage.
 */

import { isInWorkspace } from '../../files/paths.js'
import { hasLimits } from '../../usage/model.js'
import { createAccountReader } from './account.js'
import { createLimitsReader } from './limits.js'
import { createSessionReader, pruneClaudeSessions } from './sessions.js'
import { createTitleReader } from './title.js'

/**
 * The limits a Claude Code item shows, and when each source was read.
 * @typedef {object} PickedLimits
 * @property {import('../../usage/model.js').Limits} limits - The 5-hour, 7-day, and 7-day Fable windows.
 * @property {Date | null} limitsUpdatedAt - When the 5-hour and 7-day windows were read.
 * @property {Date | null} fableUpdatedAt - When the Fable window was read.
 */

/**
 * Pick the newer of the mod's limits and Claude Code's cached usage for the 5-hour and 7-day windows,
 * taking both from one source so they describe one reading. The Fable window only comes from the cache.
 * @param {import('./limits.js').ClaudeLimits | null} modLimits - The limits the mod wrote.
 * @param {import('./account.js').CachedUsage | null} cached - The limits Claude Code cached.
 * @returns {PickedLimits} The limits to show.
 */
function pickLimits(modLimits, cached) {
  /** Whether the cache has a 5-hour or 7-day reading newer than the mod's. */
  const isCacheNewer = Boolean(cached && hasLimits(cached.limits) && (!modLimits || cached.updatedAt > modLimits.updatedAt))

  /** The source of the 5-hour and 7-day windows. */
  const source = isCacheNewer ? cached : modLimits

  /** The cache's Fable window. */
  const sevenDayFable = cached?.limits.sevenDayFable ?? null

  return {
    limits: { fiveHour: source?.limits.fiveHour ?? null, sevenDay: source?.limits.sevenDay ?? null, sevenDayFable },
    limitsUpdatedAt: source?.updatedAt ?? null,
    fableUpdatedAt: sevenDayFable ? cached.updatedAt : null,
  }
}

/**
 * Create a Claude Code usage reader, which keeps what it has read of each file between calls.
 * @returns {(options: { configDirectory: string, folders: readonly string[] }) => Promise<import('../../usage/model.js').ToolUsage | null>} The reader.
 */
function createClaudeReader() {
  /** The session, limits, title, and account readers. */
  const readSessions = createSessionReader()
  const readLimits = createLimitsReader()
  const readTitle = createTitleReader()
  const readAccount = createAccountReader()

  /**
   * Read Claude Code's usage for a workspace.
   * @param {object} options - Where to read and what to match.
   * @param {string} options.configDirectory - The Claude config folder.
   * @param {readonly string[]} options.folders - The workspace folders' paths.
   * @returns {Promise<import('../../usage/model.js').ToolUsage | null>} The usage, or null when neither the mod nor Claude Code's usage cache has anything.
   */
  async function readClaudeUsage({ configDirectory, folders }) {
    /** Every session, newest first, the mod's latest limits, and the signed-in account with its cached limits. */
    const [sessions, modLimits, account] = await Promise.all([
      readSessions(configDirectory),
      readLimits(configDirectory),
      readAccount(configDirectory),
    ])

    if (!sessions.length && !modLimits && !account.usage) return null

    /** The newest session in the workspace, its title, and the limits to show. */
    const session = sessions.find(candidate => isInWorkspace(candidate.cwd, folders)) ?? null
    const title = await readTitle(session?.transcriptPath ?? null)
    const picked = pickLimits(modLimits, account.usage)

    return {
      session: session && { title, cwd: session.cwd, context: session.context, updatedAt: session.updatedAt },
      ...picked,
      plan: account.plan,
      // Claude Code reports rate limits only on a subscription, so limits stand in when the account file doesn't say.
      access: account.access ?? (modLimits || account.usage ? 'subscription' : null),
    }
  }

  return readClaudeUsage
}

export { createClaudeReader, pruneClaudeSessions }
