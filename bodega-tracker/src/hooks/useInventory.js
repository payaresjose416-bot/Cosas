import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useSync } from './useSync.js'
import { mergeThresholds, mergeHistory } from '../core/merge.js'
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

  // NO agregar aquí ninguna migración/siembra automática del ancla. Hubo una
  // (leía la clave nube legada 'stock' y anclaba con fecha de hoy) y causó un
  // bug real: corría al montar usando `initialStocks` de localStorage, sin
  // esperar a que la carga de la nube resolviera, y escribía con un
  // `Date.now()` fresco — que por LWW le ganaba al ancla real recién traída
  // del Excel, devolviendo la fecha a "hoy" y dejando el stock congelado sin
  // descontar ninguna salida. El ancla solo debe cambiar por acción explícita
  // del usuario: sync del Excel, "editar stock inicial" o "editar stock actual".

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

  const saveDay = useCallback((date, items, type = 'salida', { merge = false } = {}) => {
    setRawHistory(prev => historyForSaveDay(prev, { date, items, type, merge }))
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
