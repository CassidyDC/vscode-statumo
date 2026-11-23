/**
 * Tool list.
 * @file Name the tools Statumo shows, their status bar places, and how each reads its usage.
 */

'use strict'

const { createClaudeReader } = require('./claude')
const { createCodexReader } = require('./codex')

/**
 * One tool's status bar item.
 * @typedef {object} Tool
 * @property {'claude' | 'codex'} id - The tool's settings key.
 * @property {string} label - The tool's short name, which starts its status bar item.
 * @property {string} name - The tool's full name.
 * @property {number} priority - The tool's status bar priority; higher sits further left.
 * @property {(settings: import('../settings').Settings, folders: readonly string[], now: Date) => Promise<import('../usage/model').ToolUsage | null>} read - Reads the tool's usage.
 */

/**
 * The status bar priority Statumo's items sit at, just left of Copilot's 100.1 and the editor status items.
 *
 * Each tool sits a tiny step above this, off the round numbers other items use, with the tools a
 * step apart, so no other item's priority falls between them and they stay side by side.
 * @type {number}
 */
const basePriority = 101

/**
 * The gap between neighboring tools' priorities.
 * @type {number}
 */
const priorityStep = 0.00001

/**
 * Create the tools Statumo shows, left to right, each with its own reader and caches.
 * @returns {Tool[]} The tools.
 */
function createTools() {
  /** The Claude Code and Codex readers. */
  const readClaudeUsage = createClaudeReader()
  const readCodexUsage = createCodexReader()

  return [
    {
      id: 'claude',
      label: 'Claude',
      name: 'Claude Code',
      priority: basePriority + 2 * priorityStep,

      /**
       * Read Claude Code's usage.
       * @param {import('../settings').Settings} settings - The current settings.
       * @param {readonly string[]} folders - The workspace folders' paths.
       * @returns {Promise<import('../usage/model').ToolUsage | null>} The usage.
       */
      read: (settings, folders) => readClaudeUsage({ configDirectory: settings.claudeDirectory, folders }),
    },
    {
      id: 'codex',
      label: 'Codex',
      name: 'Codex',
      priority: basePriority + priorityStep,

      /**
       * Read Codex's usage.
       * @param {import('../settings').Settings} settings - The current settings.
       * @param {readonly string[]} folders - The workspace folders' paths.
       * @param {Date} now - The current time.
       * @returns {Promise<import('../usage/model').ToolUsage | null>} The usage.
       */
      read: (settings, folders, now) => readCodexUsage({ homeDirectory: settings.codexDirectory, folders, now }),
    },
  ]
}

module.exports = { createTools }
