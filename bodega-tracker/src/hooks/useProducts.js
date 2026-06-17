import { useState, useMemo, useCallback } from 'react'
import { BASE_PRODUCTS } from '../utils/products.js'

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

export function useProducts() {
  const [customProducts, setCustomProducts] = useState(loadCustomProducts)

  const products = useMemo(
    () => [...BASE_PRODUCTS, ...customProducts],
    [customProducts],
  )

  const productMap = useMemo(
    () => Object.fromEntries(products.map(p => [p.id, p])),
    [products],
  )

  const addProducts = useCallback((excelNames) => {
    setCustomProducts(prev => {
      const existingIds = new Set([...BASE_PRODUCTS, ...prev].map(p => p.id))
      const newProducts = excelNames
        .map(name => {
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
            initialStock: 0,
            dailyRate: 0,
            isCustom: true,
          }
        })
        .filter(Boolean)

      if (newProducts.length === 0) return prev
      const updated = [...prev, ...newProducts]
      localStorage.setItem(LS_KEY, JSON.stringify(updated))
      return updated
    })
  }, [])

  return { products, productMap, addProducts }
}
