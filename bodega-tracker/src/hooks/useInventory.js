import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { STOCK_VERSION } from '../utils/products.js'
import { useSync } from './useSync.js'

const KEYS = {
  STOCK: 'bodega_stock',
  HISTORY: 'bodega_history',
  LAST_DATE: 'bodega_lastDate',
  STOCK_VERSION: 'bodega_stock_version',
  THRESHOLDS: 'bodega_thresholds',
}

function initStock(products) {
  try {
    const savedVersion = Number(localStorage.getItem(KEYS.STOCK_VERSION) || 0)
    if (savedVersion < STOCK_VERSION) {
      localStorage.removeItem(KEYS.STOCK)
      localStorage.setItem(KEYS.STOCK_VERSION, String(STOCK_VERSION))
      return Object.fromEntries(products.map(p => [p.id, p.initialStock]))
    }
    const stored = localStorage.getItem(KEYS.STOCK)
    if (stored) return JSON.parse(stored)
  } catch {}
  localStorage.setItem(KEYS.STOCK_VERSION, String(STOCK_VERSION))
  return Object.fromEntries(products.map(p => [p.id, p.initialStock]))
}

function initHistory() {
  try {
    const stored = localStorage.getItem(KEYS.HISTORY)
    if (stored) return JSON.parse(stored)
  } catch {}
  return []
}

function initThresholds() {
  try {
    const stored = localStorage.getItem(KEYS.THRESHOLDS)
    if (stored) return JSON.parse(stored)
  } catch {}
  return {}
}

// LWW por clave: gana la versión con updatedAt más reciente (incluye tombstones
// de borrado, para que un "eliminar" no resucite al sincronizar). Entradas
// legacy sin updatedAt cuentan como 0 — en empate gana lo local (unión, v11).
function mergeThresholds(local, cloud) {
  const next = { ...local }
  for (const [id, cv] of Object.entries(cloud || {})) {
    const lv = next[id]
    if (!lv || (cv.updatedAt || 0) > (lv.updatedAt || 0)) next[id] = cv
  }
  return next
}

function mergeHistory(local, cloud) {
  const map = new Map()
  const keyOf = e => e.date + '|' + (e.type || 'salida')
  for (const entry of local) map.set(keyOf(entry), entry)
  for (const entry of cloud) {
    const k = keyOf(entry)
    const existing = map.get(k)
    if (!existing || (entry.updatedAt || 0) > (existing.updatedAt || 0)) map.set(k, entry)
  }
  return [...map.values()].sort((a, b) => a.date.localeCompare(b.date))
}

export function useInventory(products, productMap) {
  const [stock, setStock] = useState(() => initStock(products))
  const [rawHistory, setRawHistory] = useState(initHistory)
  const [thresholds, setThresholds] = useState(initThresholds)
  const skipSyncStock = useRef(false)
  const skipSyncHistory = useRef(false)
  const skipSyncThresholds = useRef(false)

  const history = useMemo(() => rawHistory.filter(h => !h.deleted), [rawHistory])

  const syncStock = useSync('stock', stock, useCallback((cloudStock) => {
    skipSyncStock.current = true
    setStock(cloudStock)
    localStorage.setItem(KEYS.STOCK, JSON.stringify(cloudStock))
  }, []))

  const syncHistory = useSync('history', rawHistory, useCallback((cloudHistory) => {
    skipSyncHistory.current = true
    setRawHistory(prev => {
      const merged = mergeHistory(prev, cloudHistory)
      localStorage.setItem(KEYS.HISTORY, JSON.stringify(merged))
      return merged
    })
  }, []), mergeHistory)

  useEffect(() => {
    setStock(prev => {
      let changed = false
      const next = { ...prev }
      for (const p of products) {
        if (!(p.id in next)) {
          next[p.id] = p.initialStock
          changed = true
        }
      }
      return changed ? next : prev
    })
  }, [products])

  useEffect(() => {
    localStorage.setItem(KEYS.STOCK, JSON.stringify(stock))
    if (skipSyncStock.current) { skipSyncStock.current = false; return }
    syncStock(stock)
  }, [stock, syncStock])

  useEffect(() => {
    localStorage.setItem(KEYS.HISTORY, JSON.stringify(rawHistory))
    if (skipSyncHistory.current) { skipSyncHistory.current = false; return }
    syncHistory(rawHistory)
  }, [rawHistory, syncHistory])

  const syncThresholds = useSync('thresholds', thresholds, useCallback((cloudThresholds) => {
    skipSyncThresholds.current = true
    setThresholds(prev => {
      const merged = mergeThresholds(prev, cloudThresholds)
      localStorage.setItem(KEYS.THRESHOLDS, JSON.stringify(merged))
      return merged
    })
  }, []), mergeThresholds)

  useEffect(() => {
    localStorage.setItem(KEYS.THRESHOLDS, JSON.stringify(thresholds))
    if (skipSyncThresholds.current) { skipSyncThresholds.current = false; return }
    syncThresholds(thresholds)
  }, [thresholds, syncThresholds])

  const setThreshold = useCallback((productId, value) => {
    setThresholds(prev => {
      const next = { ...prev }
      if (value == null) next[productId] = { deleted: true, updatedAt: Date.now() }
      else next[productId] = {
        critical: Number(value.critical) || 0,
        low: Number(value.low) || 0,
        updatedAt: Date.now(),
      }
      return next
    })
  }, [])

  const saveDay = useCallback((date, items, type = 'salida') => {
    setRawHistory(prev => {
      const existing = prev.find(h => h.date === date && (h.type || 'salida') === type)

      setStock(prevStock => {
        const next = { ...prevStock }
        if (existing && !existing.deleted) {
          for (const item of existing.items) {
            if (type === 'salida') next[item.id] = (next[item.id] || 0) + item.qty
            else next[item.id] = Math.max(0, (next[item.id] || 0) - item.qty)
          }
        }
        for (const item of items) {
          if (type === 'salida') next[item.id] = Math.max(0, (next[item.id] || 0) - item.qty)
          else next[item.id] = (next[item.id] || 0) + item.qty
        }
        return next
      })

      const filtered = prev.filter(h => !(h.date === date && (h.type || 'salida') === type))
      return [...filtered, { date, type, items, updatedAt: Date.now() }]
        .sort((a, b) => a.date.localeCompare(b.date))
    })

    localStorage.setItem(KEYS.LAST_DATE, date)
  }, [])

  const deleteDay = useCallback((date, type = 'salida') => {
    setRawHistory(prev => {
      const entry = prev.find(h => h.date === date && (h.type || 'salida') === type)
      if (entry && !entry.deleted) {
        setStock(prevStock => {
          const next = { ...prevStock }
          for (const item of entry.items) {
            if ((entry.type || 'salida') === 'salida') next[item.id] = (next[item.id] || 0) + item.qty
            else next[item.id] = Math.max(0, (next[item.id] || 0) - item.qty)
          }
          return next
        })
      }
      // Tombstone en vez de borrado real: al fusionar con la nube gana por
      // updatedAt y el registro no resucita en otros dispositivos.
      const filtered = prev.filter(h => !(h.date === date && (h.type || 'salida') === type))
      return [...filtered, { date, type, items: [], deleted: true, updatedAt: Date.now() }]
        .sort((a, b) => a.date.localeCompare(b.date))
    })
  }, [])

  const getDaysRemaining = useCallback((productId, lookback = 7) => {
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
  }, [stock, history, productMap])

  const getStatus = useCallback((productId) => {
    const t = thresholds[productId]
    if (t && !t.deleted) {
      const currentStock = stock[productId] ?? productMap[productId]?.initialStock ?? 0
      if (currentStock <= t.critical) return 'critical'
      if (currentStock <= t.low) return 'low'
      return 'ok'
    }
    const days = getDaysRemaining(productId)
    if (days < 3) return 'critical'
    if (days < 7) return 'low'
    return 'ok'
  }, [getDaysRemaining, thresholds, stock, productMap])

  const applyStockSync = useCallback((changes) => {
    setStock(prev => {
      const next = { ...prev }
      for (const { id, newStock } of changes) next[id] = newStock
      return next
    })
  }, [])

  return {
    stock, history, saveDay, deleteDay, getDaysRemaining, getStatus,
    applyStockSync, thresholds, setThreshold,
  }
}
