/**
 * Tooltip builder.
 * @file Assemble a tool's hover tooltip from its title, context, rate-limit, and footer sections.
 */

import { escapeMarkdown } from './html.js'
import { contextSection, footerSection, limitSection } from './sections.js'

/**
 * Build a tool's hover tooltip as Markdown with HTML: a plain title, then context and each window
 * in sections divided by rules, each with a progress bar, and the session and reading details at the bottom.
 *
 * Render it with `supportHtml` on.
 * @param {string} name - The tool's full name.
 * @param {import('../../usage/model.js').ToolUsage} usage - The tool's readings.
 * @param {{ warningThreshold: number, errorThreshold: number }} thresholds - Percent-left thresholds.
 * @param {Date} now - The current time.
 * @returns {string} The tooltip's Markdown.
 */
function buildTooltip(name, usage, thresholds, now) {
  return [
    escapeMarkdown(`${name} - Statumo`),
    contextSection(usage.session),
    limitSection('fiveHour', usage.limits.fiveHour, thresholds, now),
    limitSection('sevenDay', usage.limits.sevenDay, thresholds, now),
    footerSection(usage, now),
  ].filter(Boolean).join('\n\n---\n\n')
}

export { buildTooltip }
