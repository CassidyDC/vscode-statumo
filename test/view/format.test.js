/**
 * Value formatting tests.
 * @file Check how token counts are shortened.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { formatTokens } from '../../src/view/format.js'

test('formats token counts in thousands and millions', () => {
  assert.equal(formatTokens(48_300), '48.3k')
  assert.equal(formatTokens(1_000_000), '1m')
  assert.equal(formatTokens(null), '—')
})
