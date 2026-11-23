/**
 * Status bar item content tests.
 * @file Check an item's text, warning level, and screen reader label.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildItemView } from '../../src/view/item-view.js'

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

test('starts the text with the tool name and reads each part aloud', () => {
  /** The item's content for a session and a low 5-hour window. */
  const view = buildItemView({ label: 'Claude', name: 'Claude Code' }, {
    session: { title: null, cwd: '/work/project', context: { tokens: 48_300, window: 400_000, percent: 12 }, updatedAt: now },
    limits: { fiveHour: { percentUsed: 80, resetsAt: null }, sevenDay: null },
    limitsUpdatedAt: now,
    plan: null,
    access: null,
  }, thresholds, now)

  assert.equal(view.text, 'Claude $(statumo-cx-10) 12% $(statumo-5h-80) 80% $(statumo-7d-0)')
  assert.equal(view.level, 'warning')
  assert.equal(view.label, 'Claude Code context 12% used, 5-hour limit 80% used, weekly limit not reported yet')
  assert.match(view.tooltip, /^<table><tr><td><h2>Claude Code - Statumo<\/h2>/)
})

test('reads a workspace with no session as no context yet', () => {
  /** The item's content with no session or limits. */
  const view = buildItemView({ label: 'Codex', name: 'Codex' }, {
    session: null,
    limits: { fiveHour: null, sevenDay: null },
    limitsUpdatedAt: null,
    plan: null,
    access: null,
  }, thresholds, now)

  assert.equal(view.level, null)
  assert.equal(view.label, 'Codex no context yet, 5-hour limit not reported yet, weekly limit not reported yet')
})

test('adds the Fable limit to the text and label, and warns when it runs low', () => {
  /** The item's content with a nearly used-up Fable limit. */
  const view = buildItemView({ label: 'Claude', name: 'Claude Code' }, {
    session: null,
    limits: { fiveHour: { percentUsed: 10, resetsAt: null }, sevenDay: { percentUsed: 20, resetsAt: null }, sevenDayFable: { percentUsed: 92, resetsAt: null } },
    limitsUpdatedAt: now,
    fableUpdatedAt: now,
    plan: null,
    access: null,
  }, thresholds, now)

  assert.equal(view.text, 'Claude $(statumo-cx-0) $(statumo-5h-10) 10% $(statumo-7d-20) 20% $(statumo-fb-90) 92%')
  assert.equal(view.level, 'error')
  assert.equal(view.label, 'Claude Code no context yet, 5-hour limit 10% used, weekly limit 20% used, weekly Fable limit 92% used')
})
