/**
 * Refresh loop.
 * @file Re-read every tool's usage and redraw its item on a timer and on demand, one pass at a time.
 */

'use strict'

/**
 * How often the items re-read usage, in milliseconds.
 * @type {number}
 */
const refreshIntervalMs = 3000

/**
 * A running refresh loop.
 * @typedef {object} RefreshLoop
 * @property {() => Promise<void>} refresh - Re-reads every tool and redraws its item, folding overlapping calls into one more pass.
 * @property {() => void} dispose - Stops the timer.
 */

/**
 * Start refreshing the items every few seconds while the window has focus.
 *
 * A refresh asked for while one runs waits and runs once after it, however many were asked for.
 * A tool whose read fails keeps its last drawing, and each new failure message is logged once.
 * @param {object} options - What to refresh, and where its inputs come from.
 * @param {import('./providers').Tool[]} options.tools - The tools.
 * @param {Map<string, import('./view/status-item').StatusItem>} options.items - Each tool's item, by tool id.
 * @param {() => import('./settings').Settings} options.readSettings - Reads the current settings.
 * @param {() => string[]} options.readFolders - Reads the workspace folders' paths.
 * @param {() => boolean} options.isFocused - Whether the window has focus; timer passes are skipped without it.
 * @param {{ warn: (message: string) => void }} options.log - Where read failures are logged.
 * @returns {RefreshLoop} The loop.
 */
function startRefreshLoop({ tools, items, readSettings, readFolders, isFocused, log }) {
  /** The last failure message of each tool, by tool id. */
  const lastErrors = new Map()

  /** Whether a pass is running, and whether another was asked for meanwhile. */
  let isRefreshing = false
  let isRefreshQueued = false

  /**
   * Read one tool's usage and redraw its item, logging a new failure message once.
   * @param {import('./providers').Tool} tool - The tool.
   * @param {import('./settings').Settings} settings - The current settings.
   * @param {string[]} folders - The workspace folders' paths.
   * @param {Date} now - The current time.
   * @returns {Promise<void>} Resolves once the item is redrawn or the failure logged.
   */
  async function refreshTool(tool, settings, folders, now) {
    /** The tool's item. */
    const item = items.get(tool.id)

    if (!settings.tools[tool.id].enabled) {
      item.hide()
      return
    }

    try {
      item.render(await tool.read(settings, folders, now), settings, now)
      lastErrors.delete(tool.id)
    } catch (error) {
      /** The failure's message. */
      const message = error instanceof Error ? error.message : String(error)
      if (lastErrors.get(tool.id) !== message) log.warn(`Couldn't read ${tool.name} usage: ${message}`)
      lastErrors.set(tool.id, message)
    }
  }

  /**
   * Re-read every tool's usage and redraw its item, folding overlapping calls into one more pass.
   * @returns {Promise<void>} Resolves once the items are redrawn.
   */
  async function refresh() {
    if (isRefreshing) {
      isRefreshQueued = true
      return
    }

    isRefreshing = true

    try {
      do {
        isRefreshQueued = false

        /** The settings, workspace folders, and time this pass reads with. */
        const settings = readSettings()
        const folders = readFolders()
        const now = new Date()

        await Promise.all(tools.map(tool => refreshTool(tool, settings, folders, now)))
      } while (isRefreshQueued)
    } finally {
      isRefreshing = false
    }
  }

  /** The refresh timer, which skips passes while another window has focus. */
  const timer = setInterval(() => {
    if (isFocused()) void refresh()
  }, refreshIntervalMs)

  return { refresh, dispose: () => clearInterval(timer) }
}

module.exports = { refreshIntervalMs, startRefreshLoop }
