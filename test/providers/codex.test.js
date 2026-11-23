/**
 * Codex reader tests.
 * @file Check the Codex reader against session logs, a session index, and an auth file in a temporary folder.
 */

'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')
const { after, before, test } = require('node:test')
const { createCodexReader } = require('../../src/providers/codex')

/**
 * The temporary folder the fixtures live in.
 * @type {string}
 */
let root

before(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'statumo-codex-'))
})

after(async () => {
  await fs.rm(root, { recursive: true, force: true })
})

/**
 * Build a Codex token count line.
 * @param {object} options - The line's values.
 * @param {string} options.timestamp - When the event was logged.
 * @param {number} [options.tokens] - Tokens in the context window; omitted for an event with no info.
 * @param {object | null} [options.primary] - The first rate-limit window.
 * @param {object | null} [options.secondary] - The second rate-limit window.
 * @returns {string} The JSON line.
 */
function tokenCount({ timestamp, tokens, primary = null, secondary = null }) {
  /** The event's token info, or null for an event with none. */
  const info = tokens === undefined
    ? null
    : { last_token_usage: { total_tokens: tokens }, model_context_window: 400_000 }

  return JSON.stringify({
    timestamp,
    type: 'event_msg',
    payload: { type: 'token_count', info, rate_limits: { primary, secondary, plan_type: 'plus' } },
  })
}

/**
 * Find today's session log folder under a Codex home folder.
 * @param {string} homeDirectory - The Codex home folder.
 * @param {Date} now - The current time.
 * @returns {string} The day folder.
 */
function dayFolder(homeDirectory, now) {
  return path.join(
    homeDirectory,
    'sessions',
    String(now.getFullYear()),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
  )
}

test('Codex: reads workspace context, the latest limits, and appended lines', async () => {
  /** The Codex home folder, the current time, and today's log folder. */
  const homeDirectory = path.join(root, 'codex')
  const now = new Date()
  const day = dayFolder(homeDirectory, now)

  /** The session's id, its log, and when its windows reset in epoch seconds. */
  const id = '01a200a0-4500-7642-bd37-dc1c8bda390f'
  const logPath = path.join(day, `rollout-2026-11-22T07-20-33-${id}.jsonl`)
  const resetsAt = Math.floor(now.getTime() / 1000) + 3600

  /** The log's first line, far longer than the head the reader takes. */
  const meta = JSON.stringify({
    timestamp: '2026-11-22T07:20:33.000Z',
    type: 'session_meta',
    payload: { id, cwd: '/work/project', base_instructions: 'x'.repeat(100_000) },
  })

  /** The log's lines. */
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

  /** The reader under test. */
  const readCodexUsage = createCodexReader()

  await fs.mkdir(day, { recursive: true })
  await fs.writeFile(logPath, `${lines.join('\n')}\n`)
  await fs.writeFile(
    path.join(homeDirectory, 'session_index.jsonl'),
    `${JSON.stringify({ id, thread_name: 'Review CLI rebuild plan' })}\n`,
  )

  /** The first reading. */
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

  /** A later token count with only a 5-hour window. */
  const later = tokenCount({
    timestamp: '2026-11-22T07:23:00.000Z',
    tokens: 200_000,
    primary: { used_percent: 90, window_minutes: 300, resets_at: resetsAt },
  })

  await fs.appendFile(logPath, `${later}\n${tokenCount({ timestamp: '2026-11-22T07:24:00.000Z' })}`)

  /** The reading after the append. */
  const updated = await readCodexUsage({ homeDirectory, folders: ['/work/project'], now })

  assert.equal(updated.session.context.percent, 50)
  assert.equal(updated.limits.fiveHour.percentUsed, 90)
  assert.equal(updated.limits.sevenDay, null)

  /** A reading from a workspace with no Codex session. */
  const elsewhere = await readCodexUsage({ homeDirectory, folders: ['/work/other'], now })

  assert.equal(elsewhere.session, null)
  assert.equal(elsewhere.limits.fiveHour.percentUsed, 90)
})

test('Codex: skips a window that does not give its length, and appends new session titles', async () => {
  /** The Codex home folder, the current time, today's log folder, and the session's id. */
  const homeDirectory = path.join(root, 'codex-windows')
  const now = new Date()
  const day = dayFolder(homeDirectory, now)
  const id = '02b300b0-4500-7642-bd37-dc1c8bda390f'

  /** The session's log, and the session index. */
  const logPath = path.join(day, `rollout-2026-11-22T08-00-00-${id}.jsonl`)
  const indexPath = path.join(homeDirectory, 'session_index.jsonl')

  /** The reader under test. */
  const readCodexUsage = createCodexReader()

  await fs.mkdir(day, { recursive: true })
  await fs.writeFile(logPath, `${[
    JSON.stringify({ type: 'session_meta', payload: { id, cwd: '/work/project' } }),
    tokenCount({
      timestamp: '2026-11-22T08:01:00.000Z',
      tokens: 40_000,
      primary: { used_percent: 30, resets_in_seconds: 600 },
      secondary: { used_percent: 12, window_minutes: 10_080, resets_at: 1_800_000_000 },
    }),
  ].join('\n')}\n`)
  await fs.writeFile(indexPath, `${JSON.stringify({ id, thread_name: 'First title' })}\n`)

  /** The first reading. */
  const usage = await readCodexUsage({ homeDirectory, folders: ['/work/project'], now })

  assert.equal(usage.limits.fiveHour, null)
  assert.deepEqual(usage.limits.sevenDay, { percentUsed: 12, resetsAt: new Date(1_800_000_000_000) })
  assert.equal(usage.session.title, 'First title')

  await fs.appendFile(indexPath, `${JSON.stringify({ id, thread_name: '  Renamed  ' })}\n`)

  assert.equal((await readCodexUsage({ homeDirectory, folders: ['/work/project'], now })).session.title, 'Renamed')
})
