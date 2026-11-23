/**
 * Ring glyphs.
 * @file Draw each ring kind at each step as an SVG glyph, with the symbol that marks its kind inside.
 */

import { fullRingIconId, ringIconId, ringKinds, ringSteps, symbolIconId } from '../../src/view/rings.js'
import { annulus, arcBand, bar, polygon, roundedRect } from './shapes.js'

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
 * A symbol drawn inside a ring.
 * @typedef {'layers' | 'clock' | 'calendar' | 'gem' | 'star'} SymbolName
 */

/**
 * The share of a star's outer radius its inner corners sit at.
 * @type {number}
 */
const starInnerRatio = 0.47

/**
 * The symbols drawn inside each ring, as path data in the 16-unit grid.
 * @type {Record<SymbolName, string>}
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
    roundedRect(4.3, 4.9, 7.4, 6.9, 1.6),
    roundedRect(5.2, 7.1, 5.6, 3.8, 0.7, true),
    roundedRect(5.4, 3.9, 0.9, 1.6, 0.45),
    roundedRect(9.7, 3.9, 0.9, 1.6, 0.45),
    ...[5.9, 7.5, 9.1].flatMap(x => [roundedRect(x, 7.75, 1, 1, 0.25), roundedRect(x, 9.35, 1, 1, 0.25)]),
  ].join(''),
  gem: [
    polygon([[5.8, 4.7], [10.2, 4.7], [11.8, 6.8], [8, 11.6], [4.2, 6.8]]),
    polygon([[5, 6.45], [11, 6.45], [11, 7.25], [5, 7.25]], true),
  ].join(''),
  star: polygon(Array.from({ length: 10 }, (_, index) => {
    /** The corner's distance from the center, and its angle clockwise from 12 o'clock. */
    const radius = index % 2 === 0 ? 4 : 4 * starInnerRatio
    const angle = (index / 10) * 2 * Math.PI
    return [8 + radius * Math.sin(angle), 8 - radius * Math.cos(angle)]
  })),
}

/**
 * The symbol the test icons draw for each kind: the original's, with a star in place of the gem.
 * @param {SymbolName} symbol - The original icon's symbol.
 * @returns {SymbolName} The test icon's symbol.
 */
function testSymbol(symbol) {
  return symbol === 'gem' ? 'star' : symbol
}

/**
 * Draw one ring glyph: a thin track, the filled arc over it, and the kind's symbol inside.
 * @param {SymbolName} symbol - The symbol inside the ring.
 * @param {number} step - How full the ring is, in percent.
 * @returns {string} The glyph's SVG.
 */
function ringSvg(symbol, step) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16"><path d="${ringPath(symbol, step)}"/></svg>`
}

/**
 * Outline one ring: a thin track, the filled arc over it, and the kind's symbol inside.
 * @param {SymbolName} symbol - The symbol inside the ring.
 * @param {number} step - How full the ring is, in percent.
 * @returns {string} The path data, in the 16-unit grid.
 */
function ringPath(symbol, step) {
  return ringBandPath(step) + symbols[symbol]
}

/**
 * Outline one ring without its symbol: a thin track and the filled arc over it.
 * @param {number} step - How full the ring is, in percent.
 * @returns {string} The path data, in the 16-unit grid.
 */
function ringBandPath(step) {
  return annulus(7.2, 6.8) + arcBand(ringOuterRadius, ringInnerRadius, step / 100)
}

/**
 * The outer and inner radii of a ring's filled arc; the outer is its outermost ink.
 * @type {number}
 */
const ringOuterRadius = 7.85
const ringInnerRadius = 6.15

/**
 * The first code point of the full-size ring glyphs; each kind gets a block of 32.
 * @type {number}
 */
const fullRingCodePointBase = 0xe200

/**
 * The points of a symbol's outline, with each arc sampled along its length, to find what bounds it.
 * @param {string} d - The path data, made of absolute `M`, `L`, `A`, and `Z` commands with circular arcs.
 * @returns {Array<[number, number]>} The points.
 */
function outlinePoints(d) {
  /** The points so far. */
  const points = []

  for (const [, command, args] of d.matchAll(/([MLAZ])([^MLAZ]*)/g)) {
    /** The command's numbers. */
    const values = args.trim() ? args.trim().split(/\s+/).map(Number) : []

    if (command === 'A') {
      /** Where the arc starts and ends, its radius, and which way it turns. */
      const [fromX, fromY] = points.at(-1)
      const [toX, toY] = values.slice(5)
      const [radius, , , large, sweep] = values

      /** Half the chord between the ends, and how far the center sits from the chord's middle, per unit of it. */
      const [halfX, halfY] = [(fromX - toX) / 2, (fromY - toY) / 2]
      const offset = (large === sweep ? -1 : 1)
        * Math.sqrt(Math.max(0, radius ** 2 / (halfX ** 2 + halfY ** 2) - 1))

      /** The circle's center, and the angles the arc starts at and turns through. */
      const [centerX, centerY] = [(fromX + toX) / 2 + offset * halfY, (fromY + toY) / 2 - offset * halfX]
      const start = Math.atan2(fromY - centerY, fromX - centerX)
      let turn = Math.atan2(toY - centerY, toX - centerX) - start

      if (sweep === 1 && turn < 0) turn += 2 * Math.PI

      if (sweep === 0 && turn > 0) turn -= 2 * Math.PI

      for (let index = 1; index <= 64; index++) {
        /** The sample's angle. */
        const angle = start + (index / 64) * turn
        points.push([centerX + radius * Math.cos(angle), centerY + radius * Math.sin(angle)])
      }

      continue
    }

    for (let index = 0; index < values.length; index += 2) points.push([values[index], values[index + 1]])
  }

  return points
}

/**
 * Find the smallest circle around a set of points, closely enough for drawing.
 * @param {Array<[number, number]>} points - The points.
 * @returns {{ x: number, y: number, radius: number }} The circle's center and radius.
 */
function boundingCircle(points) {
  /**
   * The farthest point from a center, and its distance.
   * @param {number} x - The center's x.
   * @param {number} y - The center's y.
   * @returns {{ point: [number, number], distance: number }} The farthest point.
   */
  const farthest = (x, y) => points.reduce((best, point) => {
    /** The point's distance from the center. */
    const distance = Math.hypot(point[0] - x, point[1] - y)
    return distance > best.distance ? { point, distance } : best
  }, { point: points[0], distance: -1 })

  /** The center, stepped toward the farthest point by less each time. */
  let [x, y] = points[0]

  for (let index = 1; index <= 20000; index++) {
    /** The farthest point from the current center. */
    const { point } = farthest(x, y)
    x += (point[0] - x) / (index + 1)
    y += (point[1] - y) / (index + 1)
  }

  return { x, y, radius: farthest(x, y).distance }
}

/**
 * Draw one ring filling the whole 16-unit box, with its symbol grown until the gap between the
 * arc and the symbol's nearest point matches the arc's thickness.
 * @param {SymbolName} symbol - The symbol inside the ring.
 * @param {number} step - How full the ring is, in percent.
 * @returns {string} The glyph's SVG.
 */
function fullRingSvg(symbol, step) {
  /** How much to scale the ring by so its outermost ink reaches the box's edges. */
  const k = 8 / ringOuterRadius

  /** The arc's thickness and inner radius at that scale, and how far from the center the symbol reaches. */
  const thickness = (ringOuterRadius - ringInnerRadius) * k
  const innerRadius = ringInnerRadius * k
  const symbolRadius = innerRadius - thickness

  /** The circle around the symbol, and how much to scale the symbol by to fill the space inside the gap. */
  const bounds = boundingCircle(outlinePoints(symbols[symbol]))
  const symbolK = symbolRadius / bounds.radius

  /** The ring, scaled around the center, then the symbol, centered on its circle. */
  const d = fitPath(ringBandPath(step), 8 - 8 / k, 8 - 8 / k, k)
    + fitPath(symbols[symbol], bounds.x - 8 / symbolK, bounds.y - 8 / symbolK, symbolK)
  return `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16"><path d="${d}"/></svg>`
}

/**
 * The first code point of the ringless symbol glyphs, one per ring kind.
 * @type {number}
 */
const symbolCodePointBase = 0xe180

/**
 * Move and scale path data made of absolute `M`, `L`, `A`, and `Z` commands.
 * @param {string} d - The path data.
 * @param {number} x - The left edge of the square to fit into the grid.
 * @param {number} y - The top edge of the square to fit into the grid.
 * @param {number} k - How much to scale by.
 * @returns {string} The moved path data.
 */
function fitPath(d, x, y, k) {
  return d.replace(/([MLAZ])([^MLAZ]*)/g, (_, command, args) => {
    /** The command's numbers. */
    const values = args.trim() ? args.trim().split(/\s+/).map(Number) : []

    /** The numbers, moved and scaled. */
    const moved = command === 'A'
      ? [values[0] * k, values[1] * k, values[2], values[3], values[4], (values[5] - x) * k, (values[6] - y) * k]
      : values.map((value, index) => (index % 2 === 0 ? (value - x) * k : (value - y) * k))
    return command + moved.map(value => String(Math.round(value * 1000) / 1000)).join(' ')
  })
}

/**
 * The size codicons draw at inside their 16-unit box, leaving half a unit around each edge.
 * @type {number}
 */
const symbolSize = 15

/**
 * Draw one symbol without its ring, at the size codicons draw at.
 * @param {SymbolName} symbol - The symbol.
 * @returns {string} The glyph's SVG.
 */
function symbolSvg(symbol) {
  /** The symbol's outline points, its bounds, the side of the square around them, and that square's corner. */
  const points = outlinePoints(symbols[symbol])
  const [left, top] = [Math.min(...points.map(([x]) => x)), Math.min(...points.map(([, y]) => y))]
  const [right, bottom] = [Math.max(...points.map(([x]) => x)), Math.max(...points.map(([, y]) => y))]
  const side = Math.max(right - left, bottom - top)
  const x = (left + right - side) / 2
  const y = (top + bottom - side) / 2

  /** How much to scale the symbol by, and the margin around it in the original grid. */
  const k = symbolSize / side
  const margin = (16 - symbolSize) / 2 / k

  return `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16"><path d="${fitPath(symbols[symbol], x - margin, y - margin, k)}"/></svg>`
}

/**
 * Every glyph in the font: each ring kind at each step, each kind's symbol alone for the hover, then each full-size test ring.
 * @returns {Glyph[]} The glyphs.
 */
function collectGlyphs() {
  return [
    ...ringKinds.flatMap(({ kind, symbol, description }, kindIndex) => ringSteps.map((step, stepIndex) => ({
      id: ringIconId(kind, step),
      description: `${description} at ${step}%`,
      codePoint: ringCodePointBase + kindIndex * 0x20 + stepIndex,
      svg: Buffer.from(ringSvg(symbol, step)),
    }))),
    ...ringKinds.map(({ kind, symbol, description }, kindIndex) => ({
      id: symbolIconId(kind),
      description: `${description} symbol`,
      codePoint: symbolCodePointBase + kindIndex,
      svg: Buffer.from(symbolSvg(testSymbol(symbol))),
    })),
    ...ringKinds.flatMap(({ kind, symbol, description }, kindIndex) => ringSteps.map((step, stepIndex) => ({
      id: fullRingIconId(kind, step),
      description: `Full-size ${description.toLowerCase()} at ${step}%`,
      codePoint: fullRingCodePointBase + kindIndex * 0x20 + stepIndex,
      svg: Buffer.from(fullRingSvg(testSymbol(symbol), step)),
    }))),
  ]
}

export { collectGlyphs }
