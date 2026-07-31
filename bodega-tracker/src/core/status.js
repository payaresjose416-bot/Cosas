// Cálculo de estado/proyección de un producto — puro, sin React.

export function getDaysRemaining(productId, { stock, history, productMap, lookback = 7 }) {
  const product = productMap[productId]
  if (!product) return 0

  const currentStock = stock[productId] ?? product.initialStock

  const recent = history.filter(h => (h.type || 'salida') === 'salida').slice(-lookback)
  if (recent.length > 0) {
    const totalConsumed = recent.reduce((sum, entry) => {
      const item = entry.items.find(i => i.id === productId)
      return sum + (item ? item.qty : 0)
    }, 0)
    const avgDaily = totalConsumed / recent.length
    if (avgDaily > 0) return currentStock / avgDaily
  }

  return product.dailyRate > 0 ? currentStock / product.dailyRate : 999
}

export function getStatus(productId, { stock, history, thresholds, productMap, lookback = 7 }) {
  const t = thresholds[productId]
  if (t && !t.deleted) {
    const currentStock = stock[productId] ?? productMap[productId]?.initialStock ?? 0
    if (currentStock <= t.critical) return 'critical'
    if (currentStock <= t.low) return 'low'
    return 'ok'
  }
  const days = getDaysRemaining(productId, { stock, history, productMap, lookback })
  if (days < 3) return 'critical'
  if (days < 7) return 'low'
  return 'ok'
}
