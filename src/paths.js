/**
 * Path helpers.
 * @file Expand home-relative settings and decide whether a session folder belongs to the open workspace.
 */

'use strict'

const os = require('node:os')
const path = require('node:path')

/**
 * Whether the platform's default file system ignores letter case.
 * @type {boolean}
 */
const isCaseInsensitive = process.platform === 'darwin' || process.platform === 'win32'

/**
 * Expand a leading `~` to the current user's home folder.
 * @param {string} value - A path that may start with `~`.
 * @returns {string} The expanded path.
 */
function expandHome(value) {
  if (value === '~') return os.homedir()
  if (value.startsWith('~/') || value.startsWith('~\\')) return path.join(os.homedir(), value.slice(2))
  return value
}

/**
 * Resolve a path and fold its case where the file system ignores case.
 * @param {string} value - The path to normalize.
 * @returns {string} The comparable path.
 */
function normalize(value) {
  const resolved = path.resolve(value)

  return isCaseInsensitive ? resolved.toLowerCase() : resolved
}

/**
 * Whether `child` is `parent` or sits somewhere beneath it.
 * @param {string} child - A normalized path.
 * @param {string} parent - A normalized folder path.
 * @returns {boolean} True when `child` is inside `parent`.
 */
function isInside(child, parent) {
  const relative = path.relative(parent, child)

  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))
}

/**
 * Whether a session's working folder is one of the workspace folders or inside one.
 * @param {string | null | undefined} cwd - The session's working folder.
 * @param {readonly string[]} folders - The workspace folders' file system paths.
 * @returns {boolean} True when the session belongs to the workspace.
 */
function isInWorkspace(cwd, folders) {
  if (!cwd) return false

  const session = normalize(cwd)

  return folders.some(folder => isInside(session, normalize(folder)))
}

module.exports = { expandHome, isInWorkspace }
