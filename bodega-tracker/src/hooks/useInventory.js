import { useState, useEffect, useCallback, useRef } from 'react'
import { STOCK_VERSION } from '../utils/products.js'
import { useSync } from './useSync.js'

const KEYS = {
  STOCK: 'bodega_stock',
  HISTORY: 'bodega_history',
  LAST_DATE: 'bodega_lastDate',
  STOCK_VERSION: 'bodega_stock_version',
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

export function useInventory(products, productMap) {
  const [stock, setStock] = useState(() => initStock(products))
  const [history, setHistory] = useState(initHistory)
  const skipSyncStock = useRef(false)
  const skipSyncHistory = useRef(false)

  const syncStock = useSync('stock', stock, useCallback((cloudStock) => {
    skipSyncStock.current = true
    setStock(cloudStock)
    localStorage.setItem(KEYS.STOCK, JSON.stringify(cloudStock))
  }, []))

  const syncHistory = useSync('history', history, useCallback((cloudHistory) => {
    skipSyncHistory.current = true
    setHistory(cloudHistory)
    localStorage.setItem(KEYS.HISTORY, JSON.stringify(cloudHistory))
  }, []))

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
    localStorage.setItem(KEYS.HISTORY, JSON.stringify(history))
    if (skipSyncHistory.current) { skipSyncHistory.current = false; return }
    syncHistory(history)
  }, [history, syncHistory])

  const saveDay = useCallback((date, items, type = 'salida') => {
    setHistory(prev => {
      const existing = prev.find(h => h.date === date && (h.type || 'salida') === type)

      setStock(prevStock => {
        const next = { ...prevStock }
        if (existing) {
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
      return [...filtered, { date, type, items }].sort((a, b) => a.date.localeCompare(b.date))
    })

    localStorage.setItem(KEYS.LAST_DATE, date)
  }, [])

  const deleteDay = useCallback((date, type = 'salida') => {
    setHistory(prev => {
      const entry = prev.find(h => h.date === date && (h.type || 'salida') === type)
      if (entry) {
        setStock(prevStock => {
          const next = { ...prevStock }
          for (const item of entry.items) {
            if ((entry.type || 'salida') === 'salida') next[item.id] = (next[item.id] || 0) + item.qty
            else next[item.id] = Math.max(0, (next[item.id] || 0) - item.qty)
          }
          return next
        })
      }
      return prev.filter(h => !(h.date === date && (h.type || 'salida') === type))
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
    const days = getDaysRemaining(productId)
    if (days < 3) return 'critical'
    if (days < 7) return 'low'
    return 'ok'
  }, [getDaysRemaining])

  const applyStockSync = useCallback((changes) => {
    setStock(prev => {
      const next = { ...prev }
      for (const { id, newStock } of changes) next[id] = newStock
      return next
    })
  }, [])

  return { stock, history, saveDay, deleteDay, getDaysRemaining, getStatus, applyStockSync }
}
