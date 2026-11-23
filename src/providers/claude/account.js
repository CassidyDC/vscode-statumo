/**
 * Claude Code account.
 * @file Read the signed-in account's plan, whether it signs in with a subscription or an API key, and Claude Code's cached rate-limit usage from Claude Code's global config file.
 */

import os from 'node:os'
import path from 'node:path'
import { createCachedJson } from '../../files/cached-json.js'
import { dateOrNull, makeLimit } from '../../usage/model.js'

/**
 * The rate limits Claude Code cached the last time it fetched the account's usage.
 * @typedef {object} CachedUsage
 * @property {import('../../usage/model.js').Limits} limits - The 5-hour, 7-day, and 7-day Fable windows.
 * @property {Date} updatedAt - When Claude Code fetched them.
 */

/**
 * What Claude Code's global config file says of the signed-in account.
 * @typedef {object} ClaudeAccount
 * @property {string | null} plan - The account's plan, such as `Max 5x`.
 * @property {'subscription' | 'api' | null} access - Whether the account signs in with a subscription or an API key.
 * @property {CachedUsage | null} usage - The account's cached rate limits, or null when there are none for this account.
 */

/**
 * The account reading when the config file is missing or records no account.
 * @type {ClaudeAccount}
 */
const noAccount = Object.freeze({ plan: null, access: null, usage: null })

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
 * Read one window from the usage cache's per-window fields, such as `five_hour`, or else
 * from its list of limits, whose entries name the window in `kind`.
 * @param {any} utilization - The usage cache's `utilization` value.
 * @param {string | null} field - The window's field, such as `five_hour`, or null when it has none.
 * @param {(entry: any) => boolean} matches - Picks the window's entry in the list of limits.
 * @returns {import('../../usage/model.js').LimitReading | null} The window's reading, or null.
 */
function readCachedWindow(utilization, field, matches) {
  /** The window's own field. */
  const window = field ? utilization?.[field] : null

  /** The window's reading from its own field. */
  const fromField = makeLimit(window?.utilization, dateOrNull(window?.resets_at))

  if (fromField || !Array.isArray(utilization?.limits)) return fromField

  /** The window's entry in the list of limits. */
  const entry = utilization.limits.find(candidate => candidate && typeof candidate === 'object' && matches(candidate))
  return entry ? makeLimit(entry.percent, dateOrNull(entry.resets_at)) : null
}

/**
 * Whether a usage list entry is the weekly limit scoped to the Fable model.
 * @param {any} entry - The entry.
 * @returns {boolean} True for the weekly Fable limit.
 */
function isFableWeekly(entry) {
  /** The model the limit is scoped to. */
  const model = entry.scope?.model?.display_name
  return entry.kind === 'weekly_scoped' && typeof model === 'string' && model.trim().toLowerCase() === 'fable'
}

/**
 * Read the rate limits Claude Code cached from the account's usage, which it refreshes whenever it fetches
 * usage. A cache of a different account than the signed-in one is ignored.
 * @param {any} data - The config file's parsed JSON.
 * @returns {CachedUsage | null} The cached limits, or null when there are none for this account.
 */
function readCachedUsage(data) {
  /** The usage cache, the account it belongs to, and when Claude Code fetched it. */
  const cache = data?.cachedUsageUtilization
  const owner = cache?.accountUuid
  const updatedAt = dateOrNull(cache?.fetchedAtMs)

  if (!updatedAt || (typeof owner === 'string' && owner !== data?.oauthAccount?.accountUuid)) return null

  /** The cache's readings. */
  const utilization = cache.utilization

  /** The cached windows. */
  const limits = {
    fiveHour: readCachedWindow(utilization, 'five_hour', entry => entry.kind === 'session'),
    sevenDay: readCachedWindow(utilization, 'seven_day', entry => entry.kind === 'weekly_all'),
    sevenDayFable: readCachedWindow(utilization, null, isFableWeekly),
  }

  if (!limits.fiveHour && !limits.sevenDay && !limits.sevenDayFable) return null

  return { limits, updatedAt }
}

/**
 * Turn the config file's JSON into the account reading.
 * @param {any} data - The config file's parsed JSON.
 * @returns {ClaudeAccount} The account's plan, access, and cached rate limits.
 */
function toAccount(data) {
  return { plan: formatClaudePlan(data?.oauthAccount), access: readClaudeAccess(data), usage: readCachedUsage(data) }
}

/**
 * Create a reader of the signed-in account, reusing the last reading while the config file is unchanged.
 * @returns {(configDirectory: string) => Promise<ClaudeAccount>} Reads the account for a Claude config folder.
 */
function createAccountReader() {
  /** The config file's reader. */
  const reader = createCachedJson(toAccount)

  /**
   * Read the signed-in account's plan, how it signs in, and its cached rate limits.
   * @param {string} configDirectory - The Claude config folder.
   * @returns {Promise<ClaudeAccount>} The account's plan, access, and cached rate limits, each null when it isn't recorded.
   */
  async function readAccount(configDirectory) {
    return (await reader.read(globalConfigPath(configDirectory)))?.value ?? noAccount
  }

  return readAccount
}

export { createAccountReader }
