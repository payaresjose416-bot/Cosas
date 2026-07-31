import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { STOCK_VERSION } from '../utils/products.js'
import { useSync } from './useSync.js'
import { toEntries, mergeStock, mergeThresholds, mergeHistory } from '../core/merge.js'
import {
  historyForSaveDay, stockBumpForSaveDay, historyForDeleteDay, stockBumpForDeleteDay,
  applyUpdateStock, applySetThreshold, applyStockSyncChanges,
} from '../core/inventory.js'
import { getDaysRemaining as coreGetDaysRemaining, getStatus as coreGetStatus } from '../core/status.js'

const KEYS = {
  STOCK: 'bodega_stock',
  HISTORY: 'bodega_history',
  LAST_DATE: 'bodega_lastDate',
  STOCK_VERSION: 'bodega_stock_version',
  THRESHOLDS: 'bodega_thresholds',
}

function initStockEntries(products) {
  try {
    const savedVersion = Number(localStorage.getItem(KEYS.STOCK_VERSION) || 0)
    if (savedVersion < STOCK_VERSION) {
      localStorage.removeItem(KEYS.STOCK)
      localStorage.setItem(KEYS.STOCK_VERSION, String(STOCK_VERSION))
      return Object.fromEntries(products.map(p => [p.id, { qty: p.initialStock, updatedAt: 0 }]))
    }
    const stored = localStorage.getItem(KEYS.STOCK)
    if (stored) return toEntries(JSON.parse(stored))
  } catch {}
  localStorage.setItem(KEYS.STOCK_VERSION, String(STOCK_VERSION))
  return Object.fromEntries(products.map(p => [p.id, { qty: p.initialStock, updatedAt: 0 }]))
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

export function useInventory(products, productMap) {
  const [stockEntries, setStockEntries] = useState(() => initStockEntries(products))
  const [rawHistory, setRawHistory] = useState(initHistory)
  const [thresholds, setThresholds] = useState(initThresholds)
  const skipSyncStock = useRef(false)
  const skipSyncHistory = useRef(false)
  const skipSyncThresholds = useRef(false)

  const history = useMemo(() => rawHistory.filter(h => !h.deleted), [rawHistory])
  const stock = useMemo(
    () => Object.fromEntries(Object.entries(stockEntries).map(([id, e]) => [id, e.qty])),
    [stockEntries],
  )

  const syncStock = useSync('stock', stockEntries, useCallback((cloudStock) => {
    skipSyncStock.current = true
    setStockEntries(prev => {
      const merged = mergeStock(prev, cloudStock)
      localStorage.setItem(KEYS.STOCK, JSON.stringify(merged))
      return merged
    })
  }, []), mergeStock)

  const syncHistory = useSync('history', rawHistory, useCallback((cloudHistory) => {
    skipSyncHistory.current = true
    setRawHistory(prev => {
      const merged = mergeHistory(prev, cloudHistory)
      localStorage.setItem(KEYS.HISTORY, JSON.stringify(merged))
      return merged
    })
  }, []), mergeHistory)

  useEffect(() => {
    setStockEntries(prev => {
      let changed = false
      const next = { ...prev }
      for (const p of products) {
        if (!(p.id in next)) {
          next[p.id] = { qty: p.initialStock, updatedAt: 0 }
          changed = true
        }
      }
      return changed ? next : prev
    })
  }, [products])

  useEffect(() => {
    localStorage.setItem(KEYS.STOCK, JSON.stringify(stockEntries))
    if (skipSyncStock.current) { skipSyncStock.current = false; return }
    syncStock(stockEntries)
  }, [stockEntries, syncStock])

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
    setThresholds(prev => applySetThreshold(prev, { productId, value }))
  }, [])

  const saveDay = useCallback((date, items, type = 'salida') => {
    setRawHistory(prev => {
      const existingEntry = prev.find(h => h.date === date && (h.type || 'salida') === type)
      setStockEntries(prevEntries => stockBumpForSaveDay(prevEntries, { existingEntry, items, type }))
      return historyForSaveDay(prev, { date, items, type })
    })

    localStorage.setItem(KEYS.LAST_DATE, date)
  }, [])

  const deleteDay = useCallback((date, type = 'salida') => {
    setRawHistory(prev => {
      const entry = prev.find(h => h.date === date && (h.type || 'salida') === type)
      setStockEntries(prevEntries => stockBumpForDeleteDay(prevEntries, { entry }))
      return historyForDeleteDay(prev, { date, type })
    })
  }, [])

  const getDaysRemaining = useCallback((productId, lookback = 7) =>
    coreGetDaysRemaining(productId, { stock, history, productMap, lookback }),
  [stock, history, productMap])

  const getStatus = useCallback((productId) =>
    coreGetStatus(productId, { stock, history, thresholds, productMap }),
  [stock, history, thresholds, productMap])

  const applyStockSync = useCallback((changes) => {
    setStockEntries(prev => applyStockSyncChanges(prev, changes))
  }, [])

  const updateStock = useCallback((productId, newQty) => {
    setStockEntries(prev => applyUpdateStock(prev, { productId, newQty }))
  }, [])

  return {
    stock, history, saveDay, deleteDay, getDaysRemaining, getStatus,
    applyStockSync, thresholds, setThreshold, updateStock,
  }
}
