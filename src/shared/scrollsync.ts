export type LinePoint = {
  line: number
  top: number
}

/**
 * Anchors are in document order. Nested blocks that share an edge keep the
 * outer line. A point that jumps upward is not on screen and is dropped.
 * Footnotes are rendered after the body, so a later point may name an
 * earlier source line; that bend stays, because the definition really is
 * at the bottom of the page. The final point is the bottom of the
 * scrollport, so the tail of the last block interpolates instead of
 * sticking to its first line.
 */
export function linePoints(anchors: readonly LinePoint[], contentHeight: number, lineCount: number): LinePoint[] {
  const height = Number.isFinite(contentHeight) ? Math.max(0, contentHeight) : 0
  const lines = Number.isFinite(lineCount) ? Math.max(1, Math.floor(lineCount)) : 1
  const unique: LinePoint[] = []
  for (const item of anchors) {
    if (!Number.isFinite(item.line) || !Number.isFinite(item.top) || item.line < 0) continue
    const top = Math.max(0, item.top)
    const prev = unique[unique.length - 1]
    if (prev && (item.line === prev.line || top <= prev.top + 0.5)) continue
    unique.push({ line: item.line, top })
  }
  if (!unique.length) {
    return [
      { line: 0, top: 0 },
      { line: Math.max(0, lines - 1), top: height }
    ]
  }
  const last = unique[unique.length - 1]!
  const endLine = Math.max(last.line, lines - 1)
  if (height > last.top + 0.5) unique.push({ line: endLine, top: height })
  return unique
}

export function lineAtOffset(anchors: readonly LinePoint[], offset: number, contentHeight: number, lineCount: number): number {
  const points = linePoints(anchors, contentHeight, lineCount)
  const y = Number.isFinite(offset) ? Math.max(0, offset) : 0
  const first = points[0]!
  if (y <= first.top) return first.line
  for (let i = 0; i < points.length - 1; i += 1) {
    const start = points[i]!
    const end = points[i + 1]!
    if (y <= end.top || i === points.length - 2) {
      const span = end.top - start.top
      const t = span > 0 ? Math.min(1, Math.max(0, (y - start.top) / span)) : 0
      return start.line + t * (end.line - start.line)
    }
  }
  return points[points.length - 1]!.line
}

function covers(target: number, start: number, end: number): boolean {
  const lo = Math.min(start, end)
  const hi = Math.max(start, end)
  return target >= lo - 1e-6 && target <= hi + 1e-6
}

export function offsetForLine(anchors: readonly LinePoint[], line: number, contentHeight: number, lineCount: number): number {
  const points = linePoints(anchors, contentHeight, lineCount)
  const first = points[0]!
  const last = points[points.length - 1]!
  const target = Number.isFinite(line) ? line : first.line
  let best = 0
  let bestDist = Infinity
  for (let i = 0; i < points.length; i += 1) {
    const dist = Math.abs(points[i]!.line - target)
    if (dist < bestDist - 1e-6) {
      best = i
      bestDist = dist
    }
  }
  const spot = points[best]!
  const next = points[best + 1]
  const prev = points[best - 1]
  if (next && covers(target, spot.line, next.line) && next.line !== spot.line) {
    const t = (target - spot.line) / (next.line - spot.line)
    return spot.top + Math.min(1, Math.max(0, t)) * (next.top - spot.top)
  }
  if (prev && covers(target, prev.line, spot.line) && spot.line !== prev.line) {
    const t = (target - prev.line) / (spot.line - prev.line)
    return prev.top + Math.min(1, Math.max(0, t)) * (spot.top - prev.top)
  }
  if (target <= first.line && first.line <= last.line) return first.top
  return spot.top
}
