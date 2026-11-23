/**
 * Tooltip builder.
 * @file Assemble a tool's hover tooltip from its title, context, rate-limit, and footer sections.
 */

import { tooltipTitle } from './html.js'
import { contextSection, footerSection, limitSection } from './sections.js'

/**
 * The settings a tooltip reads.
 * @typedef {object} TooltipSettings
 * @property {number} warningThreshold - Percent left at or below which a window warns.
 * @property {number} errorThreshold - Percent left at or below which a window shows an error.
 * @property {'12h' | '24h'} [timeFormat] - Which clock to show reset times on, 12-hour by default.
 * @property {boolean} [showTimeUntilReset] - Whether to add how long until each reset, off by default.
 */

/**
 * Build a tool's hover tooltip as Markdown with HTML: a plain title, then context and each window
 * in sections divided by rules, each with a progress bar, and the session and reading details at the bottom.
 * The Fable window only has a section once it's reported.
 *
 * Render it with `supportHtml` on.
 * @param {string} name - The tool's full name.
 * @param {import('../../usage/model.js').ToolUsage} usage - The tool's readings.
 * @param {TooltipSettings} settings - The thresholds and how to show reset times.
 * @param {Date} now - The current time.
 * @returns {string} The tooltip's Markdown.
 */
function buildTooltip(name, usage, settings, now) {
  return [
    tooltipTitle(`${name} - Statumo`),
    contextSection(usage.session),
    limitSection('fiveHour', usage.limits.fiveHour, settings, now),
    limitSection('sevenDay', usage.limits.sevenDay, settings, now),
    usage.limits.sevenDayFable && limitSection('sevenDayFable', usage.limits.sevenDayFable, settings, now),
    footerSection(usage, now),
  ].filter(Boolean).join('\n\n---\n\n')
}

export { buildTooltip }
