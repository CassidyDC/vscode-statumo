/**
 * Cached JSON reader tests.
 * @file Check that unchanged files are reused, broken or rejected files keep the last good value, and missing files read as null.
 */

'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')
const { after, before, test } = require('node:test')
const { createCachedJson } = require('../../src/files/cached-json')

/**
 * The temporary folder the fixtures live in.
 * @type {string}
 */
let root

before(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'statumo-json-'))
})

after(async () => {
  await fs.rm(root, { recursive: true, force: true })
})

test('reuses an unchanged file without converting it again', async () => {
  /** The file, and how many times the converter ran. */
  const filePath = path.join(root, 'unchanged.json')
  let conversions = 0

  /** The reader under test, counting conversions. */
  const reader = createCachedJson(data => {
    conversions += 1
    return data.value
  })

  await fs.writeFile(filePath, JSON.stringify({ value: 'first' }))

  /** The first reading, and the file's stats. */
  const first = await reader.read(filePath)
  const stats = await fs.stat(filePath)

  assert.deepEqual(first, { value: 'first', mtimeMs: stats.mtimeMs })
  assert.equal(await reader.read(filePath), first)
  assert.equal(conversions, 1)
})

test('keeps the last good value while a file is broken or rejected', async () => {
  /** The file, and the reader under test, which rejects values that aren't strings. */
  const filePath = path.join(root, 'broken.json')
  const reader = createCachedJson(data => (typeof data.value === 'string' ? data.value : undefined))

  await fs.writeFile(filePath, JSON.stringify({ value: 'good' }))

  /** The good reading. */
  const good = await reader.read(filePath)

  await fs.writeFile(filePath, '{"value": "go')

  assert.deepEqual(await reader.read(filePath), good)

  await fs.writeFile(filePath, JSON.stringify({ value: 42 }))

  assert.deepEqual(await reader.read(filePath), good)

  await fs.writeFile(filePath, JSON.stringify({ value: 'better' }))

  assert.equal((await reader.read(filePath)).value, 'better')
})

test('reads a missing file, or one never valid, as null', async () => {
  /** A broken file, and the reader under test. */
  const filePath = path.join(root, 'never-valid.json')
  const reader = createCachedJson(data => data)

  assert.equal(await reader.read(path.join(root, 'missing.json')), null)

  await fs.writeFile(filePath, '{')

  assert.equal(await reader.read(filePath), null)
})

test('forgets files not retained', async () => {
  /** Two files, and how many times the converter ran. */
  const keptPath = path.join(root, 'kept.json')
  const droppedPath = path.join(root, 'dropped.json')
  let conversions = 0

  /** The reader under test, counting conversions. */
  const reader = createCachedJson(data => {
    conversions += 1
    return data
  })

  await fs.writeFile(keptPath, '1')
  await fs.writeFile(droppedPath, '2')
  await reader.read(keptPath)
  await reader.read(droppedPath)
  reader.retain([keptPath])
  await reader.read(keptPath)
  await reader.read(droppedPath)

  assert.equal(conversions, 3)
})
