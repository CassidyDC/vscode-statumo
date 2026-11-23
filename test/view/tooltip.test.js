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

test('marks a window whose reset has passed as inactive', () => {
  /** Usage whose 5-hour window reset an hour ago. */
  const usage = makeUsage({
    limits: {
      fiveHour: { percentUsed: 90, resetsAt: new Date(2026, 10, 22, 9, 0) },
      sevenDay: { percentUsed: 39, resetsAt: new Date(2026, 10, 27, 9, 0) },
    },
  })
  assert.match(buildTooltip('Codex', usage, thresholds, now), /<b>5-hour limit<\/b><\/td><td align="right">.*>Inactive<.*<\/tr><tr><td colspan="2" height="3"><\/td><\/tr><tr><td colspan="2"><p>.*No reading since the reset/)
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
  assert.match(sections[1], /^<table width="100%"><tr><td colspan="2" height="8"><\/td><\/tr><tr><td><b>Context<\/b><\/td><td align="right">.*48\.3k \/ 400k tokens.*<\/td><\/tr><tr><td colspan="2"><h2>12% .*used.*<\/h2>(<small>){6}<span.*<\/td><\/tr><\/table>$/)
  assert.match(sections[2], /^<table width="100%"><tr><td colspan="2" height="8"><\/td><\/tr><tr><td><b>5-hour limit<\/b><\/td><td align="right">.*Resets Nov 22 at 14:30 \(4h 30m\).*<\/tr><tr><td colspan="2"><h2>16% .*used/)
  assert.match(sections[3], /Resets Nov 27 at 09:00 \(4d 23h\).*<\/tr><tr><td colspan="2"><h2>39% .*used/)
  assert.match(sections[4], /^<table><tr><td colspan="3" height="8"><\/td><\/tr><tr><td><span[^>]*>Chat<.*Folder<.*Plan<.*Limits Read<.*Last Activity<.*<\/table>$/)
  assert.equal(footerDetail(sections[4], 'Chat'), 'Fix [link](https://example.com) *now*')
  assert.equal(footerDetail(sections[4], 'Plan'), 'Plus subscription')
  assert.equal(footerDetail(sections[4], 'Folder'), '/work/project')
  assert.equal(footerDetail(sections[4], 'Last Activity'), '2m ago')
  assert.equal(footerDetail(sections[4], 'Limits Read'), '2m ago')
})

test('shows the last activity and when the limits were read in their own rows', () => {
  /** Usage whose limits were read over three hours ago, and its tooltip. */
  const usage = makeUsage({ limitsUpdatedAt: new Date(2026, 10, 22, 6, 45) })
  const tooltip = buildTooltip('Codex', usage, thresholds, now)

  assert.equal(footerDetail(tooltip, 'Last Activity'), '2m ago')
  assert.equal(footerDetail(tooltip, 'Limits Read'), '3h 15m ago')
})

test('names the plan with how the tool signs in', () => {
  /**
   * Read the Plan row's detail from a tooltip built with the given plan and access.
   * @param {string | null} plan - The account's plan.
   * @param {'subscription' | 'api' | null} access - How the tool signs in.
   * @returns {string | undefined} The Plan row's detail, or undefined when there is none.
   */
  const planLine = (plan, access) => footerDetail(buildTooltip('Codex', makeUsage({ plan, access }), thresholds, now), 'Plan')
  assert.equal(planLine('Plus', 'subscription'), 'Plus subscription')
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

  assert.match(tooltip, /<span style="background-color:var\(--vscode-editorHoverWidget-border\);border-radius:2px;"><span style="background-color:var\(--vscode-editorError-foreground\);border-radius:2px;">\u00a0{221}<\/span>\u00a0{12}<\/span>/)
  assert.match(tooltip, /<span style="background-color:var\(--vscode-button-background\);border-radius:2px;">\u00a0{91}<\/span>\u00a0{142}<\/span>/)
})

test('draws an empty bar as the track alone and a full bar as the fill alone', () => {
  /** Usage whose 5-hour window is unused and whose 7-day window is used up. */
  const usage = makeUsage({
    limits: {
      fiveHour: { percentUsed: 0, resetsAt: new Date(2026, 10, 22, 14, 30) },
      sevenDay: { percentUsed: 100, resetsAt: new Date(2026, 10, 27, 9, 0) },
    },
  })

  /** The usage's tooltip. */
  const tooltip = buildTooltip('Codex', usage, thresholds, now)

  assert.match(tooltip, /<span style="background-color:var\(--vscode-editorHoverWidget-border\);border-radius:2px;">\u00a0{233}<\/span>/)
  assert.match(tooltip, /border-radius:2px;"><span style="background-color:var\(--vscode-editorError-foreground\);border-radius:2px;">\u00a0{233}<\/span><\/span>/)
})
