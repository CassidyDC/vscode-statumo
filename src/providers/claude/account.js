/**
 * Claude Code account.
 * @file Read the signed-in account's plan, and whether it signs in with a subscription or an API key, from Claude Code's global config file.
 */

import os from 'node:os'
import path from 'node:path'
import { createCachedJson } from '../../files/cached-json.js'

/**
 * What Claude Code's global config file says of the signed-in account.
 * @typedef {object} ClaudeAccount
 * @property {string | null} plan - The account's plan, such as `Max 5x`.
 * @property {'subscription' | 'api' | null} access - Whether the account signs in with a subscription or an API key.
 */

/**
 * The account reading when the config file is missing or records no account.
 * @type {ClaudeAccount}
 */
const noAccount = Object.freeze({ plan: null, access: null })

/**
 * Find Claude Code's global config file, which records the signed-in account.
 *
 * Claude Code keeps it in the home folder beside the default `~/.claude` config
 * folder, and inside the config folder when `CLAUDE_CONFIG_DIR` moves it.
 * @param {string} configDirectory - The Claude config folder.
 * @returns {string} The config file's path.
 */
function globalConfigPath(configDirectory) {
  /** Whether the config folder is the default one. */
  const isDefault = path.resolve(configDirectory) === path.join(os.homedir(), '.claude')
  return path.join(isDefault ? os.homedir() : configDirectory, '.claude.json')
}

/**
 * Name the account's plan from the config file's account fields, such as `Max 5x`
 * for the `claude_max` organization type with a `default_claude_max_5x` rate-limit tier.
 * @param {any} account - The config file's `oauthAccount` value.
 * @returns {string | null} The plan's name, or null when the account has none.
 */
function formatClaudePlan(account) {
  /** The account's organization type. */
  const type = account?.organizationType

  if (typeof type !== 'string' || !type.trim()) return null

  /** The type's words, capitalized. */
  const name = type
    .replace(/^claude_/, '')
    .split('_')
    .filter(Boolean)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')

  /** The rate-limit tier, and the multiplier at its end. */
  const tier = typeof account.organizationRateLimitTier === 'string' ? account.organizationRateLimitTier : ''
  const multiplier = /_(\d+x)$/.exec(tier)?.[1]
  return multiplier ? `${name} ${multiplier}` : name
}

/**
 * Tell from the config file whether the account signs in with a subscription or an API key:
 * a subscription billing type, such as `stripe_subscription`, or else a saved API key.
 * An `ANTHROPIC_API_KEY` in Claude Code's own environment takes precedence over both, and Statumo can't see it.
 * @param {any} data - The config file's parsed JSON.
 * @returns {'subscription' | 'api' | null} How the account signs in, or null when the file doesn't say.
 */
function readClaudeAccess(data) {
  /** The account's billing type. */
  const billing = data?.oauthAccount?.billingType
  if (typeof billing === 'string' && billing.includes('subscription')) return 'subscription'
  if (typeof data?.primaryApiKey === 'string' && data.primaryApiKey) return 'api'
  return null
}

/**
 * Turn the config file's JSON into the account reading.
 * @param {any} data - The config file's parsed JSON.
 * @returns {ClaudeAccount} The account's plan and access.
 */
function toAccount(data) {
  return { plan: formatClaudePlan(data?.oauthAccount), access: readClaudeAccess(data) }
}

/**
 * Create a reader of the signed-in account, reusing the last reading while the config file is unchanged.
 * @returns {(configDirectory: string) => Promise<ClaudeAccount>} Reads the account for a Claude config folder.
 */
function createAccountReader() {
  /** The config file's reader. */
  const reader = createCachedJson(toAccount)

  /**
   * Read the signed-in account's plan and how it signs in.
   * @param {string} configDirectory - The Claude config folder.
   * @returns {Promise<ClaudeAccount>} The account's plan and access, each null when it isn't recorded.
   */
  async function readAccount(configDirectory) {
    return (await reader.read(globalConfigPath(configDirectory)))?.value ?? noAccount
  }

  return readAccount
}

export { createAccountReader }
