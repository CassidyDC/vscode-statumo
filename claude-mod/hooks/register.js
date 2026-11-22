import { readSessionTitle } from './session-title.js'

const formatVersion = 1
const transcriptLayout = /^(.*)[\\/]projects[\\/][^\\/]+[\\/][^\\/]+$/

function readLimit(limits, kind) {
  const limit = limits.find(entry => entry.kind === kind)
  if (!Number.isFinite(limit?.percentUsed)) return null

  return {
    percentUsed: limit.percentUsed,
    resetsAt: typeof limit.resetsAt === 'string' ? limit.resetsAt : null,
  }
}

function readContext(context) {
  const number = value => (Number.isFinite(value) ? value : null)
  return {
    tokens: number(context?.tokens),
    window: number(context?.window),
    percent: number(context?.percent),
  }
}

// Session files sit beside `projects/` in the Claude config folder, so a custom
// CLAUDE_CONFIG_DIR is followed without reading the environment.
async function resolveOutputPath($) {
  const [{ transcriptPath }, id] = await Promise.all([$.session.info(), $.session.id()])
  const match = transcriptLayout.exec(transcriptPath ?? '')
  if (match && id) return `${match[1]}/usage/sessions/${id}.json`
}

let timer
let transcript
let outputPath
let snapshot
let revision = 0

async function publish($, { isObserved }) {
  const current = ++revision
  outputPath ??= await resolveOutputPath($)
  if (!outputPath) return

  const [usage, metadata, root, sessionId] = await Promise.all([
    $.session.usage().catch(() => undefined),
    readSessionTitle($, transcript).catch(() => ({})),
    $.session.root(),
    $.session.id(),
  ])
  if (current !== revision) return

  transcript = metadata.cursor
  const limits = usage?.rateLimits ?? []
  const title = metadata.title?.replace(/[\s\u0000-\u001f\u007f-\u009f]+/g, ' ').trim()
  const fields = {
    version: formatVersion,
    tool: 'claude-code',
    sessionId,
    cwd: root,
    title: title || null,
    context: readContext(usage?.context),
    rateLimits: {
      fiveHour: readLimit(limits, 'five_hour'),
      sevenDay: readLimit(limits, 'seven_day'),
    },
    endedAt: null,
  }

  // Timer passes only rewrite the file when something changed, so `updatedAt`
  // keeps saying when Claude last reported usage or the session last changed.
  const isChanged = JSON.stringify(fields) !== JSON.stringify(snapshot?.fields)
  if (!isObserved && !isChanged) return

  snapshot = { fields, updatedAt: new Date().toISOString() }
  await write($, snapshot)
}

function write($, { fields, updatedAt }) {
  return $.fs.write(outputPath, `${JSON.stringify({ ...fields, updatedAt }, null, 2)}\n`)
}

function startTimer($) {
  // Saved titles and the project root can change while the conversation is idle.
  timer ??= $.clock.every(10_000, () => {
    void publish($, { isObserved: false }).catch(() => {})
  })
}

async function observe($, event, next) {
  startTimer($)
  await publish($, { isObserved: true }).catch(() => {})
  return next(event)
}

async function end($, event, next) {
  revision += 1
  timer?.cancel()
  timer = undefined

  if (outputPath && snapshot) {
    const endedAt = new Date().toISOString()
    snapshot = { fields: { ...snapshot.fields, endedAt }, updatedAt: endedAt }
    await write($, snapshot).catch(() => {})
  }

  transcript = undefined
  outputPath = undefined
  snapshot = undefined
  return next(event)
}

export function register(on) {
  on('session.start', observe)
  on('session.attach', observe)
  on('session.measure', observe)
  on('session.end', end)
  on('classic.SessionStart', ($, event, next) =>
    event.source === 'startup' ? next(event) : observe($, event, next),
  )
}
