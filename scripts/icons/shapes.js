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

/**
 * Outline a rectangle with rounded corners, clockwise for a fill or counterclockwise for a hole.
 * @param {number} x - The left edge.
 * @param {number} y - The top edge.
 * @param {number} width - The width.
 * @param {number} height - The height.
 * @param {number} radius - The corners' radius, at most half the shorter side.
 * @param {boolean} [isHole] - Whether the rectangle cuts a hole.
 * @returns {string} The path data.
 */
function roundedRect(x, y, width, height, radius, isHole = false) {
  /** The right and bottom edges. */
  const [right, bottom] = [x + width, y + height]

  /**
   * Each corner, clockwise from the top right, as where its straight side ends and where its arc ends.
   * @type {Array<[Point, Point]>}
   */
  const corners = [
    [[right - radius, y], [right, y + radius]],
    [[right, bottom - radius], [right - radius, bottom]],
    [[x + radius, bottom], [x, bottom - radius]],
    [[x, y + radius], [x + radius, y]],
  ]

  /** The outline's points in drawing order, each marked with whether an arc reaches it. */
  const steps = corners.flatMap(([sideEnd, arcEnd]) => [[sideEnd, false], [arcEnd, true]])

  /** The point each step starts from; the last step ends back at the first. */
  const starts = [steps.at(-1)[0], ...steps.map(([point]) => point)]

  /** A hole runs each step backward, from where it ends to where it starts. */
  const ordered = isHole ? steps.map(([, isArc], index) => [starts[index], isArc]).reverse() : steps

  /** The arc command up to its end point. */
  const arc = `A${num(radius)} ${num(radius)} 0 0 ${isHole ? 0 : 1}`

  return `M${num(x + radius)} ${num(y)}`
    + ordered.map(([[pointX, pointY], isArc]) => `${isArc ? arc : 'L'}${isArc ? ' ' : ''}${num(pointX)} ${num(pointY)}`).join('')
    + 'Z'
}

/**
 * List a convex polygon's edges clockwise on screen, each with its unit normal pointing out of the polygon.
 * @param {Point[]} points - The polygon's corners.
 * @returns {Array<{ from: Point, to: Point, normal: Point }>} The edges.
 */
function outwardEdges(points) {
  /** The corners, clockwise on screen. */
  const corners = signedArea(points) > 0 ? points : [...points].reverse()

  return corners.map(([x, y], index) => {
    /** The edge's other end, and its length. */
    const [nextX, nextY] = corners[(index + 1) % corners.length]
    const length = Math.hypot(nextX - x, nextY - y)
    return { from: [x, y], to: [nextX, nextY], normal: [(nextY - y) / length, -(nextX - x) / length] }
  })
}

/**
 * Find where two lines cross, each given by two of its points.
 * @param {[Point, Point]} first - The first line.
 * @param {[Point, Point]} second - The second line.
 * @returns {Point} The crossing.
 */
function lineCrossing([[ax, ay], [bx, by]], [[cx, cy], [dx, dy]]) {
  /** The lines' directions. */
  const [rx, ry, sx, sy] = [bx - ax, by - ay, dx - cx, dy - cy]

  /** How far along the first line the crossing is, as a share of its direction. */
  const t = ((cx - ax) * sy - (cy - ay) * sx) / (rx * sy - ry * sx)
  return [ax + t * rx, ay + t * ry]
}

/**
 * Shrink a convex polygon by moving each edge inward, keeping its corners sharp.
 * @param {Point[]} points - The polygon's corners.
 * @param {number} distance - How far to move each edge, less than the polygon's inner radius.
 * @returns {Point[]} The shrunk polygon's corners.
 */
function shrunkPolygon(points, distance) {
  /** The edges, moved inward. */
  const edges = outwardEdges(points).map(({ from, to, normal: [nx, ny] }) => [
    [from[0] - nx * distance, from[1] - ny * distance],
    [to[0] - nx * distance, to[1] - ny * distance],
  ])
  return edges.map((edge, index) => lineCrossing(edges.at(index - 1), edge))
}

/**
 * Outline a convex polygon grown by moving each edge outward, rounding each corner with an arc,
 * clockwise for a fill.
 * @param {Point[]} points - The polygon's corners.
 * @param {number} radius - How far to move each edge, which is also each corner's radius.
 * @returns {string} The path data.
 */
function roundedGrownPolygon(points, radius) {
  /** The edges, moved outward. */
  const edges = outwardEdges(points).map(({ from, to, normal: [nx, ny] }) => [
    [from[0] + nx * radius, from[1] + ny * radius],
    [to[0] + nx * radius, to[1] + ny * radius],
  ])

  /** The arc command up to its end point. */
  const arc = `A${num(radius)} ${num(radius)} 0 0 1`

  return `M${num(edges[0][0][0])} ${num(edges[0][0][1])}`
    + edges.map(([, [endX, endY]], index) => {
      /** Where the next edge starts, which the corner's arc ends at. */
      const [nextX, nextY] = edges[(index + 1) % edges.length][0]
      return `L${num(endX)} ${num(endY)}${arc} ${num(nextX)} ${num(nextY)}`
    }).join('')
    + 'Z'
}

/**
 * Outline a figure drawn with lines of one width and round joins: its outside grown by half the
 * width with rounded corners, with each face the lines enclose cut out, shrunk by half the width.
 * @param {Point[]} outside - The corners of the figure's outside, a convex polygon.
 * @param {Point[][]} faces - The convex faces the lines enclose.
 * @param {number} width - The lines' width.
 * @returns {string} The path data.
 */
function strokedFigure(outside, faces, width) {
  return roundedGrownPolygon(outside, width / 2) + faces.map(face => polygon(shrunkPolygon(face, width / 2), true)).join('')
}

export { annulus, arcBand, bar, circle, polygon, rect, roundedRect, strokedFigure }
