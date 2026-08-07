import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { loadFromCloud } from '../utils/supabase.js'
import { useSync } from './useSync.js'
import { toEntries, mergeThresholds, mergeHistory } from '../core/merge.js'
import {
  historyForSaveDay, historyForDeleteDay, applySetThreshold, applySetInitialStock,
} from '../core/inventory.js'
import {
  getDaysRemaining as coreGetDaysRemaining, getStatus as coreGetStatus, getCurrentStock,
} from '../core/status.js'

const KEYS = {
  HISTORY: 'bodega_history',
  LAST_DATE: 'bodega_lastDate',
  THRESHOLDS: 'bodega_thresholds',
  INITIAL_STOCKS: 'bodega_initial_stocks',
}

function todayISO() {
  return new Date().toISOString().slice(0, 10)
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

function initInitialStocks() {
  try {
    const stored = localStorage.getItem(KEYS.INITIAL_STOCKS)
    if (stored) return JSON.parse(stored)
  } catch {}
  return {}
}

export function useInventory(products, productMap) {
  const [rawHistory, setRawHistory] = useState(initHistory)
  const [thresholds, setThresholds] = useState(initThresholds)
  const [initialStocks, setInitialStocks] = useState(initInitialStocks)
  const skipSyncHistory = useRef(false)
  const skipSyncThresholds = useRef(false)
  const skipSyncInitialStocks = useRef(false)

  const history = useMemo(() => rawHistory.filter(h => !h.deleted), [rawHistory])

  // El stock actual NO se guarda aparte — se calcula desde el ancla
  // (initialStocks: valor + fecha desde la que cuenta) y el historial. Ver
  // getCurrentStock en core/status.js.
  const stock = useMemo(
    () => Object.fromEntries(products.map(p => [p.id, getCurrentStock(p.id, { initialStocks, history, productMap })])),
    [products, initialStocks, history, productMap],
  )

  const syncHistory = useSync('history', rawHistory, useCallback((cloudHistory) => {
    skipSyncHistory.current = true
    setRawHistory(prev => {
      const merged = mergeHistory(prev, cloudHistory)
      localStorage.setItem(KEYS.HISTORY, JSON.stringify(merged))
      return merged
    })
  }, []), mergeHistory)

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

  const syncInitialStocks = useSync('initial_stocks', initialStocks, useCallback((cloudInitialStocks) => {
    skipSyncInitialStocks.current = true
    setInitialStocks(prev => {
      const merged = mergeThresholds(prev, cloudInitialStocks)
      localStorage.setItem(KEYS.INITIAL_STOCKS, JSON.stringify(merged))
      return merged
    })
  }, []), mergeThresholds)

  useEffect(() => {
    localStorage.setItem(KEYS.INITIAL_STOCKS, JSON.stringify(initialStocks))
    if (skipSyncInitialStocks.current) { skipSyncInitialStocks.current = false; return }
    syncInitialStocks(initialStocks)
  }, [initialStocks, syncInitialStocks])

  // Migración de arranque, una sola vez por sesión: productos que traen un
  // ancla sin `date` (formato viejo, de antes de que el stock se calculara)
  // se anclan con el último valor que la app venía calculando con el modelo
  // anterior — leído una última vez de la clave nube legada 'stock', ya
  // retirada — y fecha de hoy. Así el Dashboard no cambia de número el día
  // del despliegue; el número solo se corrige cuando el usuario sincroniza
  // el Excel real (que trae el ancla y la fecha reales). Productos sin dato
  // legado quedan sin `date` (ver getCurrentStock: valor congelado) hasta
  // que se corrijan a mano o por Excel.
  const migratedLegacyStock = useRef(false)
  useEffect(() => {
    if (migratedLegacyStock.current) return
    const needsMigration = products.some(p => {
      const o = initialStocks[p.id]
      return !o || (!o.deleted && !o.date)
    })
    if (!needsMigration) return
    migratedLegacyStock.current = true
    loadFromCloud('stock').then(legacyRaw => {
      if (!legacyRaw) return
      const legacy = toEntries(legacyRaw)
      const today = todayISO()
      setInitialStocks(prev => {
        let next = prev
        for (const p of products) {
          const o = next[p.id]
          if (o && !o.deleted && o.date) continue
          const legacyQty = legacy[p.id]?.qty
          if (legacyQty == null) continue
          next = applySetInitialStock(next, { productId: p.id, value: legacyQty, date: today })
        }
        return next
      })
    })
  }, [products, initialStocks])

  const setThreshold = useCallback((productId, value) => {
    setThresholds(prev => applySetThreshold(prev, { productId, value }))
  }, [])

  const getInitialStock = useCallback((productId) => {
    const o = initialStocks[productId]
    if (o && !o.deleted) return o.value
    return productMap[productId]?.initialStock ?? 0
  }, [initialStocks, productMap])

  const getInitialStockDate = useCallback((productId) => {
    const o = initialStocks[productId]
    return (o && !o.deleted) ? (o.date ?? null) : null
  }, [initialStocks])

  // value === null borra el ancla (tombstone, vuelve al valor del catálogo).
  const setInitialStock = useCallback((productId, value, date) => {
    setInitialStocks(prev => applySetInitialStock(prev, { productId, value, date }))
  }, [])

  // Atajo de "editar stock actual": ancla el ciclo HOY con el valor dado —
  // desde ahí, cada registro futuro se descuenta/suma normalmente. Es
  // exactamente `setInitialStock(id, valor, hoy)`, con otro nombre porque
  // así es como el usuario piensa la acción ("esto es lo que hay ahora").
  const correctCurrentStock = useCallback((productId, value) => {
    setInitialStock(productId, value, todayISO())
  }, [setInitialStock])

  const saveDay = useCallback((date, items, type = 'salida') => {
    setRawHistory(prev => historyForSaveDay(prev, { date, items, type }))
    localStorage.setItem(KEYS.LAST_DATE, date)
  }, [])

  const deleteDay = useCallback((date, type = 'salida') => {
    setRawHistory(prev => historyForDeleteDay(prev, { date, type }))
  }, [])

  const getDaysRemaining = useCallback((productId, lookback = 7) =>
    coreGetDaysRemaining(productId, { stock, history, productMap, lookback }),
  [stock, history, productMap])

  const getStatus = useCallback((productId) =>
    coreGetStatus(productId, { stock, history, thresholds, productMap }),
  [stock, history, thresholds, productMap])

  // El Excel corporativo nunca sobrescribe el stock que la app calcula sola —
  // solo alimenta el ancla (valor + fecha) desde la que se cuenta. `changes`
  // es [{ id, newInitial }], `date` es la fecha (ISO) parseada del header
  // "Stock inicial" del Excel, única para toda la sincronización.
  const applyInitialStockSync = useCallback((changes, date) => {
    setInitialStocks(prev => {
      let next = prev
      for (const { id, newInitial } of changes) {
        next = applySetInitialStock(next, { productId: id, value: newInitial, date })
      }
      return next
    })
  }, [])

  return {
    stock, history, saveDay, deleteDay, getDaysRemaining, getStatus,
    applyInitialStockSync, thresholds, setThreshold, correctCurrentStock,
    initialStocks, getInitialStock, setInitialStock, getInitialStockDate,
  }
}
