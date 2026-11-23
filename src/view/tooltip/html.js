/**
 * Tooltip HTML pieces.
 * @file Build the escaped text, progress bars, and tables a hover tooltip is made of, within what the hover sanitizer keeps.
 */

/**
 * How many no-break spaces wide a tooltip progress bar is, about 325px at the bar's text size.
 * @type {number}
 */
const barSpaces = 233

/**
 * How many times a tooltip progress bar's text is made smaller, from the hover's 13px to about
 * 4.4px, which sets how tall the bar's background is: about 5px.
 * @type {number}
 */
const barShrinks = 6

/**
 * How many pixels the corners of a progress bar's fill and track are rounded by.
 * @type {number}
 */
const barRadius = 2

/**
 * Theme colors for a progress bar's fill, by warning level: the primary button's color, the theme's
 * main interactive color, or the warning or error color.
 * @type {Record<'normal' | 'warning' | 'error', string>}
 */
const barFills = {
  normal: 'var(--vscode-button-background)',
  warning: 'var(--vscode-editorWarning-foreground)',
  error: 'var(--vscode-editorError-foreground)',
}

/**
 * Theme color for the unfilled part of a progress bar: the hover's border, which is opaque so the fill covers it.
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
 * How many pixels tall the empty row above a section's status is. The hover drops the top margin
 * of a paragraph that starts a table cell, so this row spaces the status from the label as far as
 * the amount's heading margin does.
 * @type {number}
 */
const statusGap = 3

/**
 * How many columns a section's table has: the percent, the word after it, an empty one that takes
 * up the rest of the width, and the note.
 * @type {number}
 */
const sectionColumns = 4

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
 * Draw a progress bar as HTML the hover sanitizer keeps: a span of no-break spaces with a
 * rounded background in the track's color, holding a shorter one in the fill's color, in text
 * made smaller enough times that the backgrounds are a thin line.
 *
 * Each background is one box, so it has none of the seams that a run of block characters shows
 * where cells meet at fractions of a pixel.
 * @param {number} percent - How full the bar is, from 0 to 100.
 * @param {'error' | 'warning' | null} [level] - The warning level that colors the fill.
 * @returns {string} The bar's HTML.
 */
function progressBar(percent, level = null) {
  /** How many spaces the fill spans. */
  const filled = Math.round((Math.max(0, Math.min(100, percent)) / 100) * barSpaces)

  /**
   * Draw a run of spaces on a rounded background.
   * @param {string} color - The background's color.
   * @param {string} content - The run's spaces and any run inside it.
   * @returns {string} The run's HTML.
   */
  const run = (color, content) => `<span style="background-color:${color};border-radius:${barRadius}px;">${content}</span>`

  /** The fill's run, or nothing when it spans no spaces. */
  const fill = filled ? run(barFills[level ?? 'normal'], '\u00a0'.repeat(filled)) : ''
  return `${'<small>'.repeat(barShrinks)}${run(barTrack, fill + '\u00a0'.repeat(barSpaces - filled))}${'</small>'.repeat(barShrinks)}`
}

/**
 * Format a section's amount as two table cells: the percent in a second-level heading, the only way
 * a hover shows text larger than normal, then the dimmed word in its own cell. Everything in a
 * heading is bold and the hover sanitizer drops font-weight styles, so the word sits beside the
 * heading in normal weight, centered against it.
 * @param {number} percent - The percent.
 * @param {string} word - What the percent measures, such as `used`, unescaped.
 * @returns {string} The amount's table cells.
 */
function amount(percent, word) {
  return `<td width="1"><h2>${percent}%</h2></td><td width="1">${dim(escapeHtml(word))}</td>`
}

/**
 * Build an empty table row that spaces the rows around it, such as the one that starts a section's
 * table and spaces it from the rule above.
 * @param {number} columns - How many columns the row spans.
 * @param {number} [height] - How many pixels tall the row is.
 * @returns {string} The row's HTML.
 */
function gapRow(columns, height = headingGap) {
  return `<tr><td colspan="${columns}" height="${height}"></td></tr>`
}

/**
 * Build the tooltip's title: a second-level heading in a table, so it has the same inset as the sections'
 * tables, whose cells the hover sanitizer won't let lose their default padding and spacing.
 * @param {string} text - The title, unescaped.
 * @returns {string} The title's HTML.
 */
function tooltipTitle(text) {
  return `<table><tr><td><h2>${escapeHtml(text)}</h2></td></tr></table>`
}

/**
 * Build a section's table: an empty row that spaces it from the rule above, a bold label with an
 * optional dimmed note aligned to the right edge, then the section's other rows.
 *
 * A full-width table is the only way the hover sanitizer allows right alignment, so the note ends
 * where the bar ends. The amount and bar sit in the table too, so they have the same inset as the
 * label and note, since the sanitizer won't let table cells lose their default padding and spacing.
 *
 * The label spans the amount's columns and the wide empty one after them, so it never wraps to the
 * amount's width, and the note keeps to one line with no-break spaces, since its column is only
 * as wide as its content.
 * @param {string} label - The section's label.
 * @param {string | null} note - The note across from the label, unescaped, or null for none.
 * @param {string} rows - The section's rows below the label, as HTML.
 * @returns {string} The section's HTML.
 */
function sectionTable(label, note, rows) {
  /** The note's dimmed text, kept to one line, and the row that holds the label and note. */
  const noteText = note ? dim(escapeHtml(note).replace(/ /g, '\u00a0')) : ''
  const heading = `<tr><td colspan="${sectionColumns - 1}"><b>${escapeHtml(label)}</b></td><td align="right">${noteText}</td></tr>`
  return `<table width="100%">${gapRow(sectionColumns)}${heading}${rows}</table>`
}

/**
 * Build one tooltip section: the label and an optional note, the amount, then an optional bar.
 * @param {string} label - The section's label.
 * @param {string | null} note - The note across from the label, unescaped, or null for none.
 * @param {string} value - The section's amount, as the two table cells from `amount`.
 * @param {string | null} bar - The section's progress bar, or null for none.
 * @returns {string} The section's HTML.
 */
function tooltipSection(label, note, value, bar) {
  /** The amount's row, whose empty full-width cell keeps the amount's cells to their content, and the bar's row. */
  const amountRow = `<tr>${value}<td></td><td></td></tr>`
  const barRow = bar ? `<tr><td colspan="${sectionColumns}">${bar}</td></tr>` : ''
  return sectionTable(label, note, amountRow + barRow)
}

/**
 * Build one tooltip section that shows a dimmed status in place of an amount: the label and an
 * optional note, the status, then an optional bar.
 * @param {string} label - The section's label.
 * @param {string | null} note - The note across from the label, unescaped, or null for none.
 * @param {string} text - The status, unescaped.
 * @param {string | null} bar - The section's progress bar, or null for none.
 * @returns {string} The section's HTML.
 */
function statusSection(label, note, text, bar) {
  /** The status and bar's row. */
  const body = `<tr><td colspan="${sectionColumns}"><p>${dim(escapeHtml(text))}</p>${bar ?? ''}</td></tr>`
  return sectionTable(label, note, gapRow(sectionColumns, statusGap) + body)
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

export { amount, dim, escapeHtml, footerRow, gapRow, progressBar, statusSection, tooltipSection, tooltipTitle }
