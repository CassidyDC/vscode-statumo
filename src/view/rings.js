/**
 * Progress ring icons.
 * @file Name the ring icons the icon font draws and pick the one that matches a percent.
 */

/**
 * How many percent each ring icon covers; the font has one icon per step from 0 to 100.
 * @type {number}
 */
const ringStepPercent = 5

/**
 * The ring kinds, each with the icon id part, the symbol drawn inside, a description, and the
 * digit-free name its symbol's icon id uses, since hovers drop icon classes with digits in them.
 * @type {Array<{ kind: RingKind, symbol: 'layers' | 'clock' | 'calendar' | 'gem', description: string, name: string }>}
 */
const ringKinds = [
  { kind: 'cx', symbol: 'layers', description: 'Context ring', name: 'context' },
  { kind: '5h', symbol: 'clock', description: '5-hour limit ring', name: 'five-hour' },
  { kind: '7d', symbol: 'calendar', description: '7-day limit ring', name: 'weekly' },
  { kind: 'fb', symbol: 'gem', description: 'Weekly Fable limit ring', name: 'fable' },
]

/**
 * Which ring an icon belongs to.
 * @typedef {'cx' | '5h' | '7d' | 'fb'} RingKind
 */

/**
 * Every ring step the font draws, from empty to full.
 * @type {number[]}
 */
const ringSteps = Array.from({ length: 100 / ringStepPercent + 1 }, (_, index) => index * ringStepPercent)

/**
 * Round a percent to the nearest ring step, keeping any nonzero value off the empty ring and anything short of 100 off the full one.
 * @param {number | null} percent - The percent to show, or null when unknown.
 * @returns {number} The ring step.
 */
function ringStep(percent) {
  if (percent === null || !(percent > 0)) return 0
  if (percent >= 100) return 100

  /** The nearest step, before keeping it off empty and full. */
  const step = Math.round(percent / ringStepPercent) * ringStepPercent
  return Math.max(ringStepPercent, Math.min(100 - ringStepPercent, step))
}

/**
 * The icon id of a ring at a given step.
 * @param {RingKind} kind - Which ring.
 * @param {number} step - The ring step.
 * @returns {string} The icon id, such as `statumo-5h-85`.
 */
function ringIconId(kind, step) {
  return `statumo-${kind}-${step}`
}

/**
 * The status bar text that draws a ring for a percent.
 * @param {RingKind} kind - Which ring.
 * @param {number | null} percent - The percent to show, or null for an empty ring.
 * @returns {string} The icon reference, such as `$(statumo-5h-85)`.
 */
function ringIcon(kind, percent) {
  return `$(${ringIconId(kind, ringStep(percent))})`
}

/**
 * The icon id of a ring kind's symbol drawn alone, without its ring. It has no digits, so a hover
 * keeps it.
 * @param {RingKind} kind - Which ring.
 * @returns {string} The icon id, such as `statumo-five-hour-symbol`.
 */
function symbolIconId(kind) {
  return `statumo-${ringKinds.find(ring => ring.kind === kind).name}-symbol`
}

/**
 * The icon id of a full-size ring, filling its whole icon box, at a given step.
 * @param {RingKind} kind - Which ring.
 * @param {number} step - The ring step.
 * @returns {string} The icon id, such as `statumo-5h-full-85`.
 */
function fullRingIconId(kind, step) {
  return `statumo-${kind}-full-${step}`
}

/**
 * The status bar text that draws a full-size ring for a percent.
 * @param {RingKind} kind - Which ring.
 * @param {number | null} percent - The percent to show, or null for an empty ring.
 * @returns {string} The icon reference, such as `$(statumo-5h-full-85)`.
 */
function fullRingIcon(kind, percent) {
  return `$(${fullRingIconId(kind, ringStep(percent))})`
}

/**
 * How a status bar item draws the icon before each percent.
 * @typedef {'ring' | 'full-ring'} IconStyle
 */

/**
 * The icon drawers for each icon style.
 * @type {Record<IconStyle, (kind: RingKind, percent: number | null) => string>}
 */
const iconStyles = { 'ring': ringIcon, 'full-ring': fullRingIcon }
export { fullRingIcon, fullRingIconId, iconStyles, ringIcon, ringIconId, ringKinds, ringStep, ringSteps, symbolIconId }
