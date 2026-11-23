/**
 * Claude Code reader tests.
 * @file Check the Claude Code reader against session, limits, transcript, and account files in a temporary folder.
 */

import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { after, before, test } from 'node:test'
import { createClaudeReader, pruneClaudeSessions } from '../../src/providers/claude/index.js'

/**
 * The temporary folder the fixtures live in.
 * @type {string}
 */
let root

before(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'statumo-claude-'))
})

after(async () => {
  await fs.rm(root, { recursive: true, force: true })
})

/**
 * Write a file, creating its folder, and optionally set its modified time.
 * @param {string} filePath - The file.
 * @param {string} text - The file's text.
 * @param {Date} [modifiedAt] - The file's modified time.
 * @returns {Promise<void>} Resolves once written.
 */
async function writeFile(filePath, text, modifiedAt) {
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await fs.writeFile(filePath, text)

  if (modifiedAt) await fs.utimes(filePath, modifiedAt, modifiedAt)
}

/**
 * Write a session file the way the Usage mod does.
 * @param {string} configDirectory - The Claude config folder.
 * @param {string} id - The session's id.
 * @param {object} fields - Fields to replace in the file.
 * @param {Date} [modifiedAt] - The file's modified time.
 * @returns {Promise<void>} Resolves once written.
 */
function writeSession(configDirectory, id, fields, modifiedAt) {
  /** The file's fields. */
  const data = { cwd: '/elsewhere', transcriptPath: '', context: { tokens: null, window: 1_000_000, percent: null }, ...fields }
  return writeFile(path.join(configDirectory, 'statumo', 'sessions', `${id}.json`), JSON.stringify(data), modifiedAt)
}

/**
 * Write the limits file the way the Usage mod does.
 * @param {string} configDirectory - The Claude config folder.
 * @param {object[]} rateLimits - The rate-limit windows.
 * @param {Date} [modifiedAt] - The file's modified time.
 * @returns {Promise<void>} Resolves once written.
 */
function writeLimits(configDirectory, rateLimits, modifiedAt) {
  return writeFile(path.join(configDirectory, 'statumo', 'limits.json'), JSON.stringify({ rateLimits }), modifiedAt)
}

/**
 * Build a transcript row.
 * @param {object} fields - The row's fields.
 * @returns {string} The row as a line.
 */
function row(fields) {
  return `${JSON.stringify(fields)}\n`
}

test('Claude: follows the newest workspace session and the limits file', async () => {
  /** The config folder, and the reader under test. */
  const configDirectory = path.join(root, 'claude')
  const readClaudeUsage = createClaudeReader()

  await writeSession(configDirectory, 'older', {
    cwd: '/work/project',
    context: { tokens: 10_000, window: 1_000_000, percent: 1 },
  }, new Date('2026-11-22T08:00:00.000Z'))

  await writeSession(configDirectory, 'workspace', {
    cwd: '/work/project/packages/a',
    context: { tokens: 48_300, window: 1_000_000, percent: 5 },
  }, new Date('2026-11-22T09:00:00.000Z'))

  await writeSession(configDirectory, 'other', {}, new Date('2026-11-22T09:30:00.000Z'))
  await writeFile(path.join(configDirectory, 'statumo', 'sessions', 'broken.json'), '{')
  await writeLimits(configDirectory, [
    { kind: 'five_hour', percentUsed: 40, resetsAt: '2026-11-22T12:00:00.000Z' },
    { kind: 'seven_day', percentUsed: 10 },
    { kind: 'spend_limit', percentUsed: 99 },
  ], new Date('2026-11-22T09:15:00.000Z'))

  /** The reading. */
  const usage = await readClaudeUsage({ configDirectory, folders: ['/work/project'] })

  assert.equal(usage.session.cwd, '/work/project/packages/a')
  assert.deepEqual(usage.session.context, { tokens: 48_300, window: 1_000_000, percent: 5 })
  assert.equal(usage.session.updatedAt.toISOString(), '2026-11-22T09:00:00.000Z')
  assert.equal(usage.session.title, null)
  assert.deepEqual(usage.limits.fiveHour, { percentUsed: 40, resetsAt: new Date('2026-11-22T12:00:00.000Z') })
  assert.deepEqual(usage.limits.sevenDay, { percentUsed: 10, resetsAt: null })
  assert.equal(usage.limitsUpdatedAt.toISOString(), '2026-11-22T09:15:00.000Z')
  assert.equal(usage.access, 'subscription')

  /** A reading from a workspace with no Claude Code session. */
  const elsewhere = await readClaudeUsage({ configDirectory, folders: ['/work/none'] })

  assert.equal(elsewhere.session, null)
  assert.equal(elsewhere.limits.fiveHour.percentUsed, 40)
})

test('Claude: shows sessions without limits, and limits without sessions', async () => {
  /** The config folder, and the reader under test. */
  const configDirectory = path.join(root, 'claude-partial')
  const readClaudeUsage = createClaudeReader()

  await writeSession(configDirectory, 'session', { cwd: '/work/project' })

  /** A reading before any limits. */
  const usage = await readClaudeUsage({ configDirectory, folders: ['/work/project'] })

  assert.deepEqual(usage.limits, { fiveHour: null, sevenDay: null })
  assert.equal(usage.limitsUpdatedAt, null)
  assert.equal(usage.access, null)

  await fs.rm(path.join(configDirectory, 'statumo', 'sessions'), { recursive: true })
  await writeLimits(configDirectory, [{ kind: 'five_hour', percentUsed: 12 }])

  /** A reading with limits only. */
  const limitsOnly = await readClaudeUsage({ configDirectory, folders: ['/work/project'] })

  assert.equal(limitsOnly.session, null)
  assert.equal(limitsOnly.limits.fiveHour.percentUsed, 12)
})

test('Claude: titles the session from its transcript, preferring the latest custom title', async () => {
  /** The config folder, the session's transcript, and the reader under test. */
  const configDirectory = path.join(root, 'claude-title')
  const transcriptPath = path.join(configDirectory, 'projects', '-work-project', 'session.jsonl')
  const readClaudeUsage = createClaudeReader()

  /**
   * Read the workspace session's title.
   * @returns {Promise<string | null>} The title.
   */
  const readTitle = async () => (await readClaudeUsage({ configDirectory, folders: ['/work/project'] })).session.title

  await writeSession(configDirectory, 'session', { cwd: '/work/project', transcriptPath })

  assert.equal(await readTitle(), null)

  await writeFile(transcriptPath, [
    row({ type: 'user', message: { content: 'x'.repeat(10_000) } }),
    row({ type: 'ai-title', aiTitle: 'First AI title', sessionId: 'session' }),
    row({ type: 'ai-title', aiTitle: 'Refactor\nthe\tparser\u0007 ', sessionId: 'session' }),
  ].join(''))

  assert.equal(await readTitle(), 'Refactor the parser')

  await fs.appendFile(transcriptPath, row({ type: 'custom-title', customTitle: 'My title', sessionId: 'session' }))

  assert.equal(await readTitle(), 'My title')

  await fs.appendFile(transcriptPath, [
    row({ type: 'ai-title', aiTitle: 'Later AI title', sessionId: 'session' }),
    row({ type: 'assistant', message: { content: 'mentions "custom-title" in passing' } }),
  ].join(''))

  assert.equal(await readTitle(), 'My title')

  await fs.appendFile(transcriptPath, row({ type: 'custom-title', customTitle: 'Renamed', sessionId: 'session' }))

  assert.equal(await readTitle(), 'Renamed')
})

test('Claude: names the plan and access from the signed-in account in the global config file', async () => {
  /** The config folder, its global config file, and the reader under test. */
  const configDirectory = path.join(root, 'claude-plan')
  const configPath = path.join(configDirectory, '.claude.json')
  const readClaudeUsage = createClaudeReader()

  /**
   * Write Claude Code's global config file with the given account.
   * @param {object} oauthAccount - The account's fields.
   * @returns {Promise<void>} Resolves once written.
   */
  const writeAccount = oauthAccount => writeFile(configPath, JSON.stringify({ oauthAccount }))

  /**
   * Read the usage with no workspace folders.
   * @returns {Promise<import('../../src/usage/model.js').ToolUsage>} The usage.
   */
  const read = () => readClaudeUsage({ configDirectory, folders: [] })

  await writeSession(configDirectory, 'session', {})

  assert.equal((await read()).plan, null)

  await writeAccount({ organizationType: 'claude_max', organizationRateLimitTier: 'default_claude_max_20x' })

  assert.equal((await read()).plan, 'Max 20x')
  assert.equal((await read()).access, null)

  await writeAccount({ organizationType: 'claude_max', billingType: 'stripe_subscription' })

  assert.equal((await read()).access, 'subscription')

  await writeAccount({ organizationType: 'claude_pro', organizationRateLimitTier: null })

  assert.equal((await read()).plan, 'Pro')

  await writeFile(configPath, '{')

  assert.equal((await read()).plan, 'Pro')

  await writeFile(configPath, JSON.stringify({ primaryApiKey: 'sk-test' }))

  /** A reading with an API key. */
  const apiUsage = await read()

  assert.equal(apiUsage.plan, null)
  assert.equal(apiUsage.access, 'api')

  await writeLimits(configDirectory, [{ kind: 'five_hour', percentUsed: 10 }])

  assert.equal((await read()).access, 'api')

  await writeFile(configPath, JSON.stringify({}))

  assert.equal((await read()).access, 'subscription')
})

test('Claude: returns null without session or limits files, and prunes old session files', async () => {
  /** The config folder, the reader under test, and an old session file. */
  const configDirectory = path.join(root, 'claude-prune')
  const readClaudeUsage = createClaudeReader()
  const filePath = path.join(configDirectory, 'statumo', 'sessions', 'old.json')

  assert.equal(await readClaudeUsage({ configDirectory, folders: [] }), null)

  await writeSession(configDirectory, 'old', {}, new Date(Date.now() - 40 * 86_400_000))
  await writeSession(configDirectory, 'recent', {}, new Date(Date.now() - 2 * 86_400_000))

  assert.equal((await readClaudeUsage({ configDirectory, folders: [] })).session, null)

  /** How many files pruning deleted. */
  const deleted = await pruneClaudeSessions({ configDirectory, maxAgeMs: 30 * 86_400_000, now: new Date() })

  assert.equal(deleted, 1)
  await assert.rejects(fs.stat(filePath), { code: 'ENOENT' })

  await fs.rm(path.join(configDirectory, 'statumo', 'sessions', 'recent.json'))

  assert.equal(await readClaudeUsage({ configDirectory, folders: [] }), null)
})
