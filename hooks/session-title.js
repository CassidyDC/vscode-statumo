const chunkSize = 256 * 1024
const titleField = /"(?:customTitle|aiTitle|summary)"\s*:/

function collectTitle(line, titles) {
  if (!titleField.test(line)) return

  // Byte strings let a UTF-8 character span two file reads without losing bytes.
  let row
  try {
    const bytes = Uint8Array.from(line, character => character.charCodeAt(0))
    row = JSON.parse(new TextDecoder().decode(bytes))
  } catch {
    return
  }

  if (typeof row?.customTitle === 'string') titles.custom = row.customTitle.trim()
  if (typeof row?.aiTitle === 'string') titles.generated = row.aiTitle.trim()
  if (row?.type === 'summary' && typeof row.summary === 'string') titles.summary = row.summary.trim()
}

export async function readSessionTitle($, previous) {
  const { transcriptPath: path } = await $.session.info()
  if (!path) return {}

  const { size, mtimeMs } = await $.fs.stat(path)
  const canContinue = previous?.path === path && size >= previous.offset &&
    (size > previous.offset || mtimeMs === previous.mtimeMs)
  const cursor = canContinue
    ? { ...previous, titles: { ...previous.titles }, mtimeMs }
    : { path, mtimeMs, offset: 0, partial: '', titles: {} }

  while (cursor.offset < size) {
    const { base64 } = await $.fs.read(path, {
      as: 'bytes',
      offset: cursor.offset,
      length: Math.min(chunkSize, size - cursor.offset),
    })
    const bytes = atob(base64)
    if (!bytes.length) break
    cursor.offset += bytes.length

    // Skip oversized message rows while retaining complete title metadata rows.
    const lines = ((cursor.partial ?? '') + bytes).split('\n')
    const partial = lines.pop()
    const stillSkipping = cursor.partial === null && !lines.length
    if (cursor.partial === null) lines.shift()
    for (const line of lines) collectTitle(line, cursor.titles)
    cursor.partial = stillSkipping || partial.length > chunkSize ? null : partial
  }

  const titles = { ...cursor.titles }
  if (cursor.partial) collectTitle(cursor.partial, titles)
  return { cursor, title: titles.custom || titles.generated || titles.summary }
}
