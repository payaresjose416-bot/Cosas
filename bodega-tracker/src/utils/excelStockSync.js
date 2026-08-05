import * as XLSX from 'xlsx'
import { normalize, matchProduct } from './excelExport.js'

const SHEET_NAME = 'Matriz de Consumo (2)'

// La columna que buscamos es la de RESTANTES — el saldo al cierre del ciclo,
// que es el conteo físico real. NO la de stock inicial (con la que arranca el
// ciclo), que en la matriz corporativa vive en una columna aparte y mucho más
// a la izquierda.
const STOCK_HEADER_KEYWORDS = [
  'restante',
  'saldo',
  'stock actual',
  'cantidad actual',
  'existencia',
  'disponible',
]

// Si el encabezado que matcheó también dice "inicial" (u otra señal de que es
// el arranque del ciclo, no el cierre), no es la columna que queremos: tomarla
// haría que el dashboard mostrara el stock con el que empezó el mes en vez del
// que queda hoy.
const NOT_CLOSING_STOCK_KEYWORDS = ['inicial', 'ingreso', 'compra', 'entrada']

// Los encabezados de la matriz no siempre están en la primera fila (suele haber
// título/subtítulo arriba), así que escaneamos varias filas antes de rendirnos.
const MAX_HEADER_ROW = 4

function findStockColumn(ws, range) {
  const maxRow = Math.min(MAX_HEADER_ROW, range.e.r)
  for (const kw of STOCK_HEADER_KEYWORDS) {
    for (let r = 0; r <= maxRow; r++) {
      for (let c = 0; c <= range.e.c; c++) {
        const cell = ws[XLSX.utils.encode_cell({ r, c })]
        if (!cell || cell.v == null) continue
        const norm = normalize(String(cell.v))
        if (!norm || !norm.includes(kw)) continue
        if (NOT_CLOSING_STOCK_KEYWORDS.some(bad => norm.includes(bad))) continue
        return { col: c, header: String(cell.v).trim() }
      }
    }
  }
  return { col: -1, header: null }
}

// Las columnas calculadas (Restantes = inicial − consumos) suelen ser fórmulas.
// Un .xlsx escrito por un script (openpyxl) guarda la fórmula pero NO su valor
// cacheado, así que cell.v viene vacío aunque Excel muestre un número. Sin este
// fallback esos productos se saltaban en silencio y su stock nunca se corregía.
export function readStockValue(cell) {
  if (!cell) return { value: null, reason: 'celda-vacia' }
  if (typeof cell.v === 'number') return { value: cell.v, reason: null }

  const raw = cell.w != null ? String(cell.w) : cell.v != null ? String(cell.v) : ''
  const cleaned = raw.replace(/\s/g, '').replace(',', '.')
  const n = Number(cleaned)
  if (cleaned !== '' && Number.isFinite(n)) return { value: n, reason: null }

  if (cell.f) return { value: null, reason: 'formula-sin-valor' }
  return { value: null, reason: 'no-numerico' }
}

export function detectStockSync(fileBuffer, products, stockMap) {
  const workbook = XLSX.read(new Uint8Array(fileBuffer), { type: 'array' })

  if (!workbook.SheetNames.includes(SHEET_NAME)) {
    throw new Error(`Hoja "${SHEET_NAME}" no encontrada en el archivo`)
  }

  const ws = workbook.Sheets[SHEET_NAME]
  const range = XLSX.utils.decode_range(ws['!ref'] || 'A1')

  const { col: stockCol, header: stockColHeader } = findStockColumn(ws, range)
  if (stockCol === -1) {
    throw new Error(
      'No se encontró una columna de stock en el Excel (se buscó un encabezado ' +
      'como "Restantes", "Saldo", "Stock actual" o "Existencia" en las primeras ' +
      `${MAX_HEADER_ROW + 1} filas). Verifica el archivo.`
    )
  }

  const existingChanges = []
  const newProducts = []
  const skipped = []
  const seen = new Set()

  for (let r = 2; r <= range.e.r; r++) {
    const nameCell = ws[XLSX.utils.encode_cell({ r, c: 1 })]
    if (!nameCell || nameCell.v == null) continue
    const raw = String(nameCell.v).trim()
    const norm = normalize(raw)
    if (norm.length < 3 || seen.has(norm)) continue
    seen.add(norm)

    const stockCell = ws[XLSX.utils.encode_cell({ r, c: stockCol })]
    const { value: newStock, reason } = readStockValue(stockCell)
    const productId = matchProduct(raw, products)

    if (newStock == null) {
      skipped.push({ name: raw, reason, matched: Boolean(productId) })
      continue
    }

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
    stockColHeader,
    existingChanges,
    newProducts,
    skipped,
  }
}
