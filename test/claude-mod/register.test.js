/**
 * Usage mod tests.
 * @file Run the Usage mod's hooks against a fake mod runtime, and check that Statumo's readers accept the files it writes.
 */

import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { after, before, test } from 'node:test'
import { register } from '../../claude-mod/hooks/register.js'
import { createLimitsReader } from '../../src/providers/claude/limits.js'
import { createSessionReader } from '../../src/providers/claude/sessions.js'

/**
 * The hooks the mod registers, by event name.
 * @type {Map<string, Function>}
 */
const hooks = new Map()

register((name, hook) => hooks.set(name, hook))

/**
 * The temporary folder the fixtures live in.
 * @type {string}
 */
let root

before(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'statumo-mod-'))
})

after(async () => {
  await fs.rm(root, { recursive: true, force: true })
})

/**
 * Create a fake mod runtime for one session, which writes files to disk and records their paths.
 * @param {object} session - The session the runtime reports.
 * @param {string | undefined} session.transcriptPath - The session's transcript path.
 * @param {string | null} session.id - The session's id.
 * @param {string} [session.cwd] - The session's project root.
 * @param {object} [session.context] - The live context reading `$.session.usage()` returns.
 * @returns {{ $: object, writes: string[] }} The runtime, and the paths it wrote, in order.
 */
function fakeRuntime({ transcriptPath, id, cwd = '/work/project', context = {} }) {
  /** The paths written, in order. */
  const writes = []

  /** The runtime's API. */
  const $ = {
    session: {
      /**
       * Report the session's transcript path.
       * @returns {Promise<{ transcriptPath: string | undefined }>} The session's info.
       */
      info: async () => ({ transcriptPath }),

      /**
       * Report the session's id.
       * @returns {Promise<string | null>} The id.
       */
      id: async () => id,

      /**
       * Report the session's project root.
       * @returns {Promise<string>} The project root.
       */
      root: async () => cwd,

      /**
       * Report the session's live usage.
       * @returns {Promise<{ context: object }>} The usage.
       */
      usage: async () => ({ context }),
    },
    fs: {
      /**
       * Write a file, creating its folder, and record its path.
       * @param {string} filePath - The file.
       * @param {string} text - The file's text.
       * @returns {Promise<void>} Resolves once written.
       */
      write: async (filePath, text) => {
        writes.push(filePath)
        await fs.mkdir(path.dirname(filePath), { recursive: true })
        await fs.writeFile(filePath, text)
      },
    },
  }
  return { $, writes }
}

/**
 * Run one of the mod's hooks with a `next` that records the event it passes on.
 * @param {string} name - The hook's event name.
 * @param {object} $ - The fake runtime.
 * @param {object} event - The event.
 * @returns {Promise<{ result: unknown, passed: object[] }>} What the hook returned, and the events it passed on.
 */
async function runHook(name, $, event) {
  /** The events passed on. */
  const passed = []

  /** What the hook returned. */
  const result = await hooks.get(name)($, event, async nextEvent => {
    passed.push(nextEvent)
    return 'next result'
  })
  return { result, passed }
}

/**
 * A transcript path inside a config folder's `projects/` folder.
 * @param {string} configDirectory - The Claude config folder.
 * @param {string} id - The session's id.
 * @returns {string} The transcript path.
 */
function transcriptIn(configDirectory, id) {
  return path.join(configDirectory, 'projects', '-work-project', `${id}.jsonl`)
}

test('a measurement writes session and limits files that the readers accept', async () => {
  /** The config folder, the session's transcript, and the fake runtime. */
  const configDirectory = path.join(root, 'measure')
  const transcriptPath = transcriptIn(configDirectory, 'session-a')
  const { $, writes } = fakeRuntime({ transcriptPath, id: 'session-a' })

  /** The measurement the hook is given. */
  const event = {
    context: { tokens: 48_300, window: 1_000_000, percent: 5, extra: 'dropped' },
    rateLimits: [
      { kind: 'five_hour', percentUsed: 16, resetsAt: '2026-11-22T14:30:00.000Z' },
      { kind: 'seven_day', percentUsed: 39, resetsAt: '2026-11-27T09:00:00.000Z' },
    ],
  }

  /** The hook's result. */
  const { result, passed } = await runHook('session.measure', $, event)

  assert.equal(result, 'next result')
  assert.deepEqual(passed, [event])
  assert.deepEqual(writes, [
    `${configDirectory}/statumo/sessions/session-a.json`,
    `${configDirectory}/statumo/limits.json`,
  ])

  /** What Statumo reads from the files. */
  const [session] = await createSessionReader()(configDirectory)
  const limits = await createLimitsReader()(configDirectory)

  assert.equal(session.cwd, '/work/project')
  assert.equal(session.transcriptPath, transcriptPath)
  assert.deepEqual(session.context, { tokens: 48_300, window: 1_000_000, percent: 5 })
  assert.deepEqual(limits.limits, {
    fiveHour: { percentUsed: 16, resetsAt: new Date('2026-11-22T14:30:00.000Z') },
    sevenDay: { percentUsed: 39, resetsAt: new Date('2026-11-27T09:00:00.000Z') },
    sevenDayFable: null,
  })
})

test('a measurement without limits keeps the last limits file, and nulls unreported context values', async () => {
  /** The config folder, the fake runtime, and the limits file another session wrote. */
  const configDirectory = path.join(root, 'no-limits')
  const { $, writes } = fakeRuntime({ transcriptPath: transcriptIn(configDirectory, 'session-b'), id: 'session-b' })
  const limitsPath = path.join(configDirectory, 'statumo', 'limits.json')
  const limitsText = JSON.stringify({ rateLimits: [{ kind: 'five_hour', percentUsed: 70 }] })

  await fs.mkdir(path.dirname(limitsPath), { recursive: true })
  await fs.writeFile(limitsPath, limitsText)
  await runHook('session.measure', $, { context: { tokens: 1200, percent: Number.NaN } })

  assert.deepEqual(writes, [`${configDirectory}/statumo/sessions/session-b.json`])
  assert.equal(await fs.readFile(limitsPath, 'utf8'), limitsText)

  /** What Statumo reads from the session file. */
  const [session] = await createSessionReader()(configDirectory)

  assert.deepEqual(session.context, { tokens: 1200, window: null, percent: null })
})

test('a session start writes the live context without limits, except at startup', async () => {
  /** The config folder. */
  const configDirectory = path.join(root, 'start')

  /** The fake runtime, with a live context reading. */
  const { $, writes } = fakeRuntime({
    transcriptPath: transcriptIn(configDirectory, 'session-c'),
    id: 'session-c',
    context: { tokens: 9000, window: 200_000, percent: 4.5 },
  })

  /** The classic startup event, which the mod only passes on. */
  const startup = await runHook('classic.SessionStart', $, { source: 'startup' })

  assert.deepEqual(startup.passed, [{ source: 'startup' }])
  assert.deepEqual(writes, [])

  await runHook('classic.SessionStart', $, { source: 'resume' })
  await runHook('session.start', $, {})

  assert.deepEqual(writes, [
    `${configDirectory}/statumo/sessions/session-c.json`,
    `${configDirectory}/statumo/sessions/session-c.json`,
  ])

  /** What Statumo reads from the session file. */
  const [session] = await createSessionReader()(configDirectory)
  assert.deepEqual(session.context, { tokens: 9000, window: 200_000, percent: 4.5 })
})

test('finds the config folder from Windows transcript paths, and skips sessions it cannot place', async () => {
  /** A Windows transcript path's runtime. */
  const windows = fakeRuntime({ transcriptPath: 'C:\\Users\\you\\.claude\\projects\\C--work\\session-d.jsonl', id: 'session-d' })

  /**
   * Keep the Windows runtime from writing to disk; only the path it picks matters.
   * @param {string} filePath - The file.
   * @returns {Promise<void>} Resolves at once.
   */
  windows.$.fs.write = async filePath => {
    windows.writes.push(filePath)
  }

  await runHook('session.measure', windows.$, { context: {} })

  assert.deepEqual(windows.writes, ['C:\\Users\\you\\.claude/statumo/sessions/session-d.json'])

  /** Runtimes whose session has no transcript in a `projects/` folder, or no id. */
  const unplaced = [
    fakeRuntime({ transcriptPath: undefined, id: 'session-e' }),
    fakeRuntime({ transcriptPath: path.join(root, 'elsewhere', 'session-f.jsonl'), id: 'session-f' }),
    fakeRuntime({ transcriptPath: transcriptIn(path.join(root, 'no-id'), 'session-g'), id: null }),
  ]

  for (const { $, writes } of unplaced) {
    /** The hook's result. */
    const { result } = await runHook('session.measure', $, { context: {}, rateLimits: [{ kind: 'five_hour', percentUsed: 1 }] })

    assert.equal(result, 'next result')
    assert.deepEqual(writes, [])
  }
})

test('a failed report still passes the event on', async () => {
  /** A runtime whose writes fail. */
  const { $ } = fakeRuntime({ transcriptPath: transcriptIn(path.join(root, 'failing'), 'session-h'), id: 'session-h' })

  /**
   * Fail every write.
   * @returns {Promise<never>} Rejects.
   */
  $.fs.write = async () => {
    throw new Error('disk full')
  }

  /** The measurement and start hooks' results. */
  const measured = await runHook('session.measure', $, { context: {} })
  const started = await runHook('session.start', $, {})

  assert.equal(measured.result, 'next result')
  assert.equal(started.result, 'next result')
})
