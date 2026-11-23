/**
 * Variable JSDoc rule.
 * @file Require a JSDoc block before each standalone variable declaration, letting one block cover a group of adjacent declarations.
 */

/**
 * Whether a statement declares variables, directly or through `export`.
 * @param {import('estree').Node | undefined} node - The statement.
 * @returns {boolean} True for a `let`, `const`, or `var` declaration.
 */
function isVariable(node) {
  return node?.type === 'VariableDeclaration' || (node?.type === 'ExportNamedDeclaration' && node.declaration?.type === 'VariableDeclaration')
}

export default {
  meta: {
    type: 'suggestion',
    schema: [],
    messages: { missing: 'Expected a JSDoc block before this declaration, or for it to follow a documented declaration on the line above.' },
    docs: { description: 'Require JSDoc for standalone variable declarations as AGENTS.md describes.' },
  },

  /**
   * Check each variable declaration that sits in a list of statements.
   * @param {import('eslint').Rule.RuleContext} context - The rule's context.
   * @returns {import('eslint').Rule.RuleListener} The rule's listeners.
   */
  create(context) {
    /** The file's source. */
    const { sourceCode } = context

    /**
     * Whether a JSDoc block comes right before a statement, past any lint directives under it.
     * @param {import('estree').Node} node - The statement.
     * @returns {boolean} True when the statement has its own JSDoc block.
     */
    function hasJsdoc(node) {
      /** The comments before the statement, nearest last. */
      const comments = sourceCode.getCommentsBefore(node)

      for (let index = comments.length - 1; index >= 0; index -= 1) {
        /** The comment being checked. */
        const comment = comments[index]

        if (comment.type === 'Block' && comment.value.startsWith('*')) return true
        if (!/^\s*eslint-/.test(comment.value)) return false
      }

      return false
    }

    /**
     * Whether a declaration directly follows another declaration on the line above, so the group shares one JSDoc block.
     * @param {import('estree').Node} node - The declaration statement.
     * @param {import('estree').Node[]} body - The statements it sits among.
     * @returns {boolean} True when it continues a group.
     */
    function continuesGroup(node, body) {
      /** The statement before it. */
      const prev = body[body.indexOf(node) - 1]
      return isVariable(prev) && !sourceCode.getCommentsBefore(node).length && node.loc.start.line === prev.loc.end.line + 1
    }

    return {
      /**
       * Report a declaration in a list of statements that has no JSDoc block and continues no group.
       * Declarations in loop headers sit outside any list and are skipped.
       * @param {import('estree').VariableDeclaration} node - The declaration.
       * @returns {void}
       */
      VariableDeclaration: node => {
        /** The statement that holds the declaration, and the statements around it. */
        const statement = node.parent.type === 'ExportNamedDeclaration' ? node.parent : node
        const container = statement.parent
        const body = container.type === 'SwitchCase' ? container.consequent : container.body

        if (!Array.isArray(body) || hasJsdoc(statement) || continuesGroup(statement, body)) return

        context.report({ node: statement, messageId: 'missing' })
      },
    }
  },
}
