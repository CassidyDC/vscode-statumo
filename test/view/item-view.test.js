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
  assert.equal(view.label, 'Claude Code context 12% used, 5-hour limit 80% used, 7-day limit not current')
  assert.match(view.tooltip, /^<table><tr><td>Claude Code - Statumo<\/td>/)
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
  assert.equal(view.label, 'Codex no context yet, 5-hour limit not current, 7-day limit not current')
})
