/**
 * Value formatting tests.
 * @file Check how token counts are shortened.
 */

'use strict'

const assert = require('node:assert/strict')
const { test } = require('node:test')
const { formatTokens } = require('../../src/view/format')

test('formats token counts in thousands and millions', () => {
  assert.equal(formatTokens(48_300), '48.3k')
  assert.equal(formatTokens(1_000_000), '1m')
  assert.equal(formatTokens(null), '—')
})
