/**
 * Tooltip sections.
 * @file Build the tooltip's context, rate-limit, and footer sections from a tool's readings.
 */

import { tildify, truncatePath } from '../../files/paths.js'
import { getWindowLevel, isLimitStale, percentUsed } from '../../usage/levels.js'
import { formatAge, formatReset, formatTokens } from '../format.js'
import { symbolIconId } from '../rings.js'
import { windowNames, windowRings } from '../segments.js'
import { amount, footerEndGap, footerRow, gapRow, progressBar, sectionLabel, statusSection, tooltipSection } from './html.js'

/**
 * Build the tooltip section for the session's context.
 * @param {import('../../usage/model.js').SessionReading | null} session - The workspace's session.
 * @returns {string} The section's HTML.
 */
function contextSection(session) {
  /** The section's label, led by the context symbol. */
  const label = sectionLabel(symbolIconId('cx'), 'Context')

  if (!session) return statusSection(label, null, 'No session in this workspace yet', null)
  if (!session.context) return statusSection(label, null, 'Not reported yet', null)

  /** The context reading's values, and the token counts across from the label. */
  const { tokens = null, window = null, percent = null } = session.context
  const note = `${formatTokens(tokens)} / ${formatTokens(window)} tokens`
  if (percent === null) return statusSection(label, note, 'Unknown', null)
  return tooltipSection(label, note, amount(Math.round(percent), 'used'), progressBar(percent))
}

/**
 * Build the tooltip section for one rate-limit window. A window whose reset has passed with no newer
 * reading has reset, so it shows 0% used and when it reset.
 * @param {import('../segments.js').WindowKey} key - Which window.
 * @param {import('../../usage/model.js').LimitReading | null} limit - The window's reading.
 * @param {import('./index.js').TooltipSettings} settings - The thresholds and how to show reset times.
 * @param {Date} now - The current time.
 * @returns {string} The section's HTML.
 */
function limitSection(key, limit, settings, now) {
  /** The window's name, capitalized and led by its symbol. */
  const label = sectionLabel(symbolIconId(windowRings[key]), windowNames[key].replace(/^./, letter => letter.toUpperCase()))

  if (!limit) return statusSection(label, null, 'Not reported yet', null)

  if (isLimitStale(limit, now)) {
    /** When the window reset. */
    const reset = `Last reset ${formatReset(limit.resetsAt, now, { timeFormat: settings.timeFormat })}`
    return tooltipSection(label, reset, amount(0, 'used'), progressBar(0))
  }

  /** The rounded percent used, and when the window resets; the 5-hour window always resets within a day, so it skips the day. */
  const used = percentUsed(limit)
  const note = limit.resetsAt ? `Resets ${formatReset(limit.resetsAt, now, { ...settings, showDay: key !== 'fiveHour' })}` : null
  return tooltipSection(label, note, amount(used, 'used'), progressBar(used, getWindowLevel(limit, settings, now)))
}

/**
 * Describe the account's plan and how the tool signs in: the plan with `Subscription` after it,
 * `API` for an API key, which has no plan, or the plan alone when the sign-in isn't known.
 * @param {object} usage - The tool's readings.
 * @param {string | null} usage.plan - The account's plan.
 * @param {'subscription' | 'api' | null} [usage.access] - How the tool signs in.
 * @returns {string | null} The description, or null when neither is known.
 */
function planLabel({ plan, access = null }) {
  if (access === 'api') return 'API'
  if (access === 'subscription') return plan ? `${plan} Subscription` : 'Subscription'
  return plan
}

/**
 * Build the tooltip's footer: a table of the session's chat title, the session's folder, the plan,
 * when the limits were read, and the session's last activity, each labelled on the left. The limits'
 * read time is left out when it shows the same age as the last activity, since one turn usually
 * writes both. The Fable limit gets its own read time when it comes from an older reading than the
 * other limits.
 * @param {import('../../usage/model.js').ToolUsage} usage - The tool's readings.
 * @param {Date} now - The current time.
 * @returns {string} The footer's HTML, or nothing when there is nothing to show.
 */
function footerSection(usage, now) {
  /** The workspace's session, the plan's description, and the footer's rows. */
  const { session } = usage
  const plan = planLabel(usage)
  const rows = []

  /** How long ago the session last changed and the limits were read, or null when unknown. */
  const activityAge = session ? formatAge(session.updatedAt, now) : null
  const limitsAge = usage.limitsUpdatedAt ? formatAge(usage.limitsUpdatedAt, now) : null

  // Text inside an HTML block can't break it with a blank line, so whitespace runs become spaces.
  if (session?.title) rows.push(footerRow('Chat', session.title.replace(/\s+/g, ' ')))

  if (session?.cwd) rows.push(footerRow('Folder', truncatePath(tildify(session.cwd))))

  if (plan) rows.push(footerRow('Plan', plan))

  if (limitsAge && limitsAge !== activityAge) rows.push(footerRow('Limits Read', limitsAge))

  if (usage.limits.sevenDayFable && usage.fableUpdatedAt && usage.fableUpdatedAt.getTime() !== usage.limitsUpdatedAt?.getTime()) {
    rows.push(footerRow('Fable Read', formatAge(usage.fableUpdatedAt, now)))
  }

  if (activityAge) rows.push(footerRow('Last Activity', activityAge))

  return rows.length ? `<table>${gapRow(3)}${rows.join('')}${gapRow(3, footerEndGap)}</table>` : ''
}

export { contextSection, footerSection, limitSection, planLabel }
