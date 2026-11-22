/**
 * Icon font build.
 * @file Turn the brand logos in `images/logos/` into the icon font the status bar items draw.
 */

'use strict'

const fs = require('node:fs')
const path = require('node:path')
const { Readable } = require('node:stream')
const svg2ttf = require('svg2ttf')
const ttf2woff = require('ttf2woff')

/**
 * The repository's root folder.
 * @type {string}
 */
const root = path.join(__dirname, '..')

/**
 * The glyphs to build, each with the code point `package.json` names in `contributes.icons`.
 * @type {Array<{ name: string, codePoint: number }>}
 */
const glyphs = [
  { name: 'claude', codePoint: 0xe001 },
  { name: 'codex', codePoint: 0xe002 },
]

/**
 * The built font's path.
 * @type {string}
 */
const output = path.join(root, 'images', 'statumo-icons.woff')

/**
 * Build the SVG font from the logo files.
 * @returns {Promise<string>} The SVG font's text.
 */
async function buildSvgFont() {
  const { SVGIcons2SVGFontStream } = await import('svgicons2svgfont')
  const stream = new SVGIcons2SVGFontStream({
    fontName: 'statumo-icons',
    fontHeight: 1000,
    normalize: true,
    centerHorizontally: true,
    log: () => {},
  })
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

  for (const { name, codePoint } of glyphs) {
    const glyph = Readable.from([fs.readFileSync(path.join(root, 'images', 'logos', `${name}.svg`))])

    glyph.metadata = { name, unicode: [String.fromCodePoint(codePoint)] }
    stream.write(glyph)
  }

  stream.end()
  return done
}

/**
 * Build the icon font and write it as WOFF.
 * @returns {Promise<void>} Resolves once the font is written.
 */
async function main() {
  const ttf = svg2ttf(await buildSvgFont(), { ts: 0 })
  const woff = ttf2woff(Buffer.from(ttf.buffer))

  fs.writeFileSync(output, Buffer.from(woff.buffer ?? woff))
  console.log(`Wrote ${path.relative(root, output)} with ${glyphs.length} glyphs.`)
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
})
