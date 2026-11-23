/**
 * Path helper tests.
 * @file Check folder settings, workspace folder matching, and how long paths are shortened.
 */

'use strict'

const assert = require('node:assert/strict')
const os = require('node:os')
const path = require('node:path')
const { test } = require('node:test')
const { isInWorkspace, resolveFolder, truncatePath } = require('../../src/files/paths')

test('matches sessions inside a workspace folder only', () => {
  assert.equal(isInWorkspace('/work/project', ['/work/project']), true)
  assert.equal(isInWorkspace('/work/project/packages/a', ['/work/project']), true)
  assert.equal(isInWorkspace('/work/project-two', ['/work/project']), false)
  assert.equal(isInWorkspace('/work', ['/work/project']), false)
  assert.equal(isInWorkspace(null, ['/work/project']), false)
})

test('shortens long paths in the middle, keeping the first and last folders', () => {
  assert.equal(truncatePath('~/work/project'), '~/work/project')
  assert.equal(
    truncatePath('~/Projects/Software/First-Party/Groups/CassidyDC/Packages/Repos/_statumo'),
    '~/…/CassidyDC/Packages/Repos/_statumo',
  )
  assert.equal(truncatePath('/Volumes/Data/very/deep/folder/structure/for/a/project'), '/Volumes/…/structure/for/a/project')
  assert.equal(truncatePath(`~/${'x'.repeat(60)}`, 20), `…${'x'.repeat(19)}`)
})

test('resolves a folder setting, then the environment, then the home folder', () => {
  assert.equal(resolveFolder(' /custom/claude ', '/env/claude', '.claude'), '/custom/claude')
  assert.equal(resolveFolder('', '/env/claude', '.claude'), '/env/claude')
  assert.equal(resolveFolder('~/claude', undefined, '.claude'), path.join(os.homedir(), 'claude'))
  assert.equal(resolveFolder(undefined, ' ', '.claude'), path.join(os.homedir(), '.claude'))
})
