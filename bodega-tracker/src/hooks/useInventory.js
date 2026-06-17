import { useState, useEffect, useCallback } from 'react'

const KEYS = {
  STOCK: 'bodega_stock',
  HISTORY: 'bodega_history',
  LAST_DATE: 'bodega_lastDate',
}

function initStock(products) {
  try {
    const stored = localStorage.getItem(KEYS.STOCK)
    if (stored) return JSON.parse(stored)
  } catch {}
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
  }, [stock])

  useEffect(() => {
    localStorage.setItem(KEYS.HISTORY, JSON.stringify(history))
  }, [history])

  const saveDay = useCallback((date, items) => {
    setHistory(prev => {
      const existing = prev.find(h => h.date === date)

      setStock(prevStock => {
        const next = { ...prevStock }
        if (existing) {
          for (const item of existing.items) {
            next[item.id] = (next[item.id] || 0) + item.qty
          }
        }
        for (const item of items) {
          next[item.id] = Math.max(0, (next[item.id] || 0) - item.qty)
        }
        return next
      })

      const filtered = prev.filter(h => h.date !== date)
      return [...filtered, { date, items }].sort((a, b) => a.date.localeCompare(b.date))
    })

    localStorage.setItem(KEYS.LAST_DATE, date)
  }, [])

  const deleteDay = useCallback((date) => {
    setHistory(prev => {
      const entry = prev.find(h => h.date === date)
      if (entry) {
        setStock(prevStock => {
          const next = { ...prevStock }
          for (const item of entry.items) {
            next[item.id] = (next[item.id] || 0) + item.qty
          }
          return next
        })
      }
      return prev.filter(h => h.date !== date)
    })
  }, [])

  const getDaysRemaining = useCallback((productId, lookback = 7) => {
    const product = productMap[productId]
    if (!product) return 0

    const currentStock = stock[productId] ?? product.initialStock

    const recent = history.slice(-lookback)
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

  return { stock, history, saveDay, deleteDay, getDaysRemaining, getStatus }
}
