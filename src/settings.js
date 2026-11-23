/**
 * Statumo settings.
 * @file Read Statumo's settings, resolving the Claude Code and Codex folders.
 */

import * as vscode from 'vscode'
import { resolveFolder } from './files/paths.js'

/**
 * One tool's settings.
 * @typedef {object} ToolSettings
 * @property {boolean} enabled - Whether the tool's item shows.
 * @property {string} clickCommand - The command a click on the item runs, or empty for none.
 */

/**
 * The settings Statumo reads.
 * @typedef {object} Settings
 * @property {number} warningThreshold - Percent left at or below which an item warns.
 * @property {number} errorThreshold - Percent left at or below which an item shows an error.
 * @property {string} claudeDirectory - The Claude config folder.
 * @property {string} codexDirectory - The Codex home folder.
 * @property {Record<'claude' | 'codex', ToolSettings>} tools - Each tool's settings.
 */

/**
 * Read Statumo's settings.
 * @returns {Settings} The current settings.
 */
function readSettings() {
  /** Statumo's settings section. */
  const config = vscode.workspace.getConfiguration('statumo')

  /**
   * Read one tool's settings.
   * @param {'claude' | 'codex'} id - The tool's settings key.
   * @returns {ToolSettings} The tool's settings.
   */
  const readTool = id => ({
    enabled: config.get(`${id}.enabled`, true),
    clickCommand: String(config.get(`${id}.clickCommand`, '') ?? '').trim(),
  })

  return {
    warningThreshold: config.get('warningThreshold', 25),
    errorThreshold: config.get('errorThreshold', 10),
    claudeDirectory: resolveFolder(config.get('claude.configDirectory'), process.env.CLAUDE_CONFIG_DIR, '.claude'),
    codexDirectory: resolveFolder(config.get('codex.homeDirectory'), process.env.CODEX_HOME, '.codex'),
    tools: { claude: readTool('claude'), codex: readTool('codex') },
  }
}

export { readSettings }
