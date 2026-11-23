/**
 * Status bar item.
 * @file Create a tool's status bar item and redraw it, changing only what changed since the last redraw.
 */

import * as vscode from 'vscode'
import { buildItemView } from './item-view.js'

/**
 * A tool's status bar item.
 * @typedef {object} StatusItem
 * @property {(usage: import('../usage/model.js').ToolUsage | null, settings: import('../settings.js').Settings, now: Date) => void} render - Draws the tool's usage, or hides the item when there's none.
 * @property {() => void} hide - Hides the item.
 * @property {() => void} dispose - Removes the item.
 */

/**
 * Wrap tooltip Markdown so it renders the sanitized HTML of its progress bars, without running commands.
 * @param {string} markdown - The tooltip's Markdown.
 * @returns {vscode.MarkdownString} The tooltip.
 */
function toTooltip(markdown) {
  /** The tooltip. */
  const tooltip = new vscode.MarkdownString(markdown)
  tooltip.isTrusted = false
  tooltip.supportHtml = true
  return tooltip
}

/**
 * Create a tool's status bar item, hidden until its first render.
 * @param {import('../providers/index.js').Tool} tool - The tool.
 * @param {object} [options] - How the item draws.
 * @param {string} [options.itemId] - The item's id, when it differs from the tool's.
 * @param {import('./rings.js').IconStyle} [options.iconStyle] - How to draw the icon before each percent.
 * @returns {StatusItem} The item.
 */
function createStatusItem(tool, { itemId = tool.id, iconStyle = 'ring' } = {}) {
  /** The VS Code item. */
  const item = vscode.window.createStatusBarItem(`statumo.${itemId}`, vscode.StatusBarAlignment.Right, tool.priority)

  /**
   * What the item showed at its last render, and whether it's showing.
   * @type {{ view: import('./item-view.js').ItemView | null, command: string | undefined, isShown: boolean }}
   */
  const last = { view: null, command: undefined, isShown: false }

  item.name = itemId === tool.id ? `Statumo: ${tool.name}` : `Statumo: ${tool.name} (${itemId})`

  /**
   * Hide the item.
   * @returns {void}
   */
  function hide() {
    if (!last.isShown) return
    item.hide()
    last.isShown = false
  }

  /**
   * Draw the tool's usage on the item, or hide it when there's nothing to show or it's turned off.
   *
   * Only the parts that changed are assigned, since each assignment redraws the item and would
   * rebuild an open tooltip.
   * @param {import('../usage/model.js').ToolUsage | null} usage - The tool's usage.
   * @param {import('../settings.js').Settings} settings - The current settings.
   * @param {Date} now - The current time.
   * @returns {void}
   */
  function render(usage, settings, now) {
    /** The tool's settings. */
    const { enabled, clickCommand } = settings.tools[tool.id]

    if (!usage || !enabled) {
      hide()
      return
    }

    /** What the item shows now, and the command a click runs. */
    const view = buildItemView(tool, usage, settings, now, iconStyle)
    const command = clickCommand || undefined

    if (command !== last.command) item.command = command

    if (view.text !== last.view?.text) item.text = view.text

    if (view.tooltip !== last.view?.tooltip) item.tooltip = toTooltip(view.tooltip)

    if (!last.view || view.level !== last.view.level) {
      item.backgroundColor = view.level ? new vscode.ThemeColor(`statusBarItem.${view.level}Background`) : undefined
      item.color = view.level ? new vscode.ThemeColor(`statusBarItem.${view.level}Foreground`) : undefined
    }

    if (view.label !== last.view?.label) item.accessibilityInformation = { label: view.label }

    last.view = view
    last.command = command

    if (!last.isShown) item.show()

    last.isShown = true
  }

  return {
    render,
    hide,

    /**
     * Remove the item.
     * @returns {void}
     */
    dispose: () => item.dispose(),
  }
}

export { createStatusItem }
