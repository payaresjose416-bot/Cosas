import * as XLSX from 'xlsx'
import { normalize, matchProduct } from './excelExport.js'

const SHEET_NAME = 'Matriz de Consumo (2)'

const STOCK_HEADER_KEYWORDS = [
  'restante',
  'saldo',
  'stock actual',
  'cantidad actual',
  'existencia',
  'disponible',
]

function findStockColumn(ws, range) {
  for (const kw of STOCK_HEADER_KEYWORDS) {
    for (let r = 0; r <= Math.min(1, range.e.r); r++) {
      for (let c = 0; c <= range.e.c; c++) {
        const cell = ws[XLSX.utils.encode_cell({ r, c })]
        if (!cell || cell.v == null) continue
        const norm = normalize(String(cell.v))
        if (norm && norm.includes(kw)) return c
      }
    }
  }
  return -1
}

export function detectStockSync(fileBuffer, products, stockMap) {
  const workbook = XLSX.read(new Uint8Array(fileBuffer), { type: 'array' })

  if (!workbook.SheetNames.includes(SHEET_NAME)) {
    throw new Error(`Hoja "${SHEET_NAME}" no encontrada en el archivo`)
  }

  const ws = workbook.Sheets[SHEET_NAME]
  const range = XLSX.utils.decode_range(ws['!ref'] || 'A1')

  const stockCol = findStockColumn(ws, range)
  if (stockCol === -1) {
    throw new Error(
      'No se encontró una columna de stock en el Excel (se buscó un encabezado ' +
      'como "Restantes", "Saldo", "Stock actual" o "Existencia"). Verifica el archivo.'
    )
  }

  const existingChanges = []
  const newProducts = []
  const seen = new Set()

  for (let r = 2; r <= range.e.r; r++) {
    const nameCell = ws[XLSX.utils.encode_cell({ r, c: 1 })]
    if (!nameCell || nameCell.v == null) continue
    const raw = String(nameCell.v).trim()
    const norm = normalize(raw)
    if (norm.length < 3 || seen.has(norm)) continue
    seen.add(norm)

    const stockCell = ws[XLSX.utils.encode_cell({ r, c: stockCol })]
    if (!stockCell || typeof stockCell.v !== 'number') continue

    const newStock = stockCell.v
    const productId = matchProduct(raw, products)

    if (productId) {
      const product = products.find(p => p.id === productId)
      const oldStock = stockMap[productId] ?? product.initialStock ?? 0
      if (oldStock !== newStock) {
        existingChanges.push({ id: productId, name: product.name, oldStock, newStock })
      }
    } else {
      newProducts.push({ name: raw, stock: newStock })
    }
  }

  return {
    stockColLetter: XLSX.utils.encode_col(stockCol),
    existingChanges,
    newProducts,
  }
}
