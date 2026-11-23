/**
 * Progress ring tests.
 * @file Check how percents round to ring steps and name their icons.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { ringIcon, ringKinds, ringStep, symbolIconId } from '../../src/view/rings.js'

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
  assert.equal(ringIcon('fb', 61), '$(statumo-fb-60)')
})

test('names each symbol icon with letters and hyphens only, so hovers keep its class', () => {
  assert.equal(symbolIconId('5h'), 'statumo-five-hour-symbol')

  for (const { kind } of ringKinds) assert.match(symbolIconId(kind), /^[a-z-]+$/)
})
