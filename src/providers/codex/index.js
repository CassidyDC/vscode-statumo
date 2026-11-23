/**
 * Codex usage reader.
 * @file Read Codex session logs for this workspace's context use and the account's latest rate limits.
 */

'use strict'

const path = require('node:path')
const { isInWorkspace } = require('../../files/paths')
const { emptyLimits } = require('../../usage/model')
const { createAccessReader } = require('./account')
const { createHeadReader, listLogs } = require('./logs')
const { createLogScanner } = require('./scan')
const { createTitleReader } = require('./titles')

/**
 * Create a Codex usage reader, which keeps what it has read of each log between calls.
 * @returns {(options: { homeDirectory: string, folders: readonly string[], now: Date }) => Promise<import('../../usage/model').ToolUsage | null>} The reader.
 */
function createCodexReader() {
  /** The log head reader, the log scanner, the title reader, and the access reader. */
  const heads = createHeadReader()
  const scanner = createLogScanner()
  const readTitles = createTitleReader()
  const readAccess = createAccessReader()

  /**
   * Read Codex's usage for a workspace.
   * @param {object} options - Where to read and what to match.
   * @param {string} options.homeDirectory - The Codex home folder.
   * @param {readonly string[]} options.folders - The workspace folders' paths.
   * @param {Date} options.now - The current time.
   * @returns {Promise<import('../../usage/model').ToolUsage | null>} The usage, or null when there are no recent logs.
   */
  async function readCodexUsage({ homeDirectory, folders, now }) {
    /** The recent logs, newest first, and their paths. */
    const logs = await listLogs(path.join(homeDirectory, 'sessions'), now)
    const filePaths = logs.map(log => log.filePath)

    heads.retain(filePaths)
    scanner.retain(filePaths)

    if (!logs.length) return null

    /** The workspace's session, and the newest scan that has limits. */
    let session = null
    let limitsScan = null

    for (const log of logs) {
      if (session && limitsScan) break

      /** The log's head, and whether it's the newest log in the workspace. */
      const head = await heads.read(log.filePath)
      const isWorkspaceLog = !session && isInWorkspace(head.cwd, folders)

      if (!isWorkspaceLog && limitsScan) continue

      /** The log's latest token counts. */
      const scan = await scanner.scan(log.filePath, log)

      if (isWorkspaceLog) {
        /** Session titles by id. */
        const titles = await readTitles(homeDirectory)

        session = {
          title: (head.id && titles.get(head.id)) || null,
          cwd: head.cwd,
          context: scan.context,
          updatedAt: new Date(log.mtimeMs),
        }
      }

      if (!limitsScan && scan.limits) limitsScan = scan
    }

    return {
      session,
      limits: limitsScan?.limits ?? emptyLimits(),
      limitsUpdatedAt: limitsScan?.limitsAt ?? null,
      plan: limitsScan?.plan ?? null,
      // Only a ChatGPT sign-in reports a plan, so one stands in when the auth file doesn't say.
      access: (await readAccess(homeDirectory)) ?? (limitsScan?.plan ? 'subscription' : null),
    }
  }

  return readCodexUsage
}

module.exports = { createCodexReader }
