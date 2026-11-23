/**
 * ESLint configuration.
 * @file Check JavaScript against the recommended rules and the documentation and spacing rules in AGENTS.md.
 */

import js from '@eslint/js'
import jsdoc from 'eslint-plugin-jsdoc'
import globals from 'globals'
import statementSpacing from './scripts/lint/statement-spacing.js'
import variableJsdoc from './scripts/lint/variable-jsdoc.js'

/**
 * The repository's own rules.
 * @type {import('eslint').ESLint.Plugin}
 */
const statumo = { rules: { 'statement-spacing': statementSpacing, 'variable-jsdoc': variableJsdoc } }

export default [
  { ignores: ['node_modules/', '*.vsix'] },
  js.configs.recommended,
  {
    languageOptions: { ecmaVersion: 'latest', sourceType: 'module', globals: globals.node },
    linterOptions: { reportUnusedDisableDirectives: 'error' },
    plugins: { jsdoc, statumo },
    settings: { jsdoc: { mode: 'typescript' } },
    rules: {
      // Each file starts with a title and an `@file` description on the line after it.
      'jsdoc/require-file-overview': ['error', { tags: { file: { mustExist: true, preventDuplicates: true, initialCommentsOnly: true } } }],
      'jsdoc/tag-lines': ['error', 'never', { startLines: 0 }],

      // Named functions, classes, methods, class fields, and callable object properties carry JSDoc.
      'jsdoc/require-jsdoc': ['error', {
        require: {
          FunctionDeclaration: true,
          FunctionExpression: true,
          ArrowFunctionExpression: true,
          ClassDeclaration: true,
          ClassExpression: true,
          MethodDefinition: true,
        },
        contexts: ['PropertyDefinition'],
        checkConstructors: true,
        checkGetters: true,
        checkSetters: true,
        enableFixer: false,
      }],
      'statumo/variable-jsdoc': 'error',
      'jsdoc/require-description': ['error', { contexts: ['any'] }],

      // Every parameter, including destructured option properties, has a described `@param`.
      'jsdoc/require-param': ['error', { checkDestructured: true, checkDestructuredRoots: true, enableFixer: false }],
      'jsdoc/require-param-name': 'error',
      'jsdoc/require-param-description': 'error',
      'jsdoc/check-param-names': 'error',
      'jsdoc/check-tag-names': 'error',
      'jsdoc/valid-types': 'error',

      // Blank lines: before each JSDoc block, between statements as AGENTS.md describes, and never padding a block.
      'jsdoc/lines-before-block': ['error', { lines: 1, ignoreSingleLines: false, excludedTags: [], checkBlockStarts: false }],
      'statumo/statement-spacing': 'error',
      'padded-blocks': ['error', 'never'],
    },
  },
]
