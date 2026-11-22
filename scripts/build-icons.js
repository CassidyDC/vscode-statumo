/**
 * Icon font build.
 * @file Turn the brand logos in `images/logos/` and the generated progress rings into the icon font the status bar items draw.
 */

'use strict'

const fs = require('node:fs')
const path = require('node:path')
const { Readable } = require('node:stream')
const svg2ttf = require('svg2ttf')
const ttf2woff = require('ttf2woff')
const { ringIconId, ringKinds, ringSteps } = require('../src/rings')

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
 * The first code point of the ring glyphs; each kind gets a block of 32.
 * @type {number}
 */
const ringCodePointBase = 0xe100

/**
 * One point of an outline, in the 16-unit ring grid.
 * @typedef {[number, number]} Point
 */

/**
 * One glyph to put in the font.
 * @typedef {object} Glyph
 * @property {string} id - The icon id in `contributes.icons`.
 * @property {string} description - The icon's description.
 * @property {number} codePoint - The glyph's code point.
 * @property {Buffer} svg - The glyph's SVG.
 */

/**
 * Format a number for path data.
 * @param {number} value - The number.
 * @returns {string} The number with at most three decimals.
 */
function num(value) {
  return String(Math.round(value * 1000) / 1000)
}

/**
 * Twice the signed area of a polygon; positive when it runs clockwise on screen.
 * @param {Point[]} points - The polygon's corners.
 * @returns {number} The signed area.
 */
function signedArea(points) {
  return points.reduce((sum, [x, y], index) => {
    const [nextX, nextY] = points[(index + 1) % points.length]

    return sum + x * nextY - nextX * y
  }, 0)
}

/**
 * Outline a polygon, running clockwise for a fill or counterclockwise for a hole.
 * @param {Point[]} points - The polygon's corners.
 * @param {boolean} [isHole] - Whether the polygon cuts a hole.
 * @returns {string} The path data.
 */
function polygon(points, isHole = false) {
  const isClockwise = signedArea(points) > 0
  const ordered = isClockwise === isHole ? [...points].reverse() : points

  return `M${ordered.map(([x, y]) => `${num(x)} ${num(y)}`).join('L')}Z`
}

/**
 * Outline a circle as two half arcs, clockwise for a fill or counterclockwise for a hole.
 * @param {number} radius - The circle's radius.
 * @param {boolean} [isHole] - Whether the circle cuts a hole.
 * @returns {string} The path data.
 */
function circle(radius, isHole = false) {
  const sweep = isHole ? 0 : 1
  const arc = `A${num(radius)} ${num(radius)} 0 0 ${sweep}`

  return `M8 ${num(8 - radius)}${arc} 8 ${num(8 + radius)}${arc} 8 ${num(8 - radius)}Z`
}

/**
 * Outline a ring between two radii.
 * @param {number} outer - The outer radius.
 * @param {number} inner - The inner radius.
 * @returns {string} The path data.
 */
function annulus(outer, inner) {
  return circle(outer) + circle(inner, true)
}

/**
 * The point at an angle on a circle around the grid's center, measured clockwise from 12 o'clock.
 * @param {number} radius - The circle's radius.
 * @param {number} turns - The angle as a fraction of a full turn.
 * @returns {Point} The point.
 */
function pointAt(radius, turns) {
  const angle = turns * 2 * Math.PI

  return [8 + radius * Math.sin(angle), 8 - radius * Math.cos(angle)]
}

/**
 * Outline the filled part of a ring, clockwise from 12 o'clock.
 * @param {number} outer - The outer radius.
 * @param {number} inner - The inner radius.
 * @param {number} fraction - How much of the ring to fill, from 0 to 1.
 * @returns {string} The path data, or an empty string when nothing is filled.
 */
function arcBand(outer, inner, fraction) {
  if (fraction <= 0) return ''
  if (fraction >= 1) return annulus(outer, inner)

  const large = fraction > 0.5 ? 1 : 0
  const [outerEndX, outerEndY] = pointAt(outer, fraction)
  const [innerEndX, innerEndY] = pointAt(inner, fraction)

  return [
    `M8 ${num(8 - outer)}`,
    `A${num(outer)} ${num(outer)} 0 ${large} 1 ${num(outerEndX)} ${num(outerEndY)}`,
    `L${num(innerEndX)} ${num(innerEndY)}`,
    `A${num(inner)} ${num(inner)} 0 ${large} 0 8 ${num(8 - inner)}Z`,
  ].join('')
}

/**
 * Outline a straight bar between two points.
 * @param {Point} from - One end.
 * @param {Point} to - The other end.
 * @param {number} width - The bar's width.
 * @returns {string} The path data.
 */
function bar([fromX, fromY], [toX, toY], width) {
  const length = Math.hypot(toX - fromX, toY - fromY)
  const offsetX = (-(toY - fromY) / length) * (width / 2)
  const offsetY = ((toX - fromX) / length) * (width / 2)

  return polygon([
    [fromX + offsetX, fromY + offsetY],
    [toX + offsetX, toY + offsetY],
    [toX - offsetX, toY - offsetY],
    [fromX - offsetX, fromY - offsetY],
  ])
}

/**
 * Outline a rectangle.
 * @param {number} x - The left edge.
 * @param {number} y - The top edge.
 * @param {number} width - The width.
 * @param {number} height - The height.
 * @param {boolean} [isHole] - Whether the rectangle cuts a hole.
 * @returns {string} The path data.
 */
function rect(x, y, width, height, isHole = false) {
  return polygon([[x, y], [x + width, y], [x + width, y + height], [x, y + height]], isHole)
}

/**
 * The symbols drawn inside each ring, as path data in the 16-unit grid.
 * @type {Record<'layers' | 'clock' | 'calendar', string>}
 */
const symbols = {
  layers: [
    polygon([[8, 4.1], [11.6, 5.9], [8, 7.7], [4.4, 5.9]]),
    polygon([[4.4, 7.1], [8, 8.9], [11.6, 7.1], [11.6, 8], [8, 9.8], [4.4, 8]]),
    polygon([[4.4, 9.2], [8, 11], [11.6, 9.2], [11.6, 10.1], [8, 11.9], [4.4, 10.1]]),
  ].join(''),
  clock: [
    annulus(4.3, 3.4),
    bar([8, 8.45], [8, 5.6], 0.9),
    bar([7.7, 7.7], [10, 9.6], 0.9),
  ].join(''),
  calendar: [
    rect(4.3, 4.9, 7.4, 6.9),
    rect(5.2, 7.1, 5.6, 3.8, true),
    rect(5.4, 3.9, 0.9, 1.6),
    rect(9.7, 3.9, 0.9, 1.6),
    ...[5.9, 7.5, 9.1].flatMap(x => [rect(x, 7.75, 1, 1), rect(x, 9.35, 1, 1)]),
  ].join(''),
}

/**
 * Draw one ring glyph: a thin track, the filled arc over it, and the kind's symbol inside.
 * @param {'layers' | 'clock' | 'calendar'} symbol - The symbol inside the ring.
 * @param {number} step - How full the ring is, in percent.
 * @returns {string} The glyph's SVG.
 */
function ringSvg(symbol, step) {
  const d = annulus(7.2, 6.8) + arcBand(7.85, 6.15, step / 100) + symbols[symbol]

  return `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16"><path d="${d}"/></svg>`
}

/**
 * Every glyph in the font: the brand logos, then each ring kind at each step.
 * @returns {Glyph[]} The glyphs.
 */
function collectGlyphs() {
  const logos = [
    { name: 'claude', description: 'Claude logo', codePoint: 0xe001 },
    { name: 'codex', description: 'OpenAI Codex logo', codePoint: 0xe002 },
  ].map(({ name, description, codePoint }) => ({
    id: `statumo-${name}`,
    description,
    codePoint,
    svg: fs.readFileSync(path.join(root, 'images', 'logos', `${name}.svg`)),
  }))

  const rings = ringKinds.flatMap(({ kind, symbol, description }, kindIndex) => ringSteps.map((step, stepIndex) => ({
    id: ringIconId(kind, step),
    description: `${description} at ${step}%`,
    codePoint: ringCodePointBase + kindIndex * 0x20 + stepIndex,
    svg: Buffer.from(ringSvg(symbol, step)),
  })))

  return [...logos, ...rings]
}

/**
 * Build the SVG font from the glyphs.
 * @param {Glyph[]} glyphs - The glyphs.
 * @returns {Promise<string>} The SVG font's text.
 */
async function buildSvgFont(glyphs) {
  const { SVGIcons2SVGFontStream } = await import('svgicons2svgfont')
  const stream = new SVGIcons2SVGFontStream({
    fontName: 'statumo-icons',
    fontHeight: 1000,
    normalize: true,
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

  for (const { id, codePoint, svg } of glyphs) {
    const glyph = Readable.from([svg])

    glyph.metadata = { name: id, unicode: [String.fromCodePoint(codePoint)] }
    stream.write(glyph)
  }

  stream.end()

  return done
}

/**
 * Point `contributes.icons` in `package.json` at the glyphs.
 * @param {Glyph[]} glyphs - The glyphs.
 */
function writeManifestIcons(glyphs) {
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
