/**
 * Statumo extension entry point.
 * @file Show Claude Code and Codex usage as two status bar items and keep them current.
 */

'use strict'

const vscode = require('vscode')
const { createTools } = require('./providers')
const { pruneClaudeSessions } = require('./providers/claude')
const { startRefreshLoop } = require('./refresh')
const { readSettings } = require('./settings')
const { createStatusItem } = require('./view/status-item')

/**
 * How old an unchanged Claude session file must be before it's deleted.
 * @type {number}
 */
const sessionFileMaxAgeMs = 30 * 86_400_000

/**
 * How often old Claude session files are pruned, in milliseconds.
 * @type {number}
 */
const pruneIntervalMs = 86_400_000

/**
 * Activate the extension: create the items, then refresh them on a timer and on changes.
 * @param {vscode.ExtensionContext} context - The extension's context.
 * @returns {void}
 */
function activate(context) {
  /** The Statumo output channel, the tools, and each tool's item. */
  const log = vscode.window.createOutputChannel('Statumo', { log: true })
  const tools = createTools()
  const items = new Map(tools.map(tool => [tool.id, createStatusItem(tool)]))

  /** The refresh loop. */
  const loop = startRefreshLoop({
    tools,
    items,
    readSettings,

    /**
     * Read the workspace folders' paths.
     * @returns {string[]} The paths.
     */
    readFolders: () => (vscode.workspace.workspaceFolders ?? []).map(folder => folder.uri.fsPath),

    /**
     * Whether this window has focus.
     * @returns {boolean} True when focused.
     */
    isFocused: () => vscode.window.state.focused,
    log,
  })

  /**
   * Delete old Claude session files, logging rather than failing.
   * @returns {Promise<void>} Resolves once pruning finishes.
   */
  const prune = async () => {
    try {
      /** How many files were deleted. */
      const deleted = await pruneClaudeSessions({
        configDirectory: readSettings().claudeDirectory,
        maxAgeMs: sessionFileMaxAgeMs,
        now: new Date(),
      })

      if (deleted) log.info(`Deleted ${deleted} Claude session files older than 30 days.`)
    } catch (error) {
      log.warn(`Couldn't prune Claude session files: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  /** The prune timer. */
  const pruneTimer = setInterval(() => void prune(), pruneIntervalMs)

  context.subscriptions.push(
    log,
    ...items.values(),
    loop,
    { dispose: () => clearInterval(pruneTimer) },
    vscode.commands.registerCommand('statumo.refresh', () => loop.refresh()),
    vscode.workspace.onDidChangeConfiguration(event => {
      if (event.affectsConfiguration('statumo')) void loop.refresh()
    }),
    vscode.workspace.onDidChangeWorkspaceFolders(() => void loop.refresh()),
    vscode.window.onDidChangeWindowState(state => {
      if (state.focused) void loop.refresh()
    }),
  )

  void prune()
  void loop.refresh()
}

/**
 * Deactivate the extension. The context's subscriptions dispose the items and timers.
 * @returns {void}
 */
function deactivate() {}

module.exports = { activate, deactivate }
