/**
 * Statumo extension entry point.
 * @file Show Claude Code and Codex usage as two status bar items and keep them current.
 */

'use strict'

const os = require('node:os')
const path = require('node:path')
const vscode = require('vscode')
const { pruneClaudeSessions, readClaudeUsage } = require('./claude')
const { readCodexUsage } = require('./codex')
const { buildStatusText, buildTooltip, getLevel, isUsageStale } = require('./format')
const { expandHome } = require('./paths')

/**
 * How often the items re-read usage, in milliseconds.
 * @type {number}
 */
const refreshIntervalMs = 3000

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
 * The settings Statumo reads.
 * @typedef {object} Settings
 * @property {number} warningThreshold - Percent left at or below which an item warns.
 * @property {number} errorThreshold - Percent left at or below which an item shows an error.
 * @property {string} claudeDirectory - The Claude config folder.
 * @property {string} codexDirectory - The Codex home folder.
 */

/**
 * One tool's status bar item.
 * @typedef {object} Tool
 * @property {'claude' | 'codex'} id - The tool's settings key.
 * @property {string} label - The short label in the status bar.
 * @property {string} name - The tool's full name.
 * @property {number} priority - The item's status bar priority; higher sits further left.
 * @property {string} openCommand - The Statumo command that opens the tool.
 * @property {(settings: Settings, folders: string[], now: Date) => Promise<import('./usage').ToolUsage | null>} read - Reads the tool's usage.
 */

/**
 * The tools Statumo shows, left to right.
 * @type {Tool[]}
 */
const tools = [
  {
    id: 'claude',
    label: 'Claude',
    name: 'Claude Code',
    priority: 101,
    openCommand: 'statumo.openClaude',
    read: (settings, folders) => readClaudeUsage({ configDirectory: settings.claudeDirectory, folders }),
  },
  {
    id: 'codex',
    label: 'Codex',
    name: 'Codex',
    priority: 100,
    openCommand: 'statumo.openCodex',
    read: (settings, folders, now) => readCodexUsage({ homeDirectory: settings.codexDirectory, folders, now }),
  },
]

/**
 * Resolve a folder setting, falling back to an environment variable and then a default.
 * @param {string | undefined} value - The setting's value.
 * @param {string | undefined} environment - The environment variable's value.
 * @param {string} fallback - The folder's name under the home folder.
 * @returns {string} The folder's absolute path.
 */
function resolveFolder(value, environment, fallback) {
  const chosen = value?.trim() || environment?.trim() || path.join(os.homedir(), fallback)

  return path.resolve(expandHome(chosen))
}

/**
 * Read Statumo's settings.
 * @returns {Settings} The current settings.
 */
function readSettings() {
  const config = vscode.workspace.getConfiguration('statumo')

  return {
    warningThreshold: config.get('warningThreshold', 25),
    errorThreshold: config.get('errorThreshold', 10),
    claudeDirectory: resolveFolder(config.get('claude.configDirectory'), process.env.CLAUDE_CONFIG_DIR, '.claude'),
    codexDirectory: resolveFolder(config.get('codex.homeDirectory'), process.env.CODEX_HOME, '.codex'),
  }
}

/**
 * Whether a tool's item is turned on.
 * @param {Tool} tool - The tool.
 * @returns {boolean} True when the item should show.
 */
function isEnabled(tool) {
  return vscode.workspace.getConfiguration('statumo').get(`${tool.id}.enabled`, true)
}

/**
 * Draw a tool's usage on its item, or hide the item when there's nothing to show.
 * @param {vscode.StatusBarItem} item - The tool's item.
 * @param {Tool} tool - The tool.
 * @param {import('./usage').ToolUsage | null} usage - The tool's usage.
 * @param {Settings} settings - The current settings.
 * @param {Date} now - The current time.
 */
function render(item, tool, usage, settings, now) {
  if (!usage || !isEnabled(tool)) {
    item.hide()
    return
  }

  const level = getLevel(usage, settings, now)
  const tooltip = new vscode.MarkdownString(buildTooltip(tool.name, usage, now))

  tooltip.isTrusted = false
  tooltip.supportHtml = false
  item.text = buildStatusText(tool.label, usage, now)
  item.tooltip = tooltip
  item.accessibilityInformation = { label: `${tool.name} usage: ${item.text}` }
  item.backgroundColor = level ? new vscode.ThemeColor(`statusBarItem.${level}Background`) : undefined

  if (level) {
    item.color = new vscode.ThemeColor(`statusBarItem.${level}Foreground`)
  } else {
    item.color = isUsageStale(usage, now) ? new vscode.ThemeColor('disabledForeground') : undefined
  }

  item.show()
}

/**
 * Run the command a tool's item opens, configured per tool.
 * @param {Tool} tool - The tool to open.
 * @returns {Promise<void>} Resolves once the command has run or failed.
 */
async function openTool(tool) {
  const command = vscode.workspace.getConfiguration('statumo').get(`${tool.id}.clickCommand`, '')

  if (!command) return

  try {
    await vscode.commands.executeCommand(command)
  } catch {
    void vscode.window.showWarningMessage(
      `Statumo couldn't run "${command}". Check that the ${tool.name} extension is installed, or change statumo.${tool.id}.clickCommand.`,
    )
  }
}

/**
 * Activate the extension: create the items, then refresh them on a timer and on changes.
 * @param {vscode.ExtensionContext} context - The extension's context.
 */
function activate(context) {
  const log = vscode.window.createOutputChannel('Statumo', { log: true })
  const items = new Map()
  const lastErrors = new Map()
  let isRefreshing = false
  let isRefreshQueued = false

  for (const tool of tools) {
    const item = vscode.window.createStatusBarItem(`statumo.${tool.id}`, vscode.StatusBarAlignment.Right, tool.priority)

    item.name = `Statumo: ${tool.name}`
    item.command = tool.openCommand
    items.set(tool.id, item)
    context.subscriptions.push(item, vscode.commands.registerCommand(tool.openCommand, () => openTool(tool)))
  }

  /**
   * Re-read every tool's usage and redraw its item, folding overlapping calls into one more pass.
   * @returns {Promise<void>} Resolves once the items are redrawn.
   */
  const refresh = async () => {
    if (isRefreshing) {
      isRefreshQueued = true
      return
    }

    isRefreshing = true

    try {
      do {
        isRefreshQueued = false

        const settings = readSettings()
        const folders = (vscode.workspace.workspaceFolders ?? []).map(folder => folder.uri.fsPath)
        const now = new Date()

        await Promise.all(tools.map(async tool => {
          const item = items.get(tool.id)

          if (!isEnabled(tool)) {
            item.hide()
            return
          }

          try {
            render(item, tool, await tool.read(settings, folders, now), settings, now)
            lastErrors.delete(tool.id)
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error)

            if (lastErrors.get(tool.id) !== message) log.warn(`Couldn't read ${tool.name} usage: ${message}`)

            lastErrors.set(tool.id, message)
          }
        }))
      } while (isRefreshQueued)
    } finally {
      isRefreshing = false
    }
  }

  /**
   * Delete old Claude session files, logging rather than failing.
   * @returns {Promise<void>} Resolves once pruning finishes.
   */
  const prune = async () => {
    try {
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

  /**
   * The refresh and prune timers.
   * @type {NodeJS.Timeout[]}
   */
  const timers = [
    setInterval(() => void refresh(), refreshIntervalMs),
    setInterval(() => void prune(), pruneIntervalMs),
  ]

  context.subscriptions.push(
    log,
    { dispose: () => timers.forEach(clearInterval) },
    vscode.commands.registerCommand('statumo.refresh', () => refresh()),
    vscode.workspace.onDidChangeConfiguration(event => {
      if (event.affectsConfiguration('statumo')) void refresh()
    }),
    vscode.workspace.onDidChangeWorkspaceFolders(() => void refresh()),
    vscode.window.onDidChangeWindowState(state => {
      if (state.focused) void refresh()
    }),
  )

  void prune()
  void refresh()
}

/**
 * Deactivate the extension. The context's subscriptions dispose the items and timers.
 */
function deactivate() {}

module.exports = { activate, deactivate }
