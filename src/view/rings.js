/**
 * Progress ring icons.
 * @file Name the ring icons the icon font draws and pick the one that matches a percent.
 */

'use strict'

/**
 * How many percent each ring icon covers; the font has one icon per step from 0 to 100.
 * @type {number}
 */
const ringStepPercent = 5

/**
 * The ring kinds, each with the icon id part, the symbol drawn inside, and a description.
 * @type {Array<{ kind: RingKind, symbol: 'layers' | 'clock' | 'calendar', description: string }>}
 */
const ringKinds = [
  { kind: 'cx', symbol: 'layers', description: 'Context ring' },
  { kind: '5h', symbol: 'clock', description: '5-hour limit ring' },
  { kind: '7d', symbol: 'calendar', description: '7-day limit ring' },
]

/**
 * Which ring an icon belongs to.
 * @typedef {'cx' | '5h' | '7d'} RingKind
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

module.exports = { ringIcon, ringIconId, ringKinds, ringStep, ringSteps }
