// Reducers puros sobre el estado de inventario (historial, umbrales, ancla de
// stock inicial). Reciben estado plano y devuelven estado nuevo — sin
// useState, sin efectos. Usados por src/hooks/useInventory.js (envoltorio con
// estado de React) y por el CLI (que lee/escribe directo contra Supabase).
// `now` se inyecta para que el comportamiento sea determinista en tests.
//
// El stock actual NO es un contador guardado aparte — se calcula
// (`getCurrentStock` en core/status.js) a partir del ancla `initialStocks`
// (valor + fecha desde la que cuenta) y de `history`. Por eso `saveDay`/
// `deleteDay` solo tocan `history`: el efecto sobre el stock calculado es
// automático, no hay nada que "revertir" aparte.

export function historyForSaveDay(rawHistory, { date, items, type = 'salida', now = Date.now() }) {
  const filtered = rawHistory.filter(h => !(h.date === date && (h.type || 'salida') === type))
  return [...filtered, { date, type, items, updatedAt: now }]
    .sort((a, b) => a.date.localeCompare(b.date))
}

// Tombstone en vez de borrado real: al fusionar con la nube gana por updatedAt
// y el registro no resucita en otros dispositivos.
export function historyForDeleteDay(rawHistory, { date, type = 'salida', now = Date.now() }) {
  const filtered = rawHistory.filter(h => !(h.date === date && (h.type || 'salida') === type))
  return [...filtered, { date, type, items: [], deleted: true, updatedAt: now }]
    .sort((a, b) => a.date.localeCompare(b.date))
}

// El ancla de stock: `value` es el stock con el que arrancó el ciclo, `date`
// (ISO YYYY-MM-DD) es desde cuándo cuenta — los registros de `history` con
// fecha anterior a `date` no se descuentan/suman (ver getCurrentStock).
// Ambos campos viajan juntos bajo el mismo `updatedAt` porque son un solo
// hecho ("el día X había Y unidades"), nunca se editan por separado.
export function applySetInitialStock(initialStocks, { productId, value, date, now = Date.now() }) {
  const next = { ...initialStocks }
  if (value == null) next[productId] = { deleted: true, updatedAt: now }
  else next[productId] = { value: Math.max(0, Number(value) || 0), date: date ?? null, updatedAt: now }
  return next
}

export function applySetThreshold(thresholds, { productId, value, now = Date.now() }) {
  const next = { ...thresholds }
  if (value == null) next[productId] = { deleted: true, updatedAt: now }
  else next[productId] = {
    critical: Number(value.critical) || 0,
    low: Number(value.low) || 0,
    updatedAt: now,
  }
  return next
}
