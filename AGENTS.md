# Repository instructions

## Changelog Rules

- Format `CHANGELOG.md` according to [Keep a Changelog 1.1.0](https://keepachangelog.com/en/1.1.0/). Keep an `Unreleased` section at the top, followed by releases in newest-first order with `## [version] - YYYY-MM-DD` headings. Group notable changes under the applicable `Added`, `Changed`, `Deprecated`, `Removed`, `Fixed`, and `Security` headings, omit empty groups, and link version headings when release URLs are available.

## Repository guidance

- Finish each task or feature by committing its completed changes.
- Run `npm run lint` and `npm test` before committing; `npx eslint --fix .` fixes most spacing problems.
- Match the existing commit message style and formatting; use a plain, sentence-case imperative subject without adding prefixes or changing the format.
- When relevant, document completed tasks or features in `CHANGELOG.md` and/or `README.md`.
- Do not add attribution to anything written to Git or GitHub: commit messages, tags, pull request titles and descriptions, issues, comments or release notes. That includes `Co-Authored-By` lines and any "Generated with Claude", "Generated with Claude Code" or similar text, links or emoji.
- Order `package.json` scripts in two groups: single-word commands first, then all other commands (such as colon-separated names). Sort each group alphabetically by script name.
- Keep the current task visible in interactive terminal output whenever a project script can run for more than one second without producing output. Use `createTerminalProgress` for JavaScript commands, update its message as the work changes, and stop it before final output and on every error or cancellation path. For redirected output, print plain stage messages without animation or terminal control sequences. Apply equivalent visible progress to shell commands and child processes during quiet work.

## JavaScript documentation

- Apply these requirements to every authored `.js` file, including scripts, configuration, tests, and grammar samples.
- Begin each file with a JSDoc header containing a descriptive title and an `@file` description on the immediately following line. Preserve a required shebang before the header.

  ```js
  /**
   * Theme build pipeline.
   * @file Assemble theme inputs, resolve colors, and generate theme artifacts.
   */
  ```

- Add JSDoc immediately before named declarations: functions, classes, constructors, methods, getters/setters, class fields, named function expressions and arrow-function bindings, and callable object properties. Include nested helpers and assigned callable members.
- Document every callable parameter with `@param`, including optional/defaulted parameters, rest parameters, and the properties used by destructured options. Describe return values and thrown errors when they clarify the contract; use accurate types where useful without guessing complex shapes.
- Give standalone `const`, `let`, and `var` declarations brief JSDoc descriptions, including local and destructured bindings. A short purpose statement is sufficient for variables; one block may cover a grouped declaration. Do not insert JSDoc inside loop headers or parameter lists, or duplicate declaration docs on import/export forwarding statements or anonymous inline callbacks.
- Preserve useful existing JSDoc, type annotations, and syntax-probe examples. Keep formatter/linter directives adjacent to the code they govern, placing declaration JSDoc before those directives when necessary.

## Code Spacing Rules

- Put a blank line before each JSDoc block, except at the start of a file.
- Separate a control-flow statement from the preceding statement at the same level with a blank line. This includes `if`, loops, `switch`, `try`, `return`, `throw`, `break`, and `continue`. Do not pad the start of a block or detach `else`, `catch`, `finally`, or `do...while` continuations.
- Put a blank line after a completed block, control-flow statement, or multiline expression statement when another statement follows at the same level. Keep function-call arguments and chained expressions together.
- Put a blank line after a standalone `let`, `const`, or `var` when the next statement is not another variable declaration. Keep consecutive variable declarations together; do not pad before closing syntax or inside loop headers.
- Put a blank line after every export declaration, including `export const`, before any following code or comment.
- Separate a `const` declaration spanning more than three source lines from neighboring statements with blank lines, including adjacent variable declarations.

Exceptions to these spacing rules:

- Keep a `const` and the single-line statement that immediately precedes its block’s closing syntax together, even when the `const` spans multiple lines. Retain any required blank line before the `const`.
- If every statement directly inside a code block fits on one source line, omit blank lines between them. Apply this separately to nested blocks. Keep comments attached to their code and preserve spacing before JSDoc blocks.

