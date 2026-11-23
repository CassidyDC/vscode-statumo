/**
 * Icon shapes.
 * @file Outline polygons, circles, rings, arcs, bars, and rectangles as SVG path data in the 16-unit icon grid.
 */

/**
 * One point of an outline, in the 16-unit ring grid.
 * @typedef {[number, number]} Point
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
    /** The next corner. */
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
  /** Whether the corners run clockwise, and the corners in the order the outline needs. */
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
  /** The arcs' sweep flag, and the arc command up to its end point. */
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
  /** The angle in radians. */
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

  /** The large-arc flag, and where the outer and inner arcs end. */
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
  /** The bar's length, and the offset from its center line to each side. */
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

export { annulus, arcBand, bar, circle, polygon, rect }
