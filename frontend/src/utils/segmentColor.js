/**
 * Rhythmus-Regel:
 * Position 1, 6, 11 … → rot (+ Display LG)
 * Andere → creme/tinte alternierend
 * Hat editorial_badges → immer tinte (überschreibt)
 */
export function getSegmentColor(index, hasEditorial) {
  if (hasEditorial) return 'tinte'
  const pos = index + 1 // 1-basiert
  if (pos % 5 === 1) return 'rot' // 1, 6, 11, 16 …
  const withinGroup = (pos - 1) % 5 // 1, 2, 3, 4
  return withinGroup % 2 === 1 ? 'creme' : 'tinte'
}

export function isLargeSegment(index, hasEditorial) {
  if (hasEditorial) return false
  const pos = index + 1
  return pos % 5 === 1 // rot-Positionen erhalten Display LG
}
