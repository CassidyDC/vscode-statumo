/**
 * Usage mod installer.
 * @file Offer to install or update the Usage mod that ships with Statumo, and do it through Claude Code's command line once the user agrees.
 */

import { readFile } from 'node:fs/promises'
import path from 'node:path'
import * as vscode from 'vscode'
import { readSettings } from '../settings.js'
import { findClaudeCli, runClaudeJson } from './cli.js'
import { findInstalledMod, findMarketplaceFolder, isMarketplaceStale, modId, planModAction } from './plan.js'

/**
 * The Claude Code extension's id.
 * @type {string}
 */
const claudeExtensionId = 'anthropic.claude-code'

/**
 * The global state key that records the user asked not to be offered the mod again.
 * @type {string}
 */
const dontAskKey = 'statumo.claudeMod.dontAsk'

/**
 * The global state key that records when any window last offered the mod, so other windows don't offer it too.
 * @type {string}
 */
const offeredAtKey = 'statumo.claudeMod.offeredAt'

/**
 * How long to wait before offering the mod again after it was offered, in milliseconds.
 * @type {number}
 */
const offerIntervalMs = 86_400_000

/**
 * What Statumo found out about the Usage mod.
 * @typedef {object} ModState
 * @property {string} cli - The Claude Code command line to run.
 * @property {NodeJS.ProcessEnv} env - The environment to run it in.
 * @property {string} bundledVersion - The version that ships with Statumo.
 * @property {import('./plan.js').InstalledMod | null} installed - The installed mod, or null.
 * @property {'install' | 'update' | null} action - What to do, or null when the mod is current.
 * @property {boolean} isMarketplaceStale - Whether the `statumo` marketplace is added from another Statumo version's folder.
 */

/**
 * The environment to run Claude Code in: VS Code's own, pointed at the Claude config folder set in
 * Statumo's settings when there is one, so the mod goes where Statumo reads from.
 * @returns {NodeJS.ProcessEnv} The environment.
 */
function claudeEnv() {
  /** Whether Statumo's settings name a Claude config folder. */
  const isSet = String(vscode.workspace.getConfiguration('statumo').get('claude.configDirectory', '') ?? '').trim() !== ''
  return isSet ? { ...process.env, CLAUDE_CONFIG_DIR: readSettings().claudeDirectory } : { ...process.env }
}

/**
 * Find the folder of the Usage mod that ships with Statumo, which is also the `statumo` marketplace.
 * @param {vscode.ExtensionContext} context - Statumo's context.
 * @returns {string} The folder.
 */
function modFolder(context) {
  return path.join(context.extensionPath, 'claude-mod')
}

/**
 * Read the version of the Usage mod that ships with Statumo.
 * @param {string} folder - The mod's folder.
 * @returns {Promise<string>} The version.
 */
async function readBundledVersion(folder) {
  /** The mod's manifest. */
  const manifest = JSON.parse(await readFile(path.join(folder, '.claude-plugin', 'plugin.json'), 'utf8'))
  return String(manifest.version)
}

/**
 * Find Claude Code's command line and ask it which version of the Usage mod is installed.
 * @param {vscode.ExtensionContext} context - Statumo's context.
 * @returns {Promise<ModState | null>} What Statumo found, or null when there's no Claude Code command line.
 */
async function inspectMod(context) {
  /** The environment to run Claude Code in, and its command line. */
  const env = claudeEnv()
  const cli = await findClaudeCli({ extensionPath: vscode.extensions.getExtension(claudeExtensionId)?.extensionPath, env })

  if (!cli) return null

  /** The version that ships with Statumo, the installed mod, and the folder the marketplace reads from. */
  const bundledVersion = await readBundledVersion(modFolder(context))
  const installed = findInstalledMod(await runClaudeJson(cli, ['plugin', 'list'], env))
  const marketplaceFolder = findMarketplaceFolder(await runClaudeJson(cli, ['plugin', 'marketplace', 'list'], env))

  return {
    cli,
    env,
    bundledVersion,
    installed,
    action: planModAction(installed, bundledVersion),
    isMarketplaceStale: isMarketplaceStale(marketplaceFolder, modFolder(context)),
  }
}

/**
 * Run one Claude Code plugin command, failing when its result isn't `ok`.
 * @param {ModState} state - The command line and environment.
 * @param {string[]} args - The command's arguments.
 * @returns {Promise<void>} Resolves once the command succeeds.
 * @throws {Error} When the command fails.
 */
async function runPluginCommand(state, args) {
  /** The command's result. */
  const result = await runClaudeJson(state.cli, args, state.env)
  if (result?.outcome && result.outcome !== 'ok') throw new Error(String(result.message ?? `\`claude ${args.join(' ')}\` didn't finish.`))
}

/**
 * Add the `statumo` marketplace again from the copy of the mod that ships with this version of
 * Statumo when it's added from another version's folder, which VS Code deletes once Statumo updates.
 * The installed mod is unchanged, so this runs without asking and only logs the outcome.
 * @param {vscode.ExtensionContext} context - Statumo's context.
 * @param {ModState} state - What Statumo found.
 * @param {vscode.LogOutputChannel} log - Statumo's log.
 * @returns {Promise<void>} Resolves once the marketplace is added again, or the failure logged.
 */
async function repointMarketplace(context, state, log) {
  if (!state.isMarketplaceStale) return

  try {
    await runPluginCommand(state, ['plugin', 'marketplace', 'add', modFolder(context)])
    log.info(`Pointed the Statumo marketplace at ${modFolder(context)}.`)
  } catch (error) {
    log.warn(`Couldn't point the Statumo marketplace at ${modFolder(context)}: ${error instanceof Error ? error.message : String(error)}`)
  }
}

/**
 * Install or update the Usage mod: point the `statumo` marketplace at the copy that ships with this
 * version of Statumo, then install or update the mod from it, showing progress as it goes.
 * @param {vscode.ExtensionContext} context - Statumo's context.
 * @param {ModState} state - What Statumo found.
 * @param {vscode.LogOutputChannel} log - Statumo's log.
 * @returns {Promise<void>} Resolves once the mod is installed or the failure is shown.
 */
async function applyModAction(context, state, log) {
  /** Whether this installs or updates the mod. */
  const isInstall = state.action === 'install'

  try {
    await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: `${isInstall ? 'Installing' : 'Updating'} the Usage mod for Claude Code` },
      async progress => {
        progress.report({ message: 'Adding the Statumo marketplace…' })
        await runPluginCommand(state, ['plugin', 'marketplace', 'add', modFolder(context)])
        progress.report({ message: isInstall ? 'Installing the mod…' : 'Updating the mod…' })
        await runPluginCommand(state, ['plugin', isInstall ? 'install' : 'update', modId, '--scope', state.installed?.scope ?? 'user'])
      },
    )
  } catch (error) {
    /** Why it failed. */
    const reason = error instanceof Error ? error.message : String(error)

    log.error(`Couldn't ${isInstall ? 'install' : 'update'} the Usage mod: ${reason}`)

    /** The button the user chose. */
    const choice = await vscode.window.showErrorMessage(`Statumo couldn't ${isInstall ? 'install' : 'update'} the Usage mod for Claude Code: ${reason}`, 'Show Log')
    if (choice === 'Show Log') log.show()
    return
  }

  log.info(`${isInstall ? 'Installed' : 'Updated'} the Usage mod ${state.bundledVersion}.`)
  void vscode.window.showInformationMessage(`${isInstall ? 'Installed' : 'Updated'} the Usage mod for Claude Code. New Claude Code sessions will report usage to Statumo; restart any that are running.`)
}

/**
 * Offer to install or update the Usage mod when it's missing or older than the copy that ships with
 * Statumo, unless the user turned the offer off, the Claude Code item is hidden, or another window
 * offered it in the last day.
 * @param {vscode.ExtensionContext} context - Statumo's context.
 * @param {vscode.LogOutputChannel} log - Statumo's log.
 * @returns {Promise<void>} Resolves once the offer is answered or skipped.
 */
async function offerClaudeMod(context, log) {
  if (context.globalState.get(dontAskKey, false)) return

  if (!vscode.workspace.getConfiguration('statumo').get('claude.enabled', true)) return

  if (Date.now() - context.globalState.get(offeredAtKey, 0) < offerIntervalMs) return

  /** What Statumo found out about the mod. */
  let state

  try {
    state = await inspectMod(context)
  } catch (error) {
    log.warn(`Couldn't check the Usage mod: ${error instanceof Error ? error.message : String(error)}`)
    return
  }

  if (!state) {
    log.info('Claude Code\'s command line wasn\'t found, so Statumo can\'t offer to install the Usage mod.')
    return
  }

  if (!state.action) {
    await repointMarketplace(context, state, log)
    return
  }

  await context.globalState.update(offeredAtKey, Date.now())

  /** The offer's message and its main button. */
  const message = state.action === 'install'
    ? 'Statumo needs the Usage mod for Claude Code to show Claude\'s context and rate limits. Install it?'
    : `A newer Usage mod for Claude Code ships with Statumo (${state.bundledVersion}; you have ${state.installed?.version}). Update it?`
  const accept = state.action === 'install' ? 'Install' : 'Update'

  /** The button the user chose. */
  const choice = await vscode.window.showInformationMessage(message, accept, 'Not Now', 'Don\'t Ask Again')

  if (choice === accept) await applyModAction(context, state, log)
  else if (choice === 'Don\'t Ask Again') await context.globalState.update(dontAskKey, true)
}

/**
 * Install or update the Usage mod on request, or say it's current.
 * @param {vscode.ExtensionContext} context - Statumo's context.
 * @param {vscode.LogOutputChannel} log - Statumo's log.
 * @returns {Promise<void>} Resolves once the mod is installed or the outcome is shown.
 */
async function installClaudeMod(context, log) {
  /** What Statumo found out about the mod. */
  let state

  try {
    state = await inspectMod(context)
  } catch (error) {
    void vscode.window.showErrorMessage(`Statumo couldn't check the Usage mod for Claude Code: ${error instanceof Error ? error.message : String(error)}`)
    return
  }

  if (!state) {
    void vscode.window.showErrorMessage('Statumo couldn\'t find Claude Code\'s command line. Install Claude Code, then try again.')
    return
  }

  if (!state.action) {
    await repointMarketplace(context, state, log)
    void vscode.window.showInformationMessage(`The Usage mod for Claude Code is up to date (${state.installed?.version}).`)
    return
  }

  await applyModAction(context, state, log)
}

export { installClaudeMod, offerClaudeMod }
