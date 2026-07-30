// Acceso a la nube compartida (Supabase) para el CLI. El CLI no tiene estado
// local: cada comando de escritura lee la nube, aplica un reducer puro de
// src/core/, y guarda con el mismo patrón read-merge-write que usa la app web
// en useSync.syncToCloud (src/hooks/useSync.js) — así una escritura del CLI
// nunca pisa un cambio más reciente hecho desde el navegador.
import { loadFromCloud, saveToCloud } from '../../src/utils/supabase.js'
import { toEntries, mergeStock, mergeHistory, mergeThresholds, mergeProducts } from '../../src/core/merge.js'
import { BASE_PRODUCTS } from '../../src/utils/products.js'

export async function loadStockEntries() {
  return toEntries((await loadFromCloud('stock')) || {})
}

export async function loadHistory() {
  return (await loadFromCloud('history')) || []
}

export async function loadThresholds() {
  return (await loadFromCloud('thresholds')) || {}
}

export async function loadCustomProducts() {
  return (await loadFromCloud('custom_products')) || []
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

export const saveStockEntries = (next) => writeSynced('stock', mergeStock, next)
export const saveHistory = (next) => writeSynced('history', mergeHistory, next)
export const saveThresholds = (next) => writeSynced('thresholds', mergeThresholds, next)
export const saveCustomProducts = (next) => writeSynced('custom_products', mergeProducts, next)

// Vista plana { id: qty } a partir de stockEntries { id: {qty, updatedAt} },
// con fallback a initialStock para productos que aún no tienen entrada.
export function flattenStock(stockEntries, products) {
  const stock = {}
  for (const p of products) {
    stock[p.id] = stockEntries[p.id]?.qty ?? p.initialStock
  }
  return stock
}
