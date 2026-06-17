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

function buildKeywordMap(products) {
  const map = {}
  for (const product of products) {
    for (const kw of product.keywords) {
      map[normalize(kw)] = product.id
    }
  }
  return map
}

function findProduct(word, keywordMap) {
  const norm = normalize(word)
  if (!norm) return null

  if (keywordMap[norm]) return keywordMap[norm]

  for (const [kw, id] of Object.entries(keywordMap)) {
    if (kw.includes(norm) || norm.includes(kw)) return id
  }

  if (norm.length >= 4) {
    let best = null, bestDist = 3
    for (const [kw, id] of Object.entries(keywordMap)) {
      const dist = levenshtein(norm, kw)
      if (dist < bestDist) { bestDist = dist; best = id }
    }
    if (best) return best
  }

  return null
}

export function parseInput(text, products) {
  const keywordMap = buildKeywordMap(products)
  const tokens = text.trim().split(/\s+/).filter(Boolean)
  const results = []
  let i = 0

  while (i < tokens.length) {
    const num = parseFloat(tokens[i])

    if (!isNaN(num) && num > 0) {
      i++
      if (i < tokens.length) {
        if (i + 1 < tokens.length) {
          const bigram = tokens[i] + ' ' + tokens[i + 1]
          const match = findProduct(bigram, keywordMap)
          if (match) { results.push({ id: match, qty: num }); i += 2; continue }
        }
        const match = findProduct(tokens[i], keywordMap)
        if (match) results.push({ id: match, qty: num })
        i++
      }
    } else {
      if (i + 1 < tokens.length) {
        const bigram = tokens[i] + ' ' + tokens[i + 1]
        const match = findProduct(bigram, keywordMap)
        if (match) { results.push({ id: match, qty: 1 }); i += 2; continue }
      }
      const match = findProduct(tokens[i], keywordMap)
      if (match) results.push({ id: match, qty: 1 })
      i++
    }
  }

  const merged = {}
  for (const item of results) {
    if (merged[item.id]) merged[item.id].qty += item.qty
    else merged[item.id] = { ...item }
  }

  return Object.values(merged)
}
