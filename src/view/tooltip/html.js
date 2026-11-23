/**
 * Tooltip HTML pieces.
 * @file Build the escaped text, progress bars, and tables a hover tooltip is made of, within what the hover sanitizer keeps.
 */

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
 * How many pixels tall the empty row above a section's status is. The hover drops the top margin
 * of a paragraph that starts a table cell, so this row spaces the status from the label as far as
 * the amount's heading margin does.
 * @type {number}
 */
const statusGap = 3

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
 * @returns {string} The amount's HTML.
 */
function amount(percent, word) {
  return `<h2>${percent}% ${dim(`<small>${word}</small>`)}</h2>`
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
 * Build the tooltip's title: plain text in a table, so it has the same inset as the sections'
 * tables, whose cells the hover sanitizer won't let lose their default padding and spacing.
 * @param {string} text - The title, unescaped.
 * @returns {string} The title's HTML.
 */
function tooltipTitle(text) {
  return `<table><tr><td>${escapeHtml(text)}</td></tr></table>`
}

/**
 * Build a section's table: an empty row that spaces it from the rule above, a bold label with an
 * optional dimmed note aligned to the right edge, then the content across the full width.
 *
 * A full-width table is the only way the hover sanitizer allows right alignment, so the note ends
 * where the bar ends. The content sits in the table too, so it has the same inset as the label and
 * note, since the sanitizer won't let table cells lose their default padding and spacing.
 * @param {string} label - The section's label.
 * @param {string | null} note - The note across from the label, unescaped, or null for none.
 * @param {string} content - The section's content, as HTML.
 * @param {number} contentGap - How many pixels tall the empty row above the content is, or 0 for none.
 * @returns {string} The section's HTML.
 */
function sectionTable(label, note, content, contentGap) {
  /** How many columns the table has, and the note's table cell. */
  const columns = note ? 2 : 1
  const noteCell = note ? `<td align="right">${dim(escapeHtml(note))}</td>` : ''

  /** The row that holds the label and note, the empty row above the content, and the content's row. */
  const heading = `<tr><td><b>${escapeHtml(label)}</b></td>${noteCell}</tr>`
  const spacer = contentGap ? gapRow(columns, contentGap) : ''
  const body = `<tr><td colspan="${columns}">${content}</td></tr>`
  return `<table width="100%">${gapRow(columns)}${heading}${spacer}${body}</table>`
}

/**
 * Build one tooltip section: the label and an optional note, the amount, then an optional bar.
 * @param {string} label - The section's label.
 * @param {string | null} note - The note across from the label, unescaped, or null for none.
 * @param {string} value - The section's amount, as HTML.
 * @param {string | null} bar - The section's progress bar, or null for none.
 * @returns {string} The section's HTML.
 */
function tooltipSection(label, note, value, bar) {
  return sectionTable(label, note, `${value}${bar ?? ''}`, 0)
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
  return sectionTable(label, note, `<p>${dim(escapeHtml(text))}</p>${bar ?? ''}`, statusGap)
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
