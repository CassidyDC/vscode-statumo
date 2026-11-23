/**
 * Usage mod plan.
 * @file Decide whether the Usage mod that ships with Statumo should be installed or updated, and whether its marketplace points at an old folder, from what Claude Code lists.
 */

import path from 'node:path'

/**
 * The name of the marketplace the Usage mod's folder serves as.
 * @type {string}
 */
const marketplaceName = 'statumo'

/**
 * The Usage mod's id in Claude Code: the plugin's name, then the marketplace's.
 * @type {string}
 */
const modId = `usage@${marketplaceName}`

/**
 * The Usage mod as Claude Code lists it.
 * @typedef {object} InstalledMod
 * @property {string} version - The installed version.
 * @property {string} scope - Where it's installed, such as `user`.
 */

/**
 * Compare two dotted version numbers, such as `0.3.0`, part by part, ignoring anything after a hyphen.
 * @param {string} left - One version.
 * @param {string} right - The other version.
 * @returns {number} Below 0 when the left is older, above 0 when it's newer, or 0 when they match.
 */
function compareVersions(left, right) {
  /**
   * Split a version into its numeric parts.
   * @param {string} version - The version.
   * @returns {number[]} The parts, with any that aren't numbers as 0.
   */
  const parts = version => version.split('-')[0].split('.').map(part => Number.parseInt(part, 10) || 0)

  /** Each version's parts. */
  const [a, b] = [parts(left), parts(right)]

  for (let index = 0; index < Math.max(a.length, b.length); index++) {
    /** How the two parts at this position compare. */
    const difference = (a[index] ?? 0) - (b[index] ?? 0)
    if (difference) return difference
  }

  return 0
}

/**
 * Find the Usage mod in the plugins `claude plugin list --json` printed.
 * @param {unknown} plugins - The parsed list.
 * @returns {InstalledMod | null} The installed mod, or null when it isn't installed.
 */
function findInstalledMod(plugins) {
  if (!Array.isArray(plugins)) return null

  /** The mod's entry. */
  const entry = plugins.find(plugin => plugin?.id === modId)
  if (!entry) return null
  return { version: String(entry.version ?? '0'), scope: String(entry.scope ?? 'user') }
}

/**
 * Find the folder the `statumo` marketplace reads from in what `claude plugin marketplace list --json` printed.
 * @param {unknown} marketplaces - The parsed list.
 * @returns {string | null} The marketplace's folder, or null when it isn't added or isn't a folder.
 */
function findMarketplaceFolder(marketplaces) {
  if (!Array.isArray(marketplaces)) return null

  /** The marketplace's entry. */
  const entry = marketplaces.find(marketplace => marketplace?.name === marketplaceName)
  return typeof entry?.path === 'string' && entry.path ? entry.path : null
}

/**
 * Whether the `statumo` marketplace should be added again from the copy of the mod that ships with
 * this version of Statumo. Each Statumo version installs to its own folder and VS Code deletes the
 * old one, so a marketplace added by an older version points at a folder that's gone.
 * @param {string | null} marketplaceFolder - The folder the marketplace reads from, or null when it isn't added.
 * @param {string} bundledFolder - The folder of the mod that ships with Statumo.
 * @returns {boolean} True when the marketplace is added from another folder.
 */
function isMarketplaceStale(marketplaceFolder, bundledFolder) {
  return marketplaceFolder !== null && path.resolve(marketplaceFolder) !== path.resolve(bundledFolder)
}

/**
 * Decide what to do with the Usage mod: install it when it's missing, update it when the copy that
 * ships with Statumo is newer, or nothing.
 * @param {InstalledMod | null} installed - The installed mod, or null.
 * @param {string} bundledVersion - The version that ships with Statumo.
 * @returns {'install' | 'update' | null} The action, or null when the mod is current.
 */
function planModAction(installed, bundledVersion) {
  if (!installed) return 'install'
  return compareVersions(installed.version, bundledVersion) < 0 ? 'update' : null
}

export { compareVersions, findInstalledMod, findMarketplaceFolder, isMarketplaceStale, modId, planModAction }
