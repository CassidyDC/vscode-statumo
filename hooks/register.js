import { readSessionTitle } from './session-title.js'

const resetTime = new Intl.DateTimeFormat('en-GB', {
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})
const resetDate = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' })

function formatTokens(tokens) {
  return Number.isFinite(tokens) ? `${Math.round(tokens / 100) / 10}k` : '—'
}

function formatContext(context) {
  const tokens = `${formatTokens(context?.tokens)}/${formatTokens(context?.window)}`
  const percent = Number.isFinite(context?.percent) ? `, ${context.percent}% used` : ''
  return `Context ${tokens}${percent}`
}

function formatLimit(label, limit, formatter) {
  if (!Number.isFinite(limit?.percentUsed)) return `${label} —`

  const remaining = Math.max(0, Math.min(100, Math.round((100 - limit.percentUsed) * 10) / 10))
  const reset = typeof limit.resetsAt === 'string' ? new Date(limit.resetsAt) : undefined
  const resetText = Number.isFinite(reset?.getTime()) ? `, resets ${formatter.format(reset)}` : ''
  return `${label} ${remaining}% left${resetText}`
}

async function readBranch($) {
  const cwd = await $.session.root()
  const { exitCode, stdout } = await $.process.run(
    ['git', 'branch', '--show-current'],
    { cwd, timeoutMs: 2000 },
  )
  if (exitCode === 0) return stdout.trim() || 'Detached HEAD'
}

let timer
let transcript
let revision = 0

function clearStatus($) {
  timer?.cancel()
  timer = undefined
  $.ui.status(undefined)
}

async function refresh($) {
  const current = ++revision
  const surfaces = await $.session.surfaces()
  if (current !== revision) return

  // Status lines are shared across attached surfaces.
  if (surfaces.length !== 1 || surfaces[0] !== 'vscode') {
    clearStatus($)
    return
  }

  // Git and saved titles can change while the conversation is idle.
  timer ??= $.clock.every(10_000, () => { void refresh($).catch(() => {}) })
  const [usage, branch, metadata] = await Promise.all([
    $.session.usage().catch(() => undefined),
    readBranch($).catch(() => undefined),
    readSessionTitle($, transcript).catch(() => ({})),
  ])
  if (current !== revision) return

  transcript = metadata.cursor
  const limits = usage?.rateLimits ?? []
  const title = metadata.title?.replace(/[\s\u0000-\u001f\u007f-\u009f]+/g, ' ').trim()
  $.ui.status([
    formatContext(usage?.context),
    formatLimit('5h', limits.find(limit => limit.kind === 'five_hour'), resetTime),
    formatLimit('7d', limits.find(limit => limit.kind === 'seven_day'), resetDate),
    branch || '—',
    title || 'Untitled',
  ].join(' | '))
}

async function syncStatus($, event, next) {
  await refresh($)
  return next(event)
}

export function register(on) {
  on('session.start', syncStatus)
  on('session.attach', syncStatus)
  on('session.detach', syncStatus)
  on('session.measure', syncStatus)
  on('session.end', ($, event, next) => {
    revision += 1
    transcript = undefined
    clearStatus($)
    return next(event)
  })
  on('classic.SessionStart', ($, event, next) =>
    event.source === 'startup' ? next(event) : syncStatus($, event, next),
  )
}
