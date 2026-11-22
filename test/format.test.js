/**
 * Status text formatting tests.
 * @file Check the status bar segments, progress rings, per-window warning levels, staleness, and tooltips.
 */

'use strict'

const assert = require('node:assert/strict')
const { test } = require('node:test')
const { buildSegments, buildTooltip, formatTokens, getToolLevel, getWindowLevel } = require('../src/format')
const { ringIcon, ringStep } = require('../src/rings')

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
 * @returns {import('../src/usage').ToolUsage} The usage.
 */
function makeUsage(overrides = {}) {
  return {
    session: {
      title: 'Refactor parser',
      cwd: '/work/project',
      context: { tokens: 48_300, window: 400_000, percent: 12 },
      updatedAt: new Date(2026, 10, 22, 9, 58),
      isEnded: false,
    },
    limits: {
      fiveHour: { percentUsed: 16, resetsAt: new Date(2026, 10, 22, 14, 30) },
      sevenDay: { percentUsed: 39, resetsAt: new Date(2026, 10, 27, 9, 0) },
    },
    limitsUpdatedAt: new Date(2026, 10, 22, 9, 58),
    plan: null,
    ...overrides,
  }
}

/**
 * Reduce segments to their visible text.
 * @param {ReturnType<typeof buildSegments>} segments - The segments.
 * @returns {string[]} The texts, left to right.
 */
function texts(segments) {
  return [segments.context.text, ...segments.windows.map(window => window.text)]
}

test('builds segments with context and limits used', () => {
  assert.deepEqual(texts(buildSegments(makeUsage(), now)), ['$(statumo-cx-10) 12%', '$(statumo-5h-15) 16%', '$(statumo-7d-40) 39%'])
})

test('shows only an empty context ring when the workspace has no session', () => {
  assert.deepEqual(buildSegments(makeUsage({ session: null }), now).context, { text: '$(statumo-cx-0)', value: null })
})

test('rounds rings to the nearest step, keeping partial values off empty and full', () => {
  assert.equal(ringStep(null), 0)
  assert.equal(ringStep(0), 0)
  assert.equal(ringStep(1), 5)
  assert.equal(ringStep(42), 40)
  assert.equal(ringStep(43), 45)
  assert.equal(ringStep(99), 95)
  assert.equal(ringStep(100), 100)
  assert.equal(ringStep(130), 100)
  assert.equal(ringIcon('7d', 61), '$(statumo-7d-60)')
})

test('empties the ring of a window whose reset has passed', () => {
  const usage = makeUsage({
    limits: {
      fiveHour: { percentUsed: 90, resetsAt: new Date(2026, 10, 22, 9, 0) },
      sevenDay: { percentUsed: 39, resetsAt: new Date(2026, 10, 27, 9, 0) },
    },
  })
  const segments = buildSegments(usage, now)

  assert.deepEqual(texts(segments), ['$(statumo-cx-10) 12%', '$(statumo-5h-0)', '$(statumo-7d-40) 39%'])
  assert.match(buildTooltip('Codex', usage, thresholds, now), /5-hour limit<\/b><\/small><\/small>&nbsp;&nbsp;.*Reset Nov 22 at 09:00<.*\s+.*No reading since the reset/)
  assert.equal(segments.windows[0].value, null)
  assert.equal(segments.windows[0].isStale, true)
  assert.equal(getWindowLevel(usage.limits.fiveHour, { warningThreshold: 25, errorThreshold: 10 }, now), null)
})

test('warns and errors per window', () => {
  const thresholds = { warningThreshold: 25, errorThreshold: 10 }

  /**
   * Build a current reading at a given percent used.
   * @param {number} percentUsed - Percent of the window used.
   * @returns {import('../src/usage').LimitReading} The reading.
   */
  const limit = percentUsed => ({ percentUsed, resetsAt: null })

  assert.equal(getWindowLevel(limit(50), thresholds, now), null)
  assert.equal(getWindowLevel(limit(75), thresholds, now), 'warning')
  assert.equal(getWindowLevel(limit(95), thresholds, now), 'error')
  assert.equal(getWindowLevel(null, thresholds, now), null)
  assert.equal(getToolLevel({ fiveHour: limit(95), sevenDay: limit(80) }, thresholds, now), 'error')
  assert.equal(getToolLevel({ fiveHour: limit(10), sevenDay: limit(80) }, thresholds, now), 'warning')
  assert.equal(getToolLevel({ fiveHour: null, sevenDay: limit(10) }, thresholds, now), null)
})

test('formats token counts in thousands and millions', () => {
  assert.equal(formatTokens(48_300), '48.3k')
  assert.equal(formatTokens(1_000_000), '1m')
  assert.equal(formatTokens(null), '—')
})

test('lays out each tooltip section as label and note, bold amount, then bar', () => {
  const usage = makeUsage({ plan: 'Plus' })

  usage.session.title = 'Fix [link](https://example.com) *now*'

  const tooltip = buildTooltip('Codex', usage, thresholds, now)
  const sections = tooltip.split('\n\n---\n\n')

  assert.equal(sections.length, 5)
  assert.equal(sections[0], '#### Codex \\- Statumo')
  assert.match(sections[1], /^<small><small><b>Context<\/b><\/small><\/small>&nbsp;&nbsp;.*48\\\.3k \/ 400k tokens.*\s+\*\*12%\*\* .*used.*\s+<span/)
  assert.match(sections[2], /^<small><small><b>5-hour limit<\/b><\/small><\/small>&nbsp;&nbsp;.*Resets Nov 22 at 14:30 \\\(4h 30m\\\).*\s+\*\*16%\*\* .*used/)
  assert.match(sections[3], /Resets Nov 27 at 09:00 \\\(4d 23h\\\).*\s+\*\*39%\*\* .*used/)
  assert.match(sections[4], /Plan: Plus.*\s+.*Chat Title: Fix \\\[link\\\]\\\(https:\/\/example\\\.com\\\) \\\*now\\\*.*\s+.*Session: \/work\/project.*\s+.*Updated: 2m ago/)
})

test('splits the updated line when the session and limits were read at different times', () => {
  const usage = makeUsage({ limitsUpdatedAt: new Date(2026, 10, 22, 6, 45) })
  const footer = buildTooltip('Codex', usage, thresholds, now).split('\n\n---\n\n').at(-1)

  assert.match(footer, /Session Updated: 2m ago.*\s+.*Limits Read: 3h 15m ago/)
})

test('escapes HTML in session titles so only the progress bars are HTML', () => {
  const usage = makeUsage()

  usage.session.title = '<img src=x onerror=alert(1)>'

  assert.doesNotMatch(buildTooltip('Codex', usage, thresholds, now), /(?<!\\)<img/)
})

test('draws progress bars from theme colors, coloring low windows', () => {
  const usage = makeUsage({
    limits: {
      fiveHour: { percentUsed: 95, resetsAt: new Date(2026, 10, 22, 14, 30) },
      sevenDay: { percentUsed: 39, resetsAt: new Date(2026, 10, 27, 9, 0) },
    },
  })
  const tooltip = buildTooltip('Codex', usage, thresholds, now)

  assert.match(tooltip, /<span style="color:var\(--vscode-editorError-foreground\);">▂{19}<\/span><span style="color:var\(--vscode-scrollbarSlider-background\);">▂</)
  assert.match(tooltip, /<span style="color:var\(--vscode-progressBar-background\);">▂{8}<\/span>/)
})
