/**
 * Ring glyphs.
 * @file Draw each ring kind at each step as an SVG glyph, with the symbol that marks its kind inside.
 */

'use strict'

const { ringIconId, ringKinds, ringSteps } = require('../../src/view/rings')
const { annulus, arcBand, bar, polygon, rect } = require('./shapes')

/**
 * The first code point of the ring glyphs; each kind gets a block of 32.
 * @type {number}
 */
const ringCodePointBase = 0xe100

/**
 * One glyph to put in the font.
 * @typedef {object} Glyph
 * @property {string} id - The icon id in `contributes.icons`.
 * @property {string} description - The icon's description.
 * @property {number} codePoint - The glyph's code point.
 * @property {Buffer} svg - The glyph's SVG.
 */

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
  /** The glyph's path data. */
  const d = annulus(7.2, 6.8) + arcBand(7.85, 6.15, step / 100) + symbols[symbol]
  return `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16"><path d="${d}"/></svg>`
}

/**
 * Every glyph in the font: each ring kind at each step.
 * @returns {Glyph[]} The glyphs.
 */
function collectGlyphs() {
  return ringKinds.flatMap(({ kind, symbol, description }, kindIndex) => ringSteps.map((step, stepIndex) => ({
    id: ringIconId(kind, step),
    description: `${description} at ${step}%`,
    codePoint: ringCodePointBase + kindIndex * 0x20 + stepIndex,
    svg: Buffer.from(ringSvg(symbol, step)),
  })))
}

module.exports = { collectGlyphs }
