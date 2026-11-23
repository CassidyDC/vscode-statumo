/**
 * Codex account.
 * @file Read whether Codex signs in with a ChatGPT subscription or an API key.
 */

import path from 'node:path'
import { createCachedJson } from '../../files/cached-json.js'

/**
 * How each `auth_mode` signs in.
 * @type {Record<string, 'subscription' | 'api'>}
 */
const accessModes = { chatgpt: 'subscription', apikey: 'api' }

/**
 * Read how Codex signs in from its auth file's `auth_mode` field: `chatgpt` or `apikey`. The
 * file also holds sign-in tokens, and only that field is kept.
 * @param {any} data - The auth file's parsed JSON.
 * @returns {'subscription' | 'api' | null} How Codex signs in, or null when the file doesn't say.
 */
function toAccess(data) {
  /** The file's sign-in mode. */
  const mode = data?.auth_mode
  return typeof mode === 'string' && Object.hasOwn(accessModes, mode) ? accessModes[mode] : null
}

/**
 * Create a reader of how Codex signs in, reusing the last reading while the auth file is unchanged.
 * @returns {(homeDirectory: string) => Promise<'subscription' | 'api' | null>} Reads the access from a Codex home folder.
 */
function createAccessReader() {
  /** The auth file's reader. */
  const reader = createCachedJson(toAccess)

  /**
   * Read how Codex signs in.
   * @param {string} homeDirectory - The Codex home folder.
   * @returns {Promise<'subscription' | 'api' | null>} How Codex signs in, or null when the file is missing or doesn't say.
   */
  async function readAccess(homeDirectory) {
    return (await reader.read(path.join(homeDirectory, 'auth.json')))?.value ?? null
  }

  return readAccess
}

export { createAccessReader }
