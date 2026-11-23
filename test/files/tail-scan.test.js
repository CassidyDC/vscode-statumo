/**
 * Tail scanner tests.
 * @file Check first scans of a file's tail, scans of appended lines, and rescans after a file shrinks.
 */

import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { after, before, test } from 'node:test'
import { createTailScanner } from '../../src/files/tail-scan.js'

/**
 * The temporary folder the fixtures live in.
 * @type {string}
 */
let root

before(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'statumo-tail-'))
})

after(async () => {
  await fs.rm(root, { recursive: true, force: true })
})

/**
 * Create a scanner that collects every line it reads and settles once it has read a `mark` line.
 * @param {object} [options] - How far back to read.
 * @param {number} [options.tailLength] - Bytes read from the end on a first scan.
 * @param {number} [options.maxTailLength] - The most bytes a first scan reads.
 * @returns {{ scanner: import('../../src/files/tail-scan.js').TailScanner<string[]>, reads: string[][] }} The scanner, and the lines each fold was given.
 */
function collector({ tailLength = 1024, maxTailLength = 1024 * 1024 } = {}) {
  /** The lines each fold was given. */
  const reads = []

  /** The scanner under test. */
  const scanner = createTailScanner({
    tailLength,
    maxTailLength,
    initial: [],

    /**
     * Record the lines, then add them to the state.
     * @param {string[]} lines - The lines read.
     * @param {string[]} state - The lines so far.
     * @returns {string[]} Every line read.
     */
    fold: (lines, state) => {
      reads.push(lines)
      return [...state, ...lines]
    },

    /**
     * Whether the state has a `mark` line.
     * @param {string[]} state - The lines so far.
     * @returns {boolean} True once a `mark` line was read.
     */
    isSettled: state => state.includes('mark'),
  })

  return { scanner, reads }
}

/**
 * Stat a file for the scanner.
 * @param {string} filePath - The file.
 * @returns {Promise<{ size: number, mtimeMs: number }>} The file's size and modified time.
 */
async function stat(filePath) {
  /** The file's stats. */
  const { size, mtimeMs } = await fs.stat(filePath)
  return { size, mtimeMs }
}

test('reads the tail on a first scan, further back until settled', async () => {
  /** The file, and the scanner under test with a short tail. */
  const filePath = path.join(root, 'first.jsonl')
  const { scanner, reads } = collector({ tailLength: 16 })

  await fs.writeFile(filePath, `mark\n${'filler-line\n'.repeat(4)}`)

  /** The first scan's state. */
  const state = await scanner.scan(filePath, await stat(filePath))

  assert.deepEqual(state, ['mark', 'filler-line', 'filler-line', 'filler-line', 'filler-line'])
  assert.ok(reads.length > 1)
})

test('stops reading back at the longest tail', async () => {
  /** The file, and the scanner under test with a capped tail. */
  const filePath = path.join(root, 'capped.jsonl')
  const { scanner } = collector({ tailLength: 16, maxTailLength: 32 })

  await fs.writeFile(filePath, `mark\n${'filler-line\n'.repeat(8)}`)

  assert.equal((await scanner.scan(filePath, await stat(filePath))).includes('mark'), false)
})

test('reads only appended complete lines, and reuses an unchanged file', async () => {
  /** The file, and the scanner under test. */
  const filePath = path.join(root, 'appended.jsonl')
  const { scanner, reads } = collector()

  await fs.writeFile(filePath, 'mark\none\n')
  await scanner.scan(filePath, await stat(filePath))
  await fs.appendFile(filePath, 'two\nthree')

  assert.deepEqual(await scanner.scan(filePath, await stat(filePath)), ['mark', 'one', 'two'])
  assert.deepEqual(reads.at(-1), ['two'])

  await fs.appendFile(filePath, '\n')

  assert.deepEqual(await scanner.scan(filePath, await stat(filePath)), ['mark', 'one', 'two', 'three'])

  /** How many folds ran before scanning the unchanged file. */
  const foldCount = reads.length

  await scanner.scan(filePath, await stat(filePath))

  assert.equal(reads.length, foldCount)
})

test('reads at most the longest tail of what was appended, keeping the earlier state', async () => {
  /** The file, and the scanner under test with a capped tail. */
  const filePath = path.join(root, 'grown.jsonl')
  const { scanner, reads } = collector({ tailLength: 16, maxTailLength: 32 })

  await fs.writeFile(filePath, 'mark\n')
  await scanner.scan(filePath, await stat(filePath))
  await fs.appendFile(filePath, `${'skipped-line\n'.repeat(8)}last-line\n`)

  assert.deepEqual(await scanner.scan(filePath, await stat(filePath)), ['mark', 'skipped-line', 'last-line'])
  assert.deepEqual(reads.at(-1), ['skipped-line', 'last-line'])
})

test('rescans the tail after a file shrinks', async () => {
  /** The file, and the scanner under test. */
  const filePath = path.join(root, 'shrunk.jsonl')
  const { scanner } = collector()

  await fs.writeFile(filePath, 'mark\none\ntwo\n')
  await scanner.scan(filePath, await stat(filePath))
  await fs.writeFile(filePath, 'mark\n')

  assert.deepEqual(await scanner.scan(filePath, await stat(filePath)), ['mark'])
})
