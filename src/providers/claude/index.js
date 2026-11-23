/**
 * Claude Code usage reader.
 * @file Combine the Usage mod's session and limits files with the session's transcript title and the signed-in account.
 */

'use strict'

const { isInWorkspace } = require('../../files/paths')
const { emptyLimits } = require('../../usage/model')
const { createAccountReader } = require('./account')
const { createLimitsReader } = require('./limits')
const { createSessionReader, pruneClaudeSessions } = require('./sessions')
const { createTitleReader } = require('./title')

/**
 * Create a Claude Code usage reader, which keeps what it has read of each file between calls.
 * @returns {(options: { configDirectory: string, folders: readonly string[] }) => Promise<import('../../usage/model').ToolUsage | null>} The reader.
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
   * @returns {Promise<import('../../usage/model').ToolUsage | null>} The usage, or null when the mod has written neither sessions nor limits.
   */
  async function readClaudeUsage({ configDirectory, folders }) {
    /** Every session, newest first, and the account's latest limits. */
    const [sessions, limits] = await Promise.all([readSessions(configDirectory), readLimits(configDirectory)])

    if (!sessions.length && !limits) return null

    /** The newest session in the workspace, its title, and the signed-in account. */
    const session = sessions.find(candidate => isInWorkspace(candidate.cwd, folders)) ?? null
    const [title, account] = await Promise.all([readTitle(session?.transcriptPath ?? null), readAccount(configDirectory)])

    return {
      session: session && { title, cwd: session.cwd, context: session.context, updatedAt: session.updatedAt },
      limits: limits?.limits ?? emptyLimits(),
      limitsUpdatedAt: limits?.updatedAt ?? null,
      plan: account.plan,
      // Claude Code reports rate limits only on a subscription, so limits stand in when the account file doesn't say.
      access: account.access ?? (limits ? 'subscription' : null),
    }
  }

  return readClaudeUsage
}

module.exports = { createClaudeReader, pruneClaudeSessions }
