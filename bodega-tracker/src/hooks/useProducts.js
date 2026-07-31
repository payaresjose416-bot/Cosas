import { useState, useMemo, useCallback, useRef } from 'react'
import { BASE_PRODUCTS } from '../utils/products.js'
import { useSync } from './useSync.js'
import { mergeProducts } from '../core/merge.js'
import { buildCustomProducts } from '../core/catalog.js'

const LS_KEY = 'bodega_custom_products'

function loadCustomProducts() {
  try {
    const stored = localStorage.getItem(LS_KEY)
    return stored ? JSON.parse(stored) : []
  } catch { return [] }
}

export function useProducts() {
  const [customProducts, setCustomProducts] = useState(loadCustomProducts)
  const skipSync = useRef(false)

  const syncCustomProducts = useSync('custom_products', customProducts, useCallback((cloudProducts) => {
    skipSync.current = true
    setCustomProducts(prev => {
      const merged = mergeProducts(prev, cloudProducts)
      localStorage.setItem(LS_KEY, JSON.stringify(merged))
      return merged
    })
  }, []), mergeProducts)

  const products = useMemo(
    () => [...BASE_PRODUCTS, ...customProducts],
    [customProducts],
  )

  const productMap = useMemo(
    () => Object.fromEntries(products.map(p => [p.id, p])),
    [products],
  )

  const addProducts = useCallback((items) => {
    setCustomProducts(prev => {
      const newProducts = buildCustomProducts(items, [...BASE_PRODUCTS, ...prev])

      if (newProducts.length === 0) return prev
      const updated = [...prev, ...newProducts]
      localStorage.setItem(LS_KEY, JSON.stringify(updated))
      syncCustomProducts(updated)
      return updated
    })
  }, [syncCustomProducts])

  return { products, productMap, addProducts }
}
