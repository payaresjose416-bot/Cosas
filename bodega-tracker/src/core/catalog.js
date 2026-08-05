// Utilidades puras de catálogo de productos (productos personalizados agregados
// por el usuario, fuera de BASE_PRODUCTS) y el matching de nombres contra la
// columna de productos del Excel corporativo.

export function normalize(str) {
  return String(str)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// Containment de subcadena contra `excelNames` (nunca contra `name`): un
// producto matchea si alguno de sus excelNames aparece literal dentro del
// nombre de la celda. Gana el excelName MÁS LARGO, para que una variante corta
// y genérica ('axion 450') no le robe la fila a una más específica.
export function matchProduct(excelName, products) {
  const norm = normalize(excelName)
  if (!norm) return null

  let bestMatch = null
  let bestLen = 0

  for (const product of products) {
    for (const eName of (product.excelNames || [])) {
      const normE = normalize(eName)
      if (norm.includes(normE) && normE.length > bestLen) {
        bestMatch = product.id
        bestLen = normE.length
      }
    }
  }

  return bestMatch
}

export function slugify(name) {
  return 'custom_' + name.toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
}

export function titleCase(str) {
  return str.replace(/\b\w/g, c => c.toUpperCase())
}

// items: array de strings (nombre) o { name, stock }. baseProducts + existing
// custom products se usan para no duplicar ids. Devuelve solo los productos
// NUEVOS (no la lista completa) — quien llama decide cómo combinarlos.
export function buildCustomProducts(items, existingProducts) {
  const existingIds = new Set(existingProducts.map(p => p.id))
  return items
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
}
