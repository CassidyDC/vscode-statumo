/**
 * Claude Code command line.
 * @file Find Claude Code's command line and run its plugin commands, reading their JSON results.
 */

import { execFile } from 'node:child_process'
import { access, constants } from 'node:fs/promises'
import path from 'node:path'

/**
 * How long a Claude Code command may run before it's stopped, in milliseconds.
 * @type {number}
 */
const commandTimeoutMs = 120_000

/**
 * The result of one Claude Code command.
 * @typedef {object} CliResult
 * @property {string} stdout - What it printed.
 * @property {string} stderr - What it printed as errors.
 */

/**
 * Run a program and collect its output.
 * @param {string} file - The program.
 * @param {string[]} args - Its arguments.
 * @param {NodeJS.ProcessEnv} env - Its environment.
 * @returns {Promise<CliResult>} Its output.
 * @throws {Error} When it can't start, times out, or exits with an error, with the reason Claude Code gave when it gave one.
 */
function runFile(file, args, env) {
  return new Promise((resolve, reject) => {
    execFile(file, args, { env, timeout: commandTimeoutMs, windowsHide: true, maxBuffer: 4 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(describeFailure(String(stdout), String(stderr)) ?? error.message))
        return
      }

      resolve({ stdout: String(stdout), stderr: String(stderr) })
    })
  })
}

/**
 * Read the reason a failed command gave: the message in its last JSON line, or its last error line.
 * @param {string} stdout - What it printed.
 * @param {string} stderr - What it printed as errors.
 * @returns {string | null} The reason, or null when it gave none.
 */
function describeFailure(stdout, stderr) {
  /** The command's JSON result, when it printed one. */
  const result = parseLastJsonLine(stdout)
  if (typeof result?.message === 'string' && result.message) return result.message

  /** The last line it printed as an error. */
  const lastError = stderr.trim().split('\n').at(-1)?.trim()
  return lastError || null
}

/**
 * Parse the last line of output as JSON, where Claude Code's `--json` commands print their result.
 * @param {string} stdout - What the command printed.
 * @returns {any} The parsed result, or null when the last line isn't JSON.
 */
function parseLastJsonLine(stdout) {
  /** The last line with something on it. */
  const line = stdout.trim().split('\n').at(-1)?.trim()

  try {
    return line ? JSON.parse(line) : null
  } catch {
    return null
  }
}

/**
 * Check whether a file exists and can be run.
 * @param {string} file - The file.
 * @returns {Promise<boolean>} True when it can be run.
 */
async function isRunnable(file) {
  try {
    await access(file, constants.X_OK)
    return true
  } catch {
    return false
  }
}

/**
 * Find a Claude Code command line: the one the Claude Code extension ships, or `claude` on the PATH.
 * @param {object} options - Where to look.
 * @param {string | undefined} options.extensionPath - The Claude Code extension's folder, when it's installed.
 * @param {NodeJS.ProcessEnv} options.env - The environment to run `claude` in.
 * @returns {Promise<string | null>} The command line to run, or null when there's none.
 */
async function findClaudeCli({ extensionPath, env }) {
  if (extensionPath) {
    /** The command line inside the Claude Code extension. */
    const bundled = path.join(extensionPath, 'resources', 'native-binary', process.platform === 'win32' ? 'claude.exe' : 'claude')
    if (await isRunnable(bundled)) return bundled
  }

  try {
    await runFile('claude', ['--version'], env)
    return 'claude'
  } catch {
    return null
  }
}

/**
 * Run a Claude Code command with `--json` and parse its result: the whole output for a list, or the last line otherwise.
 * @param {string} cli - The command line to run.
 * @param {string[]} args - The command's arguments.
 * @param {NodeJS.ProcessEnv} env - The environment to run it in.
 * @returns {Promise<any>} The parsed result.
 * @throws {Error} When the command fails or prints something that isn't JSON.
 */
async function runClaudeJson(cli, args, env) {
  /** What the command printed. */
  const { stdout } = await runFile(cli, [...args, '--json'], env)

  try {
    return JSON.parse(stdout)
  } catch {
    /** The command's result on its last line. */
    const result = parseLastJsonLine(stdout)
    if (result === null) throw new Error(`Claude Code printed something unexpected for \`claude ${args.join(' ')}\`.`)
    return result
  }
}

export { findClaudeCli, parseLastJsonLine, runClaudeJson }
