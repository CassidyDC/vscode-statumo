/**
 * Usage reader tests.
 * @file Check the Claude Code reader against session files in a temporary folder.
 */

'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')
const { after, before, test } = require('node:test')
const { pruneClaudeSessions, readClaudeUsage } = require('../src/claude')

/**
 * The temporary folder the fixtures live in.
 * @type {string}
 */
let root

before(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'statumo-'))
})

after(async () => {
  await fs.rm(root, { recursive: true, force: true })
})

/**
 * Write a Claude session file the way the Usage mod does.
 * @param {string} configDirectory - The Claude config folder.
 * @param {string} id - The session's id.
 * @param {object} fields - Fields to replace in the file.
 * @returns {Promise<void>} Resolves once written.
 */
async function writeClaudeSession(configDirectory, id, fields) {
  const folder = path.join(configDirectory, 'usage', 'sessions')

  const data = {
    version: 1,
    tool: 'claude-code',
    sessionId: id,
    cwd: '/elsewhere',
    title: null,
    context: { tokens: null, window: null, percent: null },
    rateLimits: { fiveHour: null, sevenDay: null },
    endedAt: null,
    updatedAt: '2026-11-22T09:00:00.000Z',
    ...fields,
  }

  await fs.mkdir(folder, { recursive: true })
  await fs.writeFile(path.join(folder, `${id}.json`), JSON.stringify(data))
}

test('Claude: follows the workspace session and the newest limits', async () => {
  const configDirectory = path.join(root, 'claude')

  await writeClaudeSession(configDirectory, 'workspace', {
    cwd: '/work/project',
    title: 'Refactor parser',
    context: { tokens: 48_300, window: 1_000_000, percent: 5 },
    rateLimits: { fiveHour: { percentUsed: 30, resetsAt: '2026-11-22T12:00:00.000Z' }, sevenDay: null },
    updatedAt: '2026-11-22T09:00:00.000Z',
  })
  await writeClaudeSession(configDirectory, 'other', {
    rateLimits: {
      fiveHour: { percentUsed: 40, resetsAt: '2026-11-22T12:00:00.000Z' },
      sevenDay: { percentUsed: 10, resetsAt: null },
    },
    updatedAt: '2026-11-22T09:30:00.000Z',
  })
  await fs.writeFile(path.join(configDirectory, 'usage', 'sessions', 'broken.json'), '{')

  const usage = await readClaudeUsage({ configDirectory, folders: ['/work/project'] })

  assert.equal(usage.session.title, 'Refactor parser')
  assert.equal(usage.session.context.percent, 5)
  assert.equal(usage.limits.fiveHour.percentUsed, 40)
  assert.equal(usage.limits.sevenDay.percentUsed, 10)
  assert.equal(usage.limitsUpdatedAt.toISOString(), '2026-11-22T09:30:00.000Z')
})

test('Claude: dates limits by when they were read, so limits a restarted session carries over lose to newer ones', async () => {
  const configDirectory = path.join(root, 'claude-restart')
  const limits = percentUsed => ({ fiveHour: { percentUsed, resetsAt: null }, sevenDay: null })

  await writeClaudeSession(configDirectory, 'restarted', {
    rateLimits: limits(5),
    updatedAt: '2026-11-22T10:00:00.000Z',
    rateLimitsUpdatedAt: '2026-11-22T08:00:00.000Z',
  })
  await writeClaudeSession(configDirectory, 'other', { rateLimits: limits(9), updatedAt: '2026-11-22T09:00:00.000Z' })

  const usage = await readClaudeUsage({ configDirectory, folders: [] })

  assert.equal(usage.limits.fiveHour.percentUsed, 9)
  assert.equal(usage.limitsUpdatedAt.toISOString(), '2026-11-22T09:00:00.000Z')
})

test('Claude: names the plan from the signed-in account in the global config file', async () => {
  const configDirectory = path.join(root, 'claude-plan')

  /**
   * Write Claude Code's global config file with the given account.
   * @param {object} oauthAccount - The account's fields.
   * @returns {Promise<void>} Resolves once written.
   */
  const writeAccount = oauthAccount => fs.writeFile(path.join(configDirectory, '.claude.json'), JSON.stringify({ oauthAccount }))

  await writeClaudeSession(configDirectory, 'session', {})

  assert.equal((await readClaudeUsage({ configDirectory, folders: [] })).plan, null)

  await writeAccount({ organizationType: 'claude_max', organizationRateLimitTier: 'default_claude_max_20x' })

  assert.equal((await readClaudeUsage({ configDirectory, folders: [] })).plan, 'Max 20x')
  assert.equal((await readClaudeUsage({ configDirectory, folders: [] })).access, null)

  await writeAccount({ organizationType: 'claude_max', billingType: 'stripe_subscription' })

  assert.equal((await readClaudeUsage({ configDirectory, folders: [] })).access, 'subscription')

  await writeAccount({ organizationType: 'claude_pro', organizationRateLimitTier: null })

  assert.equal((await readClaudeUsage({ configDirectory, folders: [] })).plan, 'Pro')

  await fs.writeFile(path.join(configDirectory, '.claude.json'), '{')

  assert.equal((await readClaudeUsage({ configDirectory, folders: [] })).plan, 'Pro')

  await fs.writeFile(path.join(configDirectory, '.claude.json'), JSON.stringify({ primaryApiKey: 'sk-test' }))

  const apiUsage = await readClaudeUsage({ configDirectory, folders: [] })

  assert.equal(apiUsage.plan, null)
  assert.equal(apiUsage.access, 'api')

  await writeClaudeSession(configDirectory, 'session', {
    rateLimits: { fiveHour: { percentUsed: 10, resetsAt: null }, sevenDay: null },
  })

  assert.equal((await readClaudeUsage({ configDirectory, folders: [] })).access, 'subscription')
})

test('Claude: returns null without session files, and prunes old ones', async () => {
  const configDirectory = path.join(root, 'claude-prune')

  assert.equal(await readClaudeUsage({ configDirectory, folders: [] }), null)

  await writeClaudeSession(configDirectory, 'old', {})

  const filePath = path.join(configDirectory, 'usage', 'sessions', 'old.json')
  const longAgo = new Date(Date.now() - 40 * 86_400_000)

  await fs.utimes(filePath, longAgo, longAgo)

  const deleted = await pruneClaudeSessions({ configDirectory, maxAgeMs: 30 * 86_400_000, now: new Date() })

  assert.equal(deleted, 1)
  assert.equal(await readClaudeUsage({ configDirectory, folders: [] }), null)
})
