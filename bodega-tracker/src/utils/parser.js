import { PRODUCTS } from './products.js'

// Build keyword → productId lookup (all normalized)
const KEYWORD_MAP = {}
for (const product of PRODUCTS) {
  for (const kw of product.keywords) {
    KEYWORD_MAP[normalize(kw)] = product.id
  }
}

function normalize(str) {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function levenshtein(a, b) {
  const m = a.length, n = b.length
  const dp = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  )
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1])
    }
  }
  return dp[m][n]
}

function findProduct(word) {
  const norm = normalize(word)
  if (!norm) return null

  // Exact match
  if (KEYWORD_MAP[norm]) return KEYWORD_MAP[norm]

  // Substring match
  for (const [kw, id] of Object.entries(KEYWORD_MAP)) {
    if (kw.includes(norm) || norm.includes(kw)) return id
  }

  // Fuzzy match (Levenshtein ≤ 2 for words ≥ 4 chars)
  if (norm.length >= 4) {
    let best = null, bestDist = 3
    for (const [kw, id] of Object.entries(KEYWORD_MAP)) {
      const dist = levenshtein(norm, kw)
      if (dist < bestDist) { bestDist = dist; best = id }
    }
    if (best) return best
  }

  return null
}

/**
 * Parse a free-text string into [{id, qty}] items.
 * Examples:
 *   "1 cafe 2 papel desinfectante jabon" → [{cafe,1},{papel_hig,2},{desinfectante,1},{jabon_manos,1}]
 *   "cafe papel"                         → [{cafe,1},{papel_hig,1}]
 */
export function parseInput(text) {
  const tokens = text.trim().split(/\s+/).filter(Boolean)
  const results = []
  let i = 0

  while (i < tokens.length) {
    const num = parseFloat(tokens[i])

    if (!isNaN(num) && num > 0) {
      i++
      // Try bigram first (e.g. "papel higienico", "bolsas grandes")
      if (i < tokens.length) {
        if (i + 1 < tokens.length) {
          const bigram = tokens[i] + ' ' + tokens[i + 1]
          const match = findProduct(bigram)
          if (match) { results.push({ id: match, qty: num }); i += 2; continue }
        }
        const match = findProduct(tokens[i])
        if (match) results.push({ id: match, qty: num })
        i++
      }
    } else {
      // No preceding number → qty = 1; try bigram first
      if (i + 1 < tokens.length) {
        const bigram = tokens[i] + ' ' + tokens[i + 1]
        const match = findProduct(bigram)
        if (match) { results.push({ id: match, qty: 1 }); i += 2; continue }
      }
      const match = findProduct(tokens[i])
      if (match) results.push({ id: match, qty: 1 })
      i++
    }
  }

  // Merge duplicates
  const merged = {}
  for (const item of results) {
    if (merged[item.id]) merged[item.id].qty += item.qty
    else merged[item.id] = { ...item }
  }

  return Object.values(merged)
}
