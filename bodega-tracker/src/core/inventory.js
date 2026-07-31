// Reducers puros sobre el estado de inventario (stock, historial, umbrales).
// Reciben estado plano y devuelven estado nuevo — sin useState, sin efectos.
// Usados por src/hooks/useInventory.js (envoltorio con estado de React) y por
// el CLI (que lee/escribe directo contra Supabase). `now` se inyecta para que
// el comportamiento sea determinista en tests.
//
// Cada operación se expone en dos formas:
//   - piezas granulares (historyForX / stockBumpForX) — las usa el hook, que
//     necesita disparar dos setState de React por separado (uno para stock,
//     otro para historial) tal como lo hacía el código original.
//   - una función combinada (applyX) — la usa el CLI, que no tiene estado de
//     React y solo necesita "un estado nuevo" de una sola vez.

function findEntry(rawHistory, date, type) {
  return rawHistory.find(h => h.date === date && (h.type || 'salida') === type)
}

export function historyForSaveDay(rawHistory, { date, items, type = 'salida', now = Date.now() }) {
  const filtered = rawHistory.filter(h => !(h.date === date && (h.type || 'salida') === type))
  return [...filtered, { date, type, items, updatedAt: now }]
    .sort((a, b) => a.date.localeCompare(b.date))
}

// Revierte el efecto del registro existente (si lo hay) y aplica el nuevo.
export function stockBumpForSaveDay(stockEntries, { existingEntry, items, type = 'salida', now = Date.now() }) {
  const next = { ...stockEntries }
  const bump = (id, delta) => {
    const cur = next[id]?.qty ?? 0
    next[id] = { qty: Math.max(0, cur + delta), updatedAt: now }
  }
  if (existingEntry && !existingEntry.deleted) {
    for (const item of existingEntry.items) {
      bump(item.id, type === 'salida' ? item.qty : -item.qty)
    }
  }
  for (const item of items) {
    bump(item.id, type === 'salida' ? -item.qty : item.qty)
  }
  return next
}

export function applySaveDay(stockEntries, rawHistory, opts) {
  const existingEntry = findEntry(rawHistory, opts.date, opts.type || 'salida')
  return {
    stockEntries: stockBumpForSaveDay(stockEntries, { ...opts, existingEntry }),
    rawHistory: historyForSaveDay(rawHistory, opts),
  }
}

// Tombstone en vez de borrado real: al fusionar con la nube gana por updatedAt
// y el registro no resucita en otros dispositivos.
export function historyForDeleteDay(rawHistory, { date, type = 'salida', now = Date.now() }) {
  const filtered = rawHistory.filter(h => !(h.date === date && (h.type || 'salida') === type))
  return [...filtered, { date, type, items: [], deleted: true, updatedAt: now }]
    .sort((a, b) => a.date.localeCompare(b.date))
}

export function stockBumpForDeleteDay(stockEntries, { entry, now = Date.now() }) {
  if (!entry || entry.deleted) return stockEntries
  const next = { ...stockEntries }
  for (const item of entry.items) {
    const cur = next[item.id]?.qty ?? 0
    const delta = (entry.type || 'salida') === 'salida' ? item.qty : -item.qty
    next[item.id] = { qty: Math.max(0, cur + delta), updatedAt: now }
  }
  return next
}

export function applyDeleteDay(stockEntries, rawHistory, opts) {
  const entry = findEntry(rawHistory, opts.date, opts.type || 'salida')
  return {
    stockEntries: stockBumpForDeleteDay(stockEntries, { ...opts, entry }),
    rawHistory: historyForDeleteDay(rawHistory, opts),
  }
}

export function applyUpdateStock(stockEntries, { productId, newQty, now = Date.now() }) {
  return {
    ...stockEntries,
    [productId]: { qty: Math.max(0, Number(newQty) || 0), updatedAt: now },
  }
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

// `changes` es [{ id, newStock }], tal como lo produce detectStockSync
// (src/utils/excelStockSync.js).
export function applyStockSyncChanges(stockEntries, changes, now = Date.now()) {
  const next = { ...stockEntries }
  for (const { id, newStock } of changes) next[id] = { qty: newStock, updatedAt: now }
  return next
}
