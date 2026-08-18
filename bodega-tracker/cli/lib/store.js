// Acceso a la nube compartida (Supabase) para el CLI. El CLI no tiene estado
// local: cada comando de escritura lee la nube, aplica un reducer puro de
// src/core/, y guarda con el mismo patrón read-merge-write que usa la app web
// en useSync.syncToCloud (src/hooks/useSync.js) — así una escritura del CLI
// nunca pisa un cambio más reciente hecho desde el navegador.
import { loadFromCloud, saveToCloud } from '../../src/utils/supabase.js'
import { mergeHistory, mergeThresholds, mergeProducts, mergeNotes } from '../../src/core/merge.js'
import { getCurrentStock } from '../../src/core/status.js'
import { BASE_PRODUCTS } from '../../src/utils/products.js'

export async function loadHistory() {
  return (await loadFromCloud('history')) || []
}

export async function loadThresholds() {
  return (await loadFromCloud('thresholds')) || {}
}

export async function loadInitialStocks() {
  return (await loadFromCloud('initial_stocks')) || {}
}

export async function loadCustomProducts() {
  return (await loadFromCloud('custom_products')) || []
}

export async function loadNotes() {
  return (await loadFromCloud('buzon')) || []
}

export async function loadProducts() {
  const custom = await loadCustomProducts()
  const products = [...BASE_PRODUCTS, ...custom]
  const productMap = Object.fromEntries(products.map(p => [p.id, p]))
  return { products, productMap }
}

async function writeSynced(key, mergeFn, next) {
  const freshCloud = await loadFromCloud(key)
  const finalValue = freshCloud != null ? mergeFn(next, freshCloud) : next
  const ok = await saveToCloud(key, finalValue)
  if (!ok) throw new Error(`No se pudo guardar "${key}" en Supabase.`)
  return finalValue
}

export const saveHistory = (next) => writeSynced('history', mergeHistory, next)
export const saveThresholds = (next) => writeSynced('thresholds', mergeThresholds, next)
export const saveCustomProducts = (next) => writeSynced('custom_products', mergeProducts, next)
// initialStocks sigue el mismo patrón {value, date, updatedAt} tombstoneable
// que thresholds (ver CLAUDE.md), así que reutiliza el mismo merge LWW.
export const saveInitialStocks = (next) => writeSynced('initial_stocks', mergeThresholds, next)
export const saveNotes = (next) => writeSynced('buzon', mergeNotes, next)

// El stock actual no se guarda — se calcula desde el ancla (initialStocks:
// valor + fecha) y el historial. Ver getCurrentStock en core/status.js.
export function flattenStock(initialStocks, history, products, productMap) {
  const out = {}
  for (const p of products) {
    out[p.id] = getCurrentStock(p.id, { initialStocks, history, productMap })
  }
  return out
}

// Vista plana { id: valorInicial } a partir de initialStocks { id: {value, date, updatedAt, deleted} },
// con fallback al initialStock estático del catálogo (mismo patrón que getInitialStock en useInventory.js).
export function flattenInitialStocks(initialStocks, products) {
  const out = {}
  for (const p of products) {
    const o = initialStocks[p.id]
    out[p.id] = (o && !o.deleted) ? o.value : p.initialStock
  }
  return out
}

// NO agregar aquí ninguna migración/siembra automática del ancla — ver la nota
// equivalente en src/hooks/useInventory.js. El ancla solo cambia por acción
// explícita: `bodega excel sync-stock`, `bodega set-stock`, o los editores del
// Dashboard en la app web.
