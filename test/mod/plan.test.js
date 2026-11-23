/**
 * Usage mod plan tests.
 * @file Check how versions compare, how the installed mod and its marketplace are found in Claude Code's lists, and when Statumo offers to install or update it.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parseLastJsonLine } from '../../src/mod/cli.js'
import { compareVersions, findInstalledMod, findMarketplaceFolder, isMarketplaceStale, planModAction } from '../../src/mod/plan.js'

test('compares versions part by part', () => {
  assert.ok(compareVersions('0.2.0', '0.3.0') < 0)
  assert.ok(compareVersions('0.10.0', '0.9.9') > 0)
  assert.ok(compareVersions('1.0', '1.0.1') < 0)
  assert.equal(compareVersions('0.3.0', '0.3.0'), 0)
  assert.equal(compareVersions('0.3.0-beta', '0.3.0'), 0)
})

test('finds the Usage mod in Claude Code\'s plugin list', () => {
  /** A plugin list with the mod and another plugin. */
  const plugins = [
    { id: 'swift-lsp@claude-plugins-official', version: '1.0.0', scope: 'user' },
    { id: 'usage@statumo', version: '0.2.0', scope: 'user', enabled: true },
  ]

  assert.deepEqual(findInstalledMod(plugins), { version: '0.2.0', scope: 'user' })
  assert.equal(findInstalledMod([]), null)
  assert.equal(findInstalledMod({ error: 'not a list' }), null)
})

test('finds the folder the statumo marketplace reads from', () => {
  /** A marketplace list with the statumo folder and a GitHub marketplace. */
  const marketplaces = [
    { name: 'claude-plugins-official', source: 'github', repo: 'anthropics/claude-plugins-official' },
    { name: 'statumo', source: 'directory', path: '/ext/jacobcassidy.statumo-0.1.0/claude-mod' },
  ]

  assert.equal(findMarketplaceFolder(marketplaces), '/ext/jacobcassidy.statumo-0.1.0/claude-mod')
  assert.equal(findMarketplaceFolder(marketplaces.slice(0, 1)), null)
  assert.equal(findMarketplaceFolder({ error: 'not a list' }), null)
})

test('points the marketplace at this version\'s folder only when it reads from another one', () => {
  assert.equal(isMarketplaceStale('/ext/jacobcassidy.statumo-0.1.0/claude-mod', '/ext/jacobcassidy.statumo-0.1.1/claude-mod'), true)
  assert.equal(isMarketplaceStale('/ext/jacobcassidy.statumo-0.1.1/claude-mod/', '/ext/jacobcassidy.statumo-0.1.1/claude-mod'), false)
  assert.equal(isMarketplaceStale(null, '/ext/jacobcassidy.statumo-0.1.1/claude-mod'), false)
})

test('installs a missing mod, updates an older one, and leaves a current one alone', () => {
  assert.equal(planModAction(null, '0.3.0'), 'install')
  assert.equal(planModAction({ version: '0.2.0', scope: 'user' }, '0.3.0'), 'update')
  assert.equal(planModAction({ version: '0.3.0', scope: 'user' }, '0.3.0'), null)
  assert.equal(planModAction({ version: '0.4.0', scope: 'user' }, '0.3.0'), null)
})

test('reads a command\'s JSON result from its last line', () => {
  assert.deepEqual(parseLastJsonLine('Adding…\n{"command":"install","outcome":"ok"}\n'), { command: 'install', outcome: 'ok' })
  assert.equal(parseLastJsonLine('not json'), null)
  assert.equal(parseLastJsonLine(''), null)
})
