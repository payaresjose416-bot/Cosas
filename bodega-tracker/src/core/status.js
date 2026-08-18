// Cálculo de estado/proyección de un producto — puro, sin React.

// El stock actual NO se guarda como contador aparte — se calcula desde un
// ancla (`initialStocks[id] = {value, date}`, la cantidad con la que arrancó
// el ciclo y desde cuándo cuenta) más el historial de salidas/entradas
// registradas desde esa fecha. Sin `date` (producto nunca anclado: no está en
// el Excel sincronizado ni se corrigió a mano) el valor queda congelado — no
// se descuenta nada hasta que exista una fecha real.
export function getCurrentStock(productId, { initialStocks, history, productMap }) {
  const o = initialStocks[productId]
  const anchorValue = (o && !o.deleted) ? o.value : (productMap[productId]?.initialStock ?? 0)
  const anchorDate = (o && !o.deleted && o.date) ? o.date : null
  if (anchorDate == null) return anchorValue

  let delta = 0
  for (const h of history) {
    if (h.deleted || h.date < anchorDate) continue
    const type = h.type || 'salida'
    // Registros heredados de tipo 'sync' (bitácora de una versión anterior que
    // sincronizaba el stock desde Excel) no son movimientos: sus items traen
    // {oldStock, newStock} y ningún `qty`, así que sumarlos daría NaN.
    if (type !== 'salida' && type !== 'entrada') continue
    const item = h.items.find(i => i.id === productId)
    if (!item) continue
    delta += type === 'salida' ? -item.qty : item.qty
  }
  return Math.max(0, anchorValue + delta)
}

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
  // Ciclo de pedido mensual: umbrales escalados desde el antiguo ciclo de 14 días (crítico <3, bajo <7).
  const days = getDaysRemaining(productId, { stock, history, productMap, lookback })
  if (days < 7) return 'critical'
  if (days < 15) return 'low'
  return 'ok'
}
