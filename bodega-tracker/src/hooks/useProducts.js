import { useState, useMemo, useCallback, useRef } from 'react'
import { BASE_PRODUCTS } from '../utils/products.js'
import { useSync } from './useSync.js'

const LS_KEY = 'bodega_custom_products'

function loadCustomProducts() {
  try {
    const stored = localStorage.getItem(LS_KEY)
    return stored ? JSON.parse(stored) : []
  } catch { return [] }
}

function slugify(name) {
  return 'custom_' + name.toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
}

function titleCase(str) {
  return str.replace(/\b\w/g, c => c.toUpperCase())
}

function mergeProducts(local, cloud) {
  const map = new Map()
  for (const p of local) map.set(p.id, p)
  for (const p of cloud) if (!map.has(p.id)) map.set(p.id, p)
  return [...map.values()]
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
  }, []))

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
      const existingIds = new Set([...BASE_PRODUCTS, ...prev].map(p => p.id))
      const newProducts = items
        .map(item => {
          const name = typeof item === 'string' ? item : item.name
          const stock = typeof item === 'string' ? 0 : (Number(item.stock) || 0)
          const id = slugify(name)
          if (existingIds.has(id)) return null
          const words = name.toLowerCase()
            .normalize('NFD').replace(/[̀-ͯ]/g, '')
            .replace(/[^a-z0-9\s]/g, ' ').trim().split(/\s+/).filter(Boolean)
          return {
            id,
            name: titleCase(name.trim()),
            unit: 'UNIDAD',
            category: 'aseo',
            keywords: words,
            excelNames: [name.toLowerCase().trim()],
            initialStock: stock,
            dailyRate: 0,
            isCustom: true,
          }
        })
        .filter(Boolean)

      if (newProducts.length === 0) return prev
      const updated = [...prev, ...newProducts]
      localStorage.setItem(LS_KEY, JSON.stringify(updated))
      syncCustomProducts(updated)
      return updated
    })
  }, [syncCustomProducts])

  return { products, productMap, addProducts }
}
