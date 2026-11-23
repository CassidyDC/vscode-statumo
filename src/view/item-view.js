/**
 * Status bar item content.
 * @file Build what a tool's status bar item shows: its text, tooltip, warning level, and screen reader label.
 */

'use strict'

const { getToolLevel } = require('../usage/levels')
const { buildSegments, windowNames } = require('./segments')
const { buildTooltip } = require('./tooltip')

/**
 * Separates the parts of an item: one en space, a little wider than a plain space.
 * @type {string}
 */
const gap = ' '

/**
 * What a tool's status bar item shows.
 * @typedef {object} ItemView
 * @property {string} text - The item's text: the tool's name, then context and each window.
 * @property {string} tooltip - The tooltip's Markdown, to render with `supportHtml` on.
 * @property {'error' | 'warning' | null} level - The warning level of the lower window.
 * @property {string} label - The screen reader label.
 */

/**
 * Build what a tool's item shows. The item takes the warning or error color of its lower window,
 * and its tooltip has the full breakdown.
 * @param {{ label: string, name: string }} tool - The tool's short and full names.
 * @param {import('../usage/model').ToolUsage} usage - The tool's usage.
 * @param {{ warningThreshold: number, errorThreshold: number }} thresholds - Percent-left thresholds.
 * @param {Date} now - The current time.
 * @returns {ItemView} The item's content.
 */
function buildItemView(tool, usage, thresholds, now) {
  /** The item's segments. */
  const segments = buildSegments(usage, now)

  /** How a screen reader reads each segment. */
  const parts = [
    segments.context.value === null ? 'no context yet' : `context ${segments.context.value} used`,
    ...segments.windows.map(window => `${windowNames[window.key]} ${window.value === null ? 'not current' : `${window.value} used`}`),
  ]

  return {
    text: [tool.label, segments.context.text, ...segments.windows.map(window => window.text)].join(gap),
    tooltip: buildTooltip(tool.name, usage, thresholds, now),
    level: getToolLevel(usage.limits, thresholds, now),
    label: `${tool.name} ${parts.join(', ')}`,
  }
}

module.exports = { buildItemView }
