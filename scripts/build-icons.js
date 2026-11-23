/**
 * Icon font build.
 * @file Build the ring glyphs into the icon font the status bar items use, and register its icons in the manifest.
 */

'use strict'

const fs = require('node:fs')
const path = require('node:path')
const { Readable } = require('node:stream')
const svg2ttf = require('svg2ttf')
const ttf2woff = require('ttf2woff')
const { collectGlyphs } = require('./icons/glyphs')

/**
 * The repository's root folder.
 * @type {string}
 */
const root = path.join(__dirname, '..')

/**
 * The built font's path.
 * @type {string}
 */
const output = path.join(root, 'images', 'statumo-icons.woff')

/**
 * The extension manifest, whose `contributes.icons` this script rewrites.
 * @type {string}
 */
const manifestPath = path.join(root, 'package.json')

/**
 * Build the SVG font from the glyphs.
 * @param {import('./icons/glyphs').Glyph[]} glyphs - The glyphs.
 * @returns {Promise<string>} The SVG font's text.
 */
async function buildSvgFont(glyphs) {
  /** The font stream's class. */
  const { SVGIcons2SVGFontStream } = await import('svgicons2svgfont')

  /** The font stream. */
  const stream = new SVGIcons2SVGFontStream({
    fontName: 'statumo-icons',
    fontHeight: 1000,
    normalize: true,

    /**
     * Discard the stream's progress messages.
     * @returns {void}
     */
    log: () => {},
  })

  /** The font's text so far. */
  const chunks = []

  /**
   * Resolves with the font once the stream ends.
   * @type {Promise<string>}
   */
  const done = new Promise((resolve, reject) => {
    stream.on('data', chunk => chunks.push(chunk))
    stream.on('end', () => resolve(chunks.map(String).join('')))
    stream.on('error', reject)
  })

  for (const { id, codePoint, svg } of glyphs) {
    /** The glyph's SVG as a stream. */
    const glyph = Readable.from([svg])
    glyph.metadata = { name: id, unicode: [String.fromCodePoint(codePoint)] }
    stream.write(glyph)
  }

  stream.end()

  return done
}

/**
 * Point `contributes.icons` in `package.json` at the glyphs.
 * @param {import('./icons/glyphs').Glyph[]} glyphs - The glyphs.
 * @returns {void}
 */
function writeManifestIcons(glyphs) {
  /** The manifest, and the font's path relative to it. */
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
  const fontPath = `./${path.relative(root, output)}`

  manifest.contributes.icons = Object.fromEntries(glyphs.map(({ id, description, codePoint }) => [
    id,
    { description, default: { fontPath, fontCharacter: `\\${codePoint.toString(16).toUpperCase()}` } },
  ]))

  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
}

/**
 * Build the icon font, write it as WOFF, and register its icons.
 * @returns {Promise<void>} Resolves once the font and manifest are written.
 */
async function main() {
  /** The glyphs, and the font built from them as TrueType and as WOFF. */
  const glyphs = collectGlyphs()
  const ttf = svg2ttf(await buildSvgFont(glyphs), { ts: 0 })
  const woff = ttf2woff(Buffer.from(ttf.buffer))
  fs.writeFileSync(output, Buffer.from(woff.buffer ?? woff))
  writeManifestIcons(glyphs)
  console.log(`Wrote ${path.relative(root, output)} with ${glyphs.length} glyphs and updated package.json icons.`)
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
})
