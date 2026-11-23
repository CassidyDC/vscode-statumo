/**
 * Tooltip HTML pieces.
 * @file Build the escaped text, progress bars, and tables a hover tooltip is made of, within what the hover sanitizer keeps.
 */

'use strict'

/**
 * How many cells wide a tooltip progress bar is, about 320px at the bar's text size: the hover's
 * 13px text made smaller twice, about 9px.
 * @type {number}
 */
const barCells = 59

/**
 * Theme colors for a progress bar's fill, by warning level.
 * @type {Record<'normal' | 'warning' | 'error', string>}
 */
const barFills = {
  normal: 'var(--vscode-progressBar-background)',
  warning: 'var(--vscode-editorWarning-foreground)',
  error: 'var(--vscode-editorError-foreground)',
}

/**
 * Theme color for the unfilled part of a progress bar: the hover's border, which is opaque so the cells join without seams.
 * @type {string}
 */
const barTrack = 'var(--vscode-editorHoverWidget-border)'

/**
 * How many pixels tall the empty row above each section heading is.
 *
 * The hover pulls whatever follows a rule up by 4px, and the sanitizer drops padding and margin
 * styles, so this row's `height` attribute is what keeps a heading off the rule above it.
 * @type {number}
 */
const headingGap = 8

/**
 * How many pixels wide the empty column between the footer's labels and details is, since the
 * hover sanitizer drops padding styles.
 * @type {number}
 */
const footerColumnGap = 12

/**
 * Escape text so Markdown shows it literally.
 * @param {string} text - The text to escape.
 * @returns {string} The escaped text.
 */
function escapeMarkdown(text) {
  return text.replace(/[\\`*_{}[\]()#+\-.!|<>~]/g, '\\$&')
}

/**
 * Escape text so HTML shows it literally, for text inside HTML blocks, where Markdown escapes don't apply.
 * @param {string} text - The text to escape.
 * @returns {string} The escaped text.
 */
function escapeHtml(text) {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/**
 * Show escaped text in the theme's dimmer description color.
 * @param {string} text - The escaped text.
 * @returns {string} The text's HTML.
 */
function dim(text) {
  return `<span style="color:var(--vscode-descriptionForeground);">${text}</span>`
}

/**
 * Draw a progress bar as HTML the hover sanitizer keeps: runs of upper-half block characters in
 * text made smaller twice, which join into a solid line about 4.5px tall, colored with theme colors.
 *
 * The upper half block is one of the few block characters the system font falls back to Menlo for,
 * which draws them edge to edge. Others, such as the lower quarter block, fall back to a font that
 * leaves a gap between each cell.
 * @param {number} percent - How full the bar is, from 0 to 100.
 * @param {'error' | 'warning' | null} [level] - The warning level that colors the fill.
 * @returns {string} The bar's HTML.
 */
function progressBar(percent, level = null) {
  /** How many cells the fill spans. */
  const filled = Math.round((Math.max(0, Math.min(100, percent)) / 100) * barCells)

  /**
   * Draw one colored run of cells.
   * @param {string} color - The run's color.
   * @param {number} cells - How many cells the run spans.
   * @returns {string} The run's HTML, or nothing when it spans no cells.
   */
  const run = (color, cells) => cells ? `<span style="color:${color};">${'▀'.repeat(cells)}</span>` : ''
  return `<small><small>${run(barFills[level ?? 'normal'], filled)}${run(barTrack, barCells - filled)}</small></small>`
}

/**
 * Format a section's amount as a second-level heading, the only way a hover shows text larger than
 * normal: the percent, then a smaller dimmed word.
 * @param {number} percent - The percent.
 * @param {string} word - What the percent measures, such as `used`.
 * @returns {string} The amount's Markdown.
 */
function amount(percent, word) {
  return `## ${percent}% ${dim(`<small>${word}</small>`)}`
}

/**
 * Build the empty row that starts a section's table, spacing it from the rule above.
 * @param {number} columns - How many columns the row spans.
 * @returns {string} The row's HTML.
 */
function gapRow(columns) {
  return `<tr><td colspan="${columns}" height="${headingGap}"></td></tr>`
}

/**
 * Build one tooltip section: a bold label with an optional dimmed note aligned to the right edge,
 * the amount, then an optional bar. The heading is a full-width table, the only way the hover
 * sanitizer allows right alignment, so the note ends where the bar ends. An empty first row
 * spaces the heading from the rule above it.
 * @param {string} label - The section's label.
 * @param {string | null} note - The note across from the label, unescaped, or null for none.
 * @param {string} value - The section's amount, or a dimmed status, as Markdown.
 * @param {string | null} bar - The section's progress bar, or null for none.
 * @returns {string} The section's Markdown.
 */
function tooltipSection(label, note, value, bar) {
  /** The note's table cell, and the heading table that holds the label and note. */
  const noteCell = note ? `<td align="right">${dim(escapeHtml(note))}</td>` : ''
  const heading = `<table width="100%">${gapRow(note ? 2 : 1)}<tr><td><b>${escapeHtml(label)}</b></td>${noteCell}</tr></table>`
  return [heading, value, bar].filter(Boolean).join('\n\n')
}

/**
 * Build one footer table row: a dimmed label, the gap column, then the dimmed detail.
 * @param {string} label - The row's label, unescaped.
 * @param {string} detail - The row's detail, unescaped.
 * @returns {string} The row's HTML.
 */
function footerRow(label, detail) {
  return `<tr><td>${dim(escapeHtml(label))}</td><td width="${footerColumnGap}"></td><td>${dim(escapeHtml(detail))}</td></tr>`
}

module.exports = { amount, dim, escapeHtml, escapeMarkdown, footerRow, gapRow, progressBar, tooltipSection }
