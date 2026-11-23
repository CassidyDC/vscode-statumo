/**
 * Claude Code usage reader.
 * @file Read the session files the Usage mod for Claude Code writes, and pick this workspace's session and the latest limits.
 */

'use strict'

const fs = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')
const { listNames, parseJson, statFile } = require('./files')
const { isInWorkspace } = require('./paths')
const { dateOrNull, emptyLimits, finiteOrNull, hasLimits, makeLimit } = require('./usage')

/**
 * The session file format version this reader understands.
 * @type {number}
 */
const formatVersion = 1

/**
 * A parsed session file.
 * @typedef {object} ClaudeRecord
 * @property {string | null} title - The session's title.
 * @property {string | null} cwd - The session's project root.
 * @property {import('./usage').ContextReading} context - The session's context use.
 * @property {import('./usage').Limits} limits - The limits the session last saw.
 * @property {Date} updatedAt - When the mod last wrote the file.
 * @property {boolean} isEnded - Whether the session has ended.
 */

/**
 * Parsed session files by path, kept until the file changes.
 * @type {Map<string, { mtimeMs: number, size: number, record: ClaudeRecord | null }>}
 */
const recordCache = new Map()

/**
 * What Claude Code's global config file says of the signed-in account.
 * @typedef {object} ClaudeAccount
 * @property {string | null} plan - The account's plan, such as `Max 5x`.
 * @property {'subscription' | 'api' | null} access - Whether the account signs in with a subscription or an API key.
 */

/**
 * The account last read from Claude Code's global config file, kept until the file changes.
 * @type {{ filePath: string, mtimeMs: number, size: number, account: ClaudeAccount } | undefined}
 */
let accountCache

/**
 * The account reading when the config file is missing or records no account.
 * @type {ClaudeAccount}
 */
const noAccount = { plan: null, access: null }

/**
 * Find Claude Code's global config file, which records the signed-in account.
 *
 * Claude Code keeps it in the home folder beside the default `~/.claude` config
 * folder, and inside the config folder when `CLAUDE_CONFIG_DIR` moves it.
 * @param {string} configDirectory - The Claude config folder.
 * @returns {string} The config file's path.
 */
function globalConfigPath(configDirectory) {
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
  const type = account?.organizationType

  if (typeof type !== 'string' || !type.trim()) return null

  const name = type
    .replace(/^claude_/, '')
    .split('_')
    .filter(Boolean)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')

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
  const billing = data?.oauthAccount?.billingType

  if (typeof billing === 'string' && billing.includes('subscription')) return 'subscription'
  if (typeof data?.primaryApiKey === 'string' && data.primaryApiKey) return 'api'
  return null
}

/**
 * Read the signed-in account's plan and how it signs in from Claude Code's global config file,
 * reusing the last reading while the file is unchanged.
 * @param {string} configDirectory - The Claude config folder.
 * @returns {Promise<ClaudeAccount>} The account's plan and access, each null when it isn't recorded.
 */
async function readClaudeAccount(configDirectory) {
  const filePath = globalConfigPath(configDirectory)
  const stats = await statFile(filePath)

  if (!stats) return noAccount

  const cached = accountCache?.filePath === filePath ? accountCache : undefined

  if (cached?.mtimeMs === stats.mtimeMs && cached.size === stats.size) return cached.account

  const text = await fs.readFile(filePath, 'utf8').catch(() => undefined)
  const data = text === undefined ? undefined : parseJson(text)

  // A file caught mid-write fails to parse; keep the last reading until it settles.
  if (data === undefined) return cached?.account ?? noAccount

  const account = { plan: formatClaudePlan(data?.oauthAccount), access: readClaudeAccess(data) }

  accountCache = { filePath, mtimeMs: stats.mtimeMs, size: stats.size, account }

  return account
}

/**
 * The folder the Usage mod writes session files to.
 * @param {string} configDirectory - The Claude config folder.
 * @returns {string} The session files' folder.
 */
function sessionsFolder(configDirectory) {
  return path.join(configDirectory, 'usage', 'sessions')
}

/**
 * Turn a session file's JSON into a record, or null when it isn't one.
 * @param {any} data - The parsed JSON.
 * @returns {ClaudeRecord | null} The record, or null.
 */
function toRecord(data) {
  if (data?.version !== formatVersion || data.tool !== 'claude-code') return null

  const updatedAt = dateOrNull(data.updatedAt)

  if (!updatedAt) return null

  /**
   * Build a limit reading from one of the file's windows.
   * @param {any} window - The window as the file stores it.
   * @returns {import('./usage').LimitReading | null} The reading, or null.
   */
  const toLimit = window => makeLimit(window?.percentUsed, dateOrNull(window?.resetsAt))

  return {
    title: typeof data.title === 'string' && data.title.trim() ? data.title.trim() : null,
    cwd: typeof data.cwd === 'string' ? data.cwd : null,
    context: {
      tokens: finiteOrNull(data.context?.tokens),
      window: finiteOrNull(data.context?.window),
      percent: finiteOrNull(data.context?.percent),
    },
    limits: {
      fiveHour: toLimit(data.rateLimits?.fiveHour),
      sevenDay: toLimit(data.rateLimits?.sevenDay),
    },
    updatedAt,
    isEnded: Boolean(data.endedAt),
  }
}

/**
 * Read one session file, reusing the cached record while the file is unchanged.
 * @param {string} filePath - The session file.
 * @returns {Promise<ClaudeRecord | null>} The record, or null when it's missing or invalid.
 */
async function readRecord(filePath) {
  const stats = await statFile(filePath)

  if (!stats) return null

  const cached = recordCache.get(filePath)

  if (cached?.mtimeMs === stats.mtimeMs && cached.size === stats.size) return cached.record

  const text = await fs.readFile(filePath, 'utf8').catch(() => undefined)
  const record = text === undefined ? null : toRecord(parseJson(text))

  // A file caught mid-write fails to parse; keep the last good record until it settles.
  if (!record && cached?.record) return cached.record

  recordCache.set(filePath, { mtimeMs: stats.mtimeMs, size: stats.size, record })
  return record
}

/**
 * Read Claude Code's usage for a workspace.
 * @param {object} options - Where to read and what to match.
 * @param {string} options.configDirectory - The Claude config folder.
 * @param {readonly string[]} options.folders - The workspace folders' paths.
 * @returns {Promise<import('./usage').ToolUsage | null>} The usage, or null when no session file exists.
 */
async function readClaudeUsage({ configDirectory, folders }) {
  const folder = sessionsFolder(configDirectory)
  const paths = (await listNames(folder)).filter(name => name.endsWith('.json')).map(name => path.join(folder, name))
  const seen = new Set(paths)

  for (const cachedPath of recordCache.keys()) {
    if (cachedPath.startsWith(folder) && !seen.has(cachedPath)) recordCache.delete(cachedPath)
  }

  const records = (await Promise.all(paths.map(readRecord))).filter(record => record !== null)

  if (!records.length) return null

  records.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())

  const session = records.find(record => isInWorkspace(record.cwd, folders)) ?? null
  const limitsRecord = records.find(record => hasLimits(record.limits))
  const account = await readClaudeAccount(configDirectory)

  return {
    session: session && {
      title: session.title,
      cwd: session.cwd,
      context: session.context,
      updatedAt: session.updatedAt,
      isEnded: session.isEnded,
    },
    limits: limitsRecord?.limits ?? emptyLimits(),
    limitsUpdatedAt: limitsRecord?.updatedAt ?? null,
    plan: account.plan,
    // Claude Code reports rate limits only on a subscription, so the newest session reporting
    // them settles it; otherwise, such as before its first reply, the account file decides.
    access: hasLimits(records[0].limits) ? 'subscription' : account.access,
  }
}

/**
 * Delete session files that haven't changed in `maxAgeMs`.
 *
 * The mod can't delete files, so the folder would otherwise keep one file for every
 * session ever run.
 * @param {object} options - What to prune.
 * @param {string} options.configDirectory - The Claude config folder.
 * @param {number} options.maxAgeMs - How old a file must be to delete it.
 * @param {Date} options.now - The current time.
 * @returns {Promise<number>} How many files were deleted.
 */
async function pruneClaudeSessions({ configDirectory, maxAgeMs, now }) {
  const folder = sessionsFolder(configDirectory)
  let deleted = 0

  for (const name of await listNames(folder)) {
    if (!name.endsWith('.json')) continue

    const filePath = path.join(folder, name)
    const stats = await statFile(filePath)

    if (!stats || now.getTime() - stats.mtimeMs < maxAgeMs) continue

    await fs.rm(filePath, { force: true })
    recordCache.delete(filePath)
    deleted += 1
  }

  return deleted
}

module.exports = { pruneClaudeSessions, readClaudeUsage }
