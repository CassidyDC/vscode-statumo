/**
 * Usage reader tests.
 * @file Check the Claude Code and Codex readers against session files in a temporary folder.
 */

'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')
const { after, before, test } = require('node:test')
const { pruneClaudeSessions, readClaudeUsage } = require('../src/claude')
const { readCodexUsage } = require('../src/codex')
const { isInWorkspace } = require('../src/paths')

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

test('matches sessions inside a workspace folder only', () => {
  assert.equal(isInWorkspace('/work/project', ['/work/project']), true)
  assert.equal(isInWorkspace('/work/project/packages/a', ['/work/project']), true)
  assert.equal(isInWorkspace('/work/project-two', ['/work/project']), false)
  assert.equal(isInWorkspace('/work', ['/work/project']), false)
  assert.equal(isInWorkspace(null, ['/work/project']), false)
})

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

/**
 * Build a Codex token count line.
 * @param {object} options - The line's values.
 * @param {string} options.timestamp - When the event was logged.
 * @param {number} [options.tokens] - Tokens in the context window; omitted for an event with no info.
 * @param {object | null} [options.primary] - The 5-hour window.
 * @param {object | null} [options.secondary] - The 7-day window.
 * @returns {string} The JSON line.
 */
function tokenCount({ timestamp, tokens, primary = null, secondary = null }) {
  const info = tokens === undefined
    ? null
    : { last_token_usage: { total_tokens: tokens }, model_context_window: 400_000 }

  return JSON.stringify({
    timestamp,
    type: 'event_msg',
    payload: { type: 'token_count', info, rate_limits: { primary, secondary, plan_type: 'plus' } },
  })
}

test('Codex: reads workspace context, the latest limits, and appended lines', async () => {
  const homeDirectory = path.join(root, 'codex')
  const now = new Date()
  const day = path.join(
    homeDirectory,
    'sessions',
    String(now.getFullYear()),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
  )

  const id = '01a200a0-4500-7642-bd37-dc1c8bda390f'
  const logPath = path.join(day, `rollout-2026-11-22T07-20-33-${id}.jsonl`)
  const resetsAt = Math.floor(now.getTime() / 1000) + 3600

  const meta = JSON.stringify({
    timestamp: '2026-11-22T07:20:33.000Z',
    type: 'session_meta',
    payload: { id, cwd: '/work/project', base_instructions: 'x'.repeat(100_000) },
  })

  const lines = [
    meta,
    tokenCount({
      timestamp: '2026-11-22T07:21:00.000Z',
      tokens: 100_000,
      primary: { used_percent: 84, window_minutes: 300, resets_at: resetsAt },
      secondary: { used_percent: 18, window_minutes: 10_080, resets_at: resetsAt + 86_400 },
    }),
    tokenCount({ timestamp: '2026-11-22T07:22:00.000Z', tokens: 120_000 }),
  ]

  await fs.mkdir(day, { recursive: true })
  await fs.writeFile(logPath, `${lines.join('\n')}\n`)
  await fs.writeFile(
    path.join(homeDirectory, 'session_index.jsonl'),
    `${JSON.stringify({ id, thread_name: 'Review CLI rebuild plan' })}\n`,
  )

  const usage = await readCodexUsage({ homeDirectory, folders: ['/work/project'], now })

  assert.equal(usage.session.title, 'Review CLI rebuild plan')
  assert.equal(usage.session.cwd, '/work/project')
  assert.deepEqual(usage.session.context, { tokens: 120_000, window: 400_000, percent: 30 })
  assert.equal(usage.limits.fiveHour.percentUsed, 84)
  assert.equal(usage.limits.sevenDay.percentUsed, 18)
  assert.equal(usage.limits.fiveHour.resetsAt.getTime(), resetsAt * 1000)
  assert.equal(usage.plan, 'Plus')
  assert.equal(usage.access, 'subscription')

  await fs.writeFile(path.join(homeDirectory, 'auth.json'), JSON.stringify({ auth_mode: 'apikey', tokens: null }))

  assert.equal((await readCodexUsage({ homeDirectory, folders: ['/work/project'], now })).access, 'api')

  const later = tokenCount({
    timestamp: '2026-11-22T07:23:00.000Z',
    tokens: 200_000,
    primary: { used_percent: 90, window_minutes: 300, resets_at: resetsAt },
  })

  await fs.appendFile(logPath, `${later}\n${tokenCount({ timestamp: '2026-11-22T07:24:00.000Z' })}`)

  const updated = await readCodexUsage({ homeDirectory, folders: ['/work/project'], now })

  assert.equal(updated.session.context.percent, 50)
  assert.equal(updated.limits.fiveHour.percentUsed, 90)
  assert.equal(updated.limits.sevenDay, null)

  const elsewhere = await readCodexUsage({ homeDirectory, folders: ['/work/other'], now })

  assert.equal(elsewhere.session, null)
  assert.equal(elsewhere.limits.fiveHour.percentUsed, 90)
})
