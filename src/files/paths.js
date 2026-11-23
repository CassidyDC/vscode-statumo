/**
 * Path helpers.
 * @file Resolve folder settings, decide whether a session folder belongs to the open workspace, and shorten paths for display.
 */

import os from 'node:os'
import path from 'node:path'

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
 * Resolve a folder setting, falling back to an environment variable and then a folder in the home folder.
 * @param {string | undefined} value - The setting's value.
 * @param {string | undefined} environment - The environment variable's value.
 * @param {string} fallback - The folder's name under the home folder.
 * @returns {string} The folder's absolute path.
 */
function resolveFolder(value, environment, fallback) {
  /** The first folder given. */
  const chosen = value?.trim() || environment?.trim() || path.join(os.homedir(), fallback)
  return path.resolve(expandHome(chosen))
}

/**
 * Resolve a path and fold its case where the file system ignores case.
 * @param {string} value - The path to normalize.
 * @returns {string} The comparable path.
 */
function normalize(value) {
  /** The absolute path. */
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
  /** The way from `parent` to `child`. */
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

  /** The session's comparable folder. */
  const session = normalize(cwd)
  return folders.some(folder => isInside(session, normalize(folder)))
}

/**
 * Shorten a path under the home folder to start with `~`.
 * @param {string} value - The path to shorten.
 * @returns {string} The shortened path.
 */
function tildify(value) {
  /** The current user's home folder. */
  const home = os.homedir()
  return value === home || value.startsWith(`${home}/`) ? `~${value.slice(home.length)}` : value
}

/**
 * Shorten a long path in the middle, keeping its first folder and as many trailing folders as fit.
 * @param {string} value - The path to shorten.
 * @param {number} [maxLength] - The longest the result may be.
 * @returns {string} The path, such as `~/…/Packages/Repos/_statumo`.
 */
function truncatePath(value, maxLength = 40) {
  if (value.length <= maxLength) return value

  /** The path's folders, the first folder kept whole, and the trailing folders that fit. */
  const parts = value.split('/')
  const head = parts[0] === '' ? `/${parts[1]}` : parts[0]
  const tail = []

  for (let index = parts.length - 1; index > (parts[0] === '' ? 1 : 0); index--) {
    /** The trailing folders with this one added. */
    const candidate = [parts[index], ...tail].join('/')

    if (`${head}/…/${candidate}`.length > maxLength) break

    tail.unshift(parts[index])
  }

  if (tail.length) return `${head}/…/${tail.join('/')}`

  return `…${value.slice(-(maxLength - 1))}`
}

export { expandHome, isInWorkspace, resolveFolder, tildify, truncatePath }
