/**
 * Tooltip sections.
 * @file Build the tooltip's context, rate-limit, and footer sections from a tool's readings.
 */

import { tildify, truncatePath } from '../../files/paths.js'
import { getWindowLevel, isLimitStale, percentUsed } from '../../usage/levels.js'
import { formatAge, formatReset, formatTokens } from '../format.js'
import { windowNames } from '../segments.js'
import { amount, footerRow, gapRow, progressBar, statusSection, tooltipSection } from './html.js'

/**
 * Build the tooltip section for the session's context.
 * @param {import('../../usage/model.js').SessionReading | null} session - The workspace's session.
 * @returns {string} The section's HTML.
 */
function contextSection(session) {
  if (!session) return statusSection('Context', null, 'No session in this workspace yet', null)
  if (!session.context) return statusSection('Context', null, 'Not reported yet', null)

  /** The context reading's values, and the token counts across from the label. */
  const { tokens = null, window = null, percent = null } = session.context
  const note = `${formatTokens(tokens)} / ${formatTokens(window)} tokens`
  if (percent === null) return statusSection('Context', note, 'Unknown', null)
  return tooltipSection('Context', note, amount(Math.round(percent), 'used'), progressBar(percent))
}

/**
 * Build the tooltip section for one rate-limit window.
 * @param {'fiveHour' | 'sevenDay'} key - Which window.
 * @param {import('../../usage/model.js').LimitReading | null} limit - The window's reading.
 * @param {{ warningThreshold: number, errorThreshold: number }} thresholds - Percent-left thresholds.
 * @param {Date} now - The current time.
 * @returns {string} The section's HTML.
 */
function limitSection(key, limit, thresholds, now) {
  /** The window's name, capitalized. */
  const label = windowNames[key].replace(/^./, letter => letter.toUpperCase())
  if (!limit) return statusSection(label, null, 'Not reported yet', null)
  if (isLimitStale(limit, now)) return statusSection(label, 'Inactive', 'No reading since the reset', progressBar(0))

  /** The rounded percent used, and when the window resets. */
  const used = percentUsed(limit)
  const note = limit.resetsAt ? `Resets ${formatReset(limit.resetsAt, now)}` : null
  return tooltipSection(label, note, amount(used, 'used'), progressBar(used, getWindowLevel(limit, thresholds, now)))
}

/**
 * Describe the account's plan and how the tool signs in: the plan with `subscription` after it,
 * `API` for an API key, which has no plan, or the plan alone when the sign-in isn't known.
 * @param {object} usage - The tool's readings.
 * @param {string | null} usage.plan - The account's plan.
 * @param {'subscription' | 'api' | null} [usage.access] - How the tool signs in.
 * @returns {string | null} The description, or null when neither is known.
 */
function planLabel({ plan, access = null }) {
  if (access === 'api') return 'API'
  if (access === 'subscription') return plan ? `${plan} subscription` : 'Subscription'
  return plan
}

/**
 * Build the tooltip's footer: a table of the session's chat title, the session's folder, the plan,
 * when the limits were read, and the session's last activity, each labelled on the left.
 * @param {import('../../usage/model.js').ToolUsage} usage - The tool's readings.
 * @param {Date} now - The current time.
 * @returns {string} The footer's HTML, or nothing when there is nothing to show.
 */
function footerSection(usage, now) {
  /** The workspace's session, the plan's description, and the footer's rows. */
  const { session } = usage
  const plan = planLabel(usage)
  const rows = []
  // Text inside an HTML block can't break it with a blank line, so whitespace runs become spaces.
  if (session?.title) rows.push(footerRow('Chat', session.title.replace(/\s+/g, ' ')))
  if (session?.cwd) rows.push(footerRow('Folder', truncatePath(tildify(session.cwd))))
  if (plan) rows.push(footerRow('Plan', plan))
  if (usage.limitsUpdatedAt) rows.push(footerRow('Limits Read', formatAge(usage.limitsUpdatedAt, now)))
  if (session) rows.push(footerRow('Last Activity', formatAge(session.updatedAt, now)))
  return rows.length ? `<table>${gapRow(3)}${rows.join('')}</table>` : ''
}

export { contextSection, footerSection, limitSection, planLabel }
