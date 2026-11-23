/**
 * Lint rule tests.
 * @file Check the repository's statement spacing and variable JSDoc rules against valid and invalid code.
 */

import { RuleTester } from 'eslint'
import { describe, it } from 'node:test'
import statementSpacing from '../../scripts/lint/statement-spacing.js'
import variableJsdoc from '../../scripts/lint/variable-jsdoc.js'

RuleTester.describe = describe
RuleTester.it = it
RuleTester.itOnly = it.only

/**
 * The tester, parsing modern ES modules.
 * @type {RuleTester}
 */
const tester = new RuleTester({ languageOptions: { ecmaVersion: 'latest', sourceType: 'module' } })

/**
 * Join source lines into code.
 * @param {...string} lines - The lines.
 * @returns {string} The code.
 */
const code = (...lines) => lines.join('\n')

tester.run('statement-spacing', statementSpacing, {
  valid: [
    // A blank line after a variable, before control flow, and after a block.
    code('function f(a) {', '  const b = a', '', '  if (b) {', '    g()', '  }', '', '  g()', '', '  return b', '}'),

    // Consecutive variable declarations stay together.
    code('function f() {', '  const a = 1', '  let b = 2', '', '  g(a, b)', '}'),

    // A block whose statements all fit on one line may have blank lines or not.
    code('function f(a) {', '  const b = a', '  if (!b) return', '  g(b)', '}'),
    code('function f(a) {', '  const b = a', '', '  if (!b) return', '', '  g(b)', '}'),

    // A const stays with the single-line statement that ends its block, even across lines.
    code('function f(a) {', '  g()', '', '  const b = [', '    a,', '    a,', '  ]', '  return b', '}'),

    // A JSDoc block's own rule handles the blank line before it.
    code('function f() {', '  g()', '  /** The value. */', '  const a = 1', '', '  g(a)', '}'),

    // A loop header's declaration isn't a statement in the list.
    code('function f(list) {', '  for (const item of list) g(item)', '', '  g()', '}'),
  ],
  invalid: [
    {
      code: code('function f(a) {', '  g(a)', '  const b = a', '  if (b) {', '    g()', '  }', '  g()', '}'),
      output: code('function f(a) {', '  g(a)', '  const b = a', '', '  if (b) {', '    g()', '  }', '', '  g()', '}'),
      errors: [{ messageId: 'always', line: 4 }, { messageId: 'always', line: 7 }],
    },
    {
      code: code('function f() {', '  const a = 1', '', '  const b = 2', '  g(a, b)', '', '  if (a) {', '    g()', '  }', '}'),
      output: code('function f() {', '  const a = 1', '  const b = 2', '', '  g(a, b)', '', '  if (a) {', '    g()', '  }', '}'),
      errors: [{ messageId: 'never', line: 4 }, { messageId: 'always', line: 5 }],
    },
    {
      code: code('function f(a) {', '  const b = a', '  const c = [', '    b,', '    b,', '  ]', '  g(c)', '  return c', '}'),
      output: code('function f(a) {', '  const b = a', '', '  const c = [', '    b,', '    b,', '  ]', '', '  g(c)', '', '  return c', '}'),
      errors: [{ messageId: 'always', line: 3 }, { messageId: 'always', line: 7 }, { messageId: 'always', line: 8 }],
    },
    {
      code: code('function f() {', '  g()', '  const a = g(', '    1,', '    2,', '  )', '', '  return a', '}'),
      output: code('function f() {', '  g()', '', '  const a = g(', '    1,', '    2,', '  )', '  return a', '}'),
      errors: [{ messageId: 'always', line: 3 }, { messageId: 'never', line: 8 }],
    },
    {
      code: code('export const a = 1', 'g(a)'),
      output: code('export const a = 1', '', 'g(a)'),
      errors: [{ messageId: 'always', line: 2 }],
    },
    {
      code: code('g(', '  1,', ')', '// Then again.', 'g(2)'),
      output: code('g(', '  1,', ')', '', '// Then again.', 'g(2)'),
      errors: [{ messageId: 'always', line: 5 }],
    },
  ],
})

tester.run('variable-jsdoc', variableJsdoc, {
  valid: [
    code('/** The answer. */', 'const a = 42'),
    code('/** The answer, and its double. */', 'const a = 42', 'const b = a * 2'),
    code('/** The answer. */', 'export const a = 42'),
    code('/** The title. */', '// eslint-disable-next-line no-control-regex -- Needed.', 'const a = /\\x00/'),
    code('function f(list) {', '  for (const item of list) g(item)', '}'),
    code('import a from "a"'),
  ],
  invalid: [
    { code: 'const a = 42', errors: [{ messageId: 'missing' }] },
    { code: code('/** The answer. */', 'const a = 42', '', 'const b = a * 2'), errors: [{ messageId: 'missing', line: 4 }] },
    { code: code('/** The answer. */', 'const a = 42', '// The double.', 'const b = a * 2'), errors: [{ messageId: 'missing', line: 4 }] },
    { code: code('function f() {', '  g()', '  let a = 1', '  return a', '}'), errors: [{ messageId: 'missing', line: 3 }] },
  ],
})
