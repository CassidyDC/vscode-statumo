/**
 * Tooltip tests.
 * @file Check the tooltip's sections, footer rows, plan label, escaping, and progress bars.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildTooltip } from '../../src/view/tooltip/index.js'

/**
 * A fixed current time for every test.
 * @type {Date}
 */
const now = new Date(2026, 10, 22, 10, 0)

/**
 * The default warning and error thresholds.
 * @type {{ warningThreshold: number, errorThreshold: number }}
 */
const thresholds = { warningThreshold: 25, errorThreshold: 10 }

/**
 * Build a usage reading with a session and both windows.
 * @param {object} [overrides] - Fields to replace.
 * @returns {import('../../src/usage/model.js').ToolUsage} The usage.
 */
function makeUsage(overrides = {}) {
  return {
    session: {
      title: 'Refactor parser',
      cwd: '/work/project',
      context: { tokens: 48_300, window: 400_000, percent: 12 },
      updatedAt: new Date(2026, 10, 22, 9, 58),
    },
    limits: {
      fiveHour: { percentUsed: 16, resetsAt: new Date(2026, 10, 22, 14, 30) },
      sevenDay: { percentUsed: 39, resetsAt: new Date(2026, 10, 27, 9, 0) },
    },
    limitsUpdatedAt: new Date(2026, 10, 22, 9, 58),
    plan: null,
    access: null,
    ...overrides,
  }
}

/**
 * Read one labelled detail from a tooltip's footer table.
 * @param {string} tooltip - The tooltip, or its footer.
 * @param {string} label - The row's label.
 * @returns {string | undefined} The row's detail, or undefined when there is no such row.
 */
function footerDetail(tooltip, label) {
  return new RegExp(`>${label}</span></td><td width="12"></td><td><span[^>]*>([^<]*)<`).exec(tooltip)?.[1]
}

test('shows a window whose reset has passed at 0% with when it reset', () => {
  /** Usage whose 5-hour window reset an hour ago. */
  const usage = makeUsage({
    limits: {
      fiveHour: { percentUsed: 90, resetsAt: new Date(2026, 10, 22, 9, 0) },
      sevenDay: { percentUsed: 39, resetsAt: new Date(2026, 10, 27, 9, 0) },
    },
  })

  /** The usage's tooltip, with the time until each reset asked for. */
  const tooltip = buildTooltip('Codex', usage, { ...thresholds, showTimeUntilReset: true }, now)

  assert.match(tooltip, /<b><span class="codicon codicon-statumo-five-hour-symbol"><\/span>\u00a05-hour limit<\/b><\/td><td align="right">.*>Reset today at 9:00 AM<.*<\/tr><tr><td colspan="2"><h2>0% .*used/)
  assert.doesNotMatch(tooltip, /Inactive|No reading since the reset/)
})

test('names a reset from yesterday as yesterday', () => {
  /** Usage whose 5-hour window reset last night. */
  const usage = makeUsage({ limits: { ...makeUsage().limits, fiveHour: { percentUsed: 90, resetsAt: new Date(2026, 10, 21, 23, 0) } } })

  assert.match(buildTooltip('Codex', usage, thresholds, now), />Reset yesterday at 11:00 PM</)
})

test('adds a Weekly Fable limit section only once it is reported', () => {
  /** Usage with a Fable reading, and its tooltip's sections. */
  const usage = makeUsage({ limits: { ...makeUsage().limits, sevenDayFable: { percentUsed: 3, resetsAt: new Date(2026, 10, 24, 2, 0) } } })
  const sections = buildTooltip('Claude Code', usage, thresholds, now).split('\n\n---\n\n')

  assert.equal(sections.length, 6)
  assert.match(sections[4], /<b><span class="codicon codicon-statumo-fable-symbol"><\/span>\u00a0Weekly Fable limit<\/b>.*Resets Nov 24 at 2:00 AM<.*<\/tr><tr><td colspan="2"><h2>3% .*used/)
  assert.doesNotMatch(buildTooltip('Codex', makeUsage(), thresholds, now), /Fable/)
})

test('shows when the Fable limit was read only when it differs from the other limits', () => {
  /** A Fable reading, and usage with it read with the other limits and on its own. */
  const sevenDayFable = { percentUsed: 3, resetsAt: new Date(2026, 10, 24, 2, 0) }
  const together = makeUsage({ limits: { ...makeUsage().limits, sevenDayFable }, fableUpdatedAt: new Date(2026, 10, 22, 9, 58) })
  const apart = makeUsage({ limits: { ...makeUsage().limits, sevenDayFable }, fableUpdatedAt: new Date(2026, 10, 22, 8, 0) })

  assert.equal(footerDetail(buildTooltip('Claude Code', together, thresholds, now), 'Fable Read'), undefined)
  assert.equal(footerDetail(buildTooltip('Claude Code', apart, thresholds, now), 'Fable Read'), '2h ago')
})

test('lays out each tooltip section as one table of label and note, heading-sized amount, then bar', () => {
  /** Usage with a plan and a title full of Markdown. */
  const usage = makeUsage({ plan: 'Plus', access: 'subscription' })

  usage.session.title = 'Fix [link](https://example.com) *now*'

  /** The tooltip, and its sections. */
  const tooltip = buildTooltip('Codex', usage, thresholds, now)
  const sections = tooltip.split('\n\n---\n\n')

  assert.equal(sections.length, 5)
  assert.equal(sections[0], '<table><tr><td><h2>Codex - Statumo</h2></td></tr></table>')
  assert.match(sections[1], /^<table width="100%"><tr><td colspan="2" height="8"><\/td><\/tr><tr><td><b><span class="codicon codicon-statumo-context-symbol"><\/span>\u00a0Context<\/b><\/td><td align="right">.*48\.3k \/ 400k tokens.*<\/td><\/tr><tr><td colspan="2"><h2>12% .*used.*<\/h2><h6>(<small>){4}<span.*<\/h6><\/td><\/tr><\/table>$/)
  assert.match(sections[2], /^<table width="100%"><tr><td colspan="2" height="8"><\/td><\/tr><tr><td><b><span class="codicon codicon-statumo-five-hour-symbol"><\/span>\u00a05-hour limit<\/b><\/td><td align="right">.*Resets today at 2:30 PM<.*<\/tr><tr><td colspan="2"><h2>16% .*used/)
  assert.match(sections[3], /<b><span class="codicon codicon-statumo-weekly-symbol"><\/span>\u00a0Weekly limit<\/b>.*Resets Nov 27 at 9:00 AM<.*<\/tr><tr><td colspan="2"><h2>39% .*used/)
  assert.match(sections[4], /^<table><tr><td colspan="3" height="8"><\/td><\/tr><tr><td><span[^>]*>Chat<.*Folder<.*Plan<.*Last Activity<.*<\/table>$/)
  assert.equal(footerDetail(sections[4], 'Chat'), 'Fix [link](https://example.com) *now*')
  assert.equal(footerDetail(sections[4], 'Plan'), 'Plus Subscription')
  assert.equal(footerDetail(sections[4], 'Folder'), '/work/project')
  assert.equal(footerDetail(sections[4], 'Last Activity'), '2m ago')
})

test('shows reset times on the chosen clock, with the time until each reset when asked', () => {
  /** The default tooltip, and one on a 24-hour clock with the time until each reset. */
  const tooltip = buildTooltip('Codex', makeUsage(), thresholds, now)
  const detailed = buildTooltip('Codex', makeUsage(), { ...thresholds, timeFormat: '24h', showTimeUntilReset: true }, now)

  assert.match(tooltip, />Resets today at 2:30 PM</)
  assert.match(detailed, />Resets today at 14:30 \(4h 30m\)</)
  assert.match(detailed, />Resets Nov 27 at 09:00 \(4d 23h\)</)
})

test('leaves a gap row after the footer\'s last row', () => {
  /** The tooltip's footer. */
  const footer = buildTooltip('Codex', makeUsage(), thresholds, now).split('\n\n---\n\n').at(-1)

  assert.match(footer, /<\/tr><tr><td colspan="3" height="1"><\/td><\/tr><\/table>$/)
})

test('shows the last activity and when the limits were read in their own rows', () => {
  /** Usage whose limits were read over three hours ago, and its tooltip. */
  const usage = makeUsage({ limitsUpdatedAt: new Date(2026, 10, 22, 6, 45) })
  const tooltip = buildTooltip('Codex', usage, thresholds, now)

  assert.equal(footerDetail(tooltip, 'Last Activity'), '2m ago')
  assert.equal(footerDetail(tooltip, 'Limits Read'), '3h 15m ago')
})

test('leaves out when the limits were read when it shows the same age as the last activity', () => {
  /** Usage whose limits were read seconds apart from the session's last change, and usage with no session. */
  const together = makeUsage({ limitsUpdatedAt: new Date(2026, 10, 22, 9, 57, 30) })
  const sessionless = makeUsage({ session: null })

  assert.equal(footerDetail(buildTooltip('Codex', together, thresholds, now), 'Limits Read'), undefined)
  assert.equal(footerDetail(buildTooltip('Codex', together, thresholds, now), 'Last Activity'), '2m ago')
  assert.equal(footerDetail(buildTooltip('Codex', sessionless, thresholds, now), 'Limits Read'), '2m ago')
})

test('shows a reading from the last minute as Just now', () => {
  /** A tooltip whose limits were read this minute. */
  const tooltip = buildTooltip('Codex', makeUsage({ limitsUpdatedAt: now }), thresholds, now)

  assert.equal(footerDetail(tooltip, 'Limits Read'), 'Just now')
})

test('names the plan with how the tool signs in', () => {
  /**
   * Read the Plan row's detail from a tooltip built with the given plan and access.
   * @param {string | null} plan - The account's plan.
   * @param {'subscription' | 'api' | null} access - How the tool signs in.
   * @returns {string | undefined} The Plan row's detail, or undefined when there is none.
   */
  const planLine = (plan, access) => footerDetail(buildTooltip('Codex', makeUsage({ plan, access }), thresholds, now), 'Plan')
  assert.equal(planLine('Plus', 'subscription'), 'Plus Subscription')
  assert.equal(planLine(null, 'subscription'), 'Subscription')
  assert.equal(planLine('Plus', 'api'), 'API')
  assert.equal(planLine('Plus', null), 'Plus')
  assert.equal(planLine(null, null), undefined)
})

test('escapes HTML in session titles so only the progress bars are HTML', () => {
  /** Usage whose title is an HTML tag. */
  const usage = makeUsage()
  usage.session.title = '<img src=x onerror=alert(1)>'
  assert.doesNotMatch(buildTooltip('Codex', usage, thresholds, now), /(?<!\\)<img/)
})

test('draws progress bars from theme colors, coloring low windows', () => {
  /** Usage whose 5-hour window is nearly used up. */
  const usage = makeUsage({
    limits: {
      fiveHour: { percentUsed: 95, resetsAt: new Date(2026, 10, 22, 14, 30) },
      sevenDay: { percentUsed: 39, resetsAt: new Date(2026, 10, 27, 9, 0) },
    },
  })

  /** The usage's tooltip. */
  const tooltip = buildTooltip('Codex', usage, thresholds, now)

  assert.match(tooltip, /<span style="background-color:var\(--vscode-editorHoverWidget-border\);border-radius:2px;"><span style="background-color:var\(--vscode-editorError-foreground\);border-radius:2px;">\u00a0{247}<\/span>\u00a0{13}<\/span>/)
  assert.match(tooltip, /<span style="background-color:var\(--vscode-button-background\);border-radius:2px;">\u00a0{101}<\/span>\u00a0{159}<\/span>/)
})

test('draws an empty bar as the track alone and a full bar as the fill alone', () => {
  /** Usage whose 5-hour window is unused and whose weekly window is used up. */
  const usage = makeUsage({
    limits: {
      fiveHour: { percentUsed: 0, resetsAt: new Date(2026, 10, 22, 14, 30) },
      sevenDay: { percentUsed: 100, resetsAt: new Date(2026, 10, 27, 9, 0) },
    },
  })

  /** The usage's tooltip. */
  const tooltip = buildTooltip('Codex', usage, thresholds, now)

  assert.match(tooltip, /<span style="background-color:var\(--vscode-editorHoverWidget-border\);border-radius:2px;">\u00a0{260}<\/span>/)
  assert.match(tooltip, /border-radius:2px;"><span style="background-color:var\(--vscode-editorError-foreground\);border-radius:2px;">\u00a0{260}<\/span><\/span>/)
})
