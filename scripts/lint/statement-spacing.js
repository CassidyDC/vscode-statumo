/**
 * Statement spacing rule.
 * @file Require or forbid blank lines between statements as the repository's code spacing rules describe.
 */

/**
 * Statement types that change control flow, which a blank line separates from what precedes them.
 * @type {Set<string>}
 */
const controlFlowTypes = new Set([
  'IfStatement',
  'ForStatement',
  'ForInStatement',
  'ForOfStatement',
  'WhileStatement',
  'DoWhileStatement',
  'SwitchStatement',
  'TryStatement',
  'ReturnStatement',
  'ThrowStatement',
  'BreakStatement',
  'ContinueStatement',
])

/**
 * Statement types that end with a block, which a blank line separates from what follows them.
 * @type {Set<string>}
 */
const blockTypes = new Set([...controlFlowTypes, 'BlockStatement', 'FunctionDeclaration', 'ClassDeclaration', 'LabeledStatement'])

/**
 * Whether a node fits on one source line.
 * @param {import('estree').Node} node - The node.
 * @returns {boolean} True when it starts and ends on the same line.
 */
function isSingleLine(node) {
  return node.loc.start.line === node.loc.end.line
}

/**
 * Whether a statement is a `const` declaration spanning more than three source lines.
 * @param {import('estree').Node} node - The statement.
 * @returns {boolean} True for a long `const`.
 */
function isLongConst(node) {
  return node.type === 'VariableDeclaration' && node.kind === 'const' && node.loc.end.line - node.loc.start.line + 1 > 3
}

/**
 * Whether a statement is an `export` declaration.
 * @param {import('estree').Node} node - The statement.
 * @returns {boolean} True for an export.
 */
function isExport(node) {
  return node.type === 'ExportNamedDeclaration' || node.type === 'ExportDefaultDeclaration' || node.type === 'ExportAllDeclaration'
}

/**
 * Whether a statement declares variables, directly or through `export`.
 * @param {import('estree').Node} node - The statement.
 * @returns {boolean} True for a `let`, `const`, or `var` declaration.
 */
function isVariable(node) {
  return node.type === 'VariableDeclaration' || (node.type === 'ExportNamedDeclaration' && node.declaration?.type === 'VariableDeclaration')
}

/**
 * Decide whether two neighboring statements must have a blank line between them.
 *
 * In a block whose statements all fit on one line, AGENTS.md omits blank lines, but tests use them
 * to separate setup from checks, so the linter leaves those blocks to the author.
 * @param {import('estree').Node} prev - The earlier statement.
 * @param {import('estree').Node} next - The later statement.
 * @param {object} list - Where the statements sit.
 * @param {boolean} list.isCompact - Whether every statement in their block fits on one line.
 * @param {boolean} list.isLast - Whether `next` is the block's last statement.
 * @returns {'always' | 'never' | null} Whether a blank line is required, forbidden, or left to the author.
 */
function expectedSpacing(prev, next, { isCompact, isLast }) {
  if (isCompact) return null
  if (prev.type === 'VariableDeclaration' && prev.kind === 'const' && isLast && isSingleLine(next)) return 'never'
  if (controlFlowTypes.has(next.type)) return 'always'
  if (isLongConst(prev) || isLongConst(next)) return 'always'
  if (blockTypes.has(prev.type) || (prev.type === 'ExpressionStatement' && !isSingleLine(prev))) return 'always'
  if (isExport(prev)) return 'always'
  if (isVariable(prev)) return isVariable(next) ? 'never' : 'always'
  return null
}

/**
 * Messages, by id.
 * @type {Record<string, string>}
 */
const messages = {
  always: 'Expected a blank line before this statement.',
  never: 'Unexpected blank line before this statement.',
}

export default {
  meta: {
    type: 'layout',
    fixable: 'whitespace',
    schema: [],
    messages,
    docs: { description: 'Require or forbid blank lines between statements as AGENTS.md describes.' },
  },

  /**
   * Check the spacing between each pair of neighboring statements.
   * @param {import('eslint').Rule.RuleContext} context - The rule's context.
   * @returns {import('eslint').Rule.RuleListener} The rule's listeners.
   */
  create(context) {
    /** The file's source. */
    const { sourceCode } = context

    /**
     * Whether a line holds only whitespace.
     * @param {number} line - The 1-based line number.
     * @returns {boolean} True for a blank line.
     */
    const isBlankLine = line => sourceCode.lines[line - 1].trim() === ''

    /**
     * Check one list of statements.
     * @param {import('estree').Node[]} body - The statements.
     * @param {boolean} canBeCompact - Whether the list is a block, where all single-line statements sit together.
     * @returns {void}
     */
    function checkList(body, canBeCompact) {
      /** Whether every statement fits on one line. */
      const isCompact = canBeCompact && body.length > 1 && body.every(isSingleLine)

      for (let index = 1; index < body.length; index += 1) {
        /** The neighboring statements, and the comments that lead the later one from a line of their own. */
        const prev = body[index - 1]
        const next = body[index]
        const leading = sourceCode.getCommentsBefore(next).filter(comment => comment.loc.start.line > prev.loc.end.line)

        // A JSDoc block's own rule requires the blank line before it.
        if (leading.some(comment => comment.type === 'Block' && comment.value.startsWith('*'))) continue

        /** The first line of the later statement or its leading comments, and whether a blank line comes before it. */
        const topLine = (leading[0] ?? next).loc.start.line
        const lines = Array.from({ length: Math.max(0, topLine - prev.loc.end.line - 1) }, (_, offset) => prev.loc.end.line + 1 + offset)
        const hasBlank = lines.some(isBlankLine)
        const expected = expectedSpacing(prev, next, { isCompact, isLast: index === body.length - 1 })

        if (expected === 'always' && !hasBlank) {
          /** Where the later statement's first line starts. */
          const lineStart = sourceCode.getIndexFromLoc({ line: topLine, column: 0 })

          context.report({
            node: next,
            messageId: 'always',

            /**
             * Insert a blank line before the later statement.
             * @param {import('eslint').Rule.RuleFixer} fixer - The fixer.
             * @returns {import('eslint').Rule.Fix} The fix.
             */
            fix: fixer => fixer.insertTextBeforeRange([lineStart, lineStart], '\n'),
          })
        }

        if (expected === 'never' && hasBlank) {
          /** The span of blank lines between the statements. */
          const range = [
            sourceCode.getIndexFromLoc({ line: prev.loc.end.line + 1, column: 0 }),
            sourceCode.getIndexFromLoc({ line: topLine, column: 0 }),
          ]

          context.report({
            node: next,
            messageId: 'never',

            /**
             * Remove the blank lines before the later statement.
             * @param {import('eslint').Rule.RuleFixer} fixer - The fixer.
             * @returns {import('eslint').Rule.Fix} The fix.
             */
            fix: fixer => fixer.removeRange(range),
          })
        }
      }
    }

    return {
      /**
       * Check a file's top-level statements.
       * @param {import('estree').Program} node - The file.
       * @returns {void}
       */
      Program: node => checkList(node.body, false),

      /**
       * Check a block's statements.
       * @param {import('estree').BlockStatement | import('estree').StaticBlock} node - The block.
       * @returns {void}
       */
      'BlockStatement, StaticBlock': node => checkList(node.body, true),

      /**
       * Check a switch case's statements.
       * @param {import('estree').SwitchCase} node - The case.
       * @returns {void}
       */
      SwitchCase: node => checkList(node.consequent, true),
    }
  },
}
