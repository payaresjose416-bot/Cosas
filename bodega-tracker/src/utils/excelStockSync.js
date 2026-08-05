import * as XLSX from 'xlsx'
import { normalize, matchProduct } from './excelExport.js'

const SHEET_NAME = 'Matriz de Consumo (2)'

// El Excel corporativo NUNCA es la fuente del stock actual — eso lo calcula la
// app sola, descontando cada salida/entrada registrada. Lo único que se trae
// del Excel es (1) qué productos existen y (2) el "Stock inicial" con el que
// arrancó el ciclo actual, que alimenta el valor de referencia "inicial: N"
// del Dashboard — nunca el stock que se sigue moviendo con los registros.
const INITIAL_STOCK_HEADER_KEYWORDS = ['stock inicial', 'inicial']

// Igual que con la columna de stock: el nombre del producto no siempre cae en
// la columna B — la anchura del ciclo (y con ella, cuántas columnas de fecha
// hay antes de las columnas calculadas) puede correr todo el layout. Se busca
// por encabezado primero; si ninguno matchea (o valida, ver abajo), se cae a
// B como hasta ahora para no romper los archivos que sí siguen ese layout.
//
// El orden importa: en la matriz corporativa real las columnas van "ID de
// producto" | "Nombre" | "Descripcion" (¡esta última contiene la UNIDAD de
// medida, no una descripción!) | "Stock inicial" | ... — así que 'nombre' va
// primero (inequívoco) y 'descripcion' al final (demostradamente engañosa en
// esa plantilla). 'item' se excluye del todo: en la práctica es la columna
// de código numérico, no la del nombre.
const NAME_HEADER_KEYWORDS = ['nombre', 'producto', 'articulo', 'elemento', 'descripcion']
// "ID de producto" contiene la palabra 'producto' — sin esto, esa keyword se
// quedaría con la columna de código en vez de seguir buscando la de nombre.
const NAME_EXCLUDE_WORDS = ['id', 'codigo', 'referencia']
const DEFAULT_NAME_COL = 1 // columna B

// Los encabezados de la matriz no siempre están en la primera fila (suele haber
// título/subtítulo arriba), así que escaneamos varias filas antes de rendirnos.
const MAX_HEADER_ROW = 4

// Cuántas filas de datos se muestrean para validar que una columna candidata
// realmente contiene texto (nombres) y no números (códigos/cantidades) — así
// una columna como "Código Ítem" no puede pasar por la del nombre solo porque
// su encabezado matcheó una palabra clave ambigua.
const SAMPLE_ROWS = 10

function columnIsTextish(ws, range, col) {
  let textCount = 0
  let numericCount = 0
  const maxRow = Math.min(range.e.r, 1 + SAMPLE_ROWS)
  for (let r = 2; r <= maxRow; r++) {
    const cell = ws[XLSX.utils.encode_cell({ r, c: col })]
    if (!cell || cell.v == null || cell.v === '') continue
    if (cell.t === 'n' || (typeof cell.v === 'number')) numericCount++
    else textCount++
  }
  if (textCount + numericCount === 0) return false
  return textCount >= numericCount
}

// Match por palabra completa, no por substring — así 'id' no rechaza de paso
// un encabezado legítimo que solo *contiene* esas letras (ej. "Unidad").
function hasExcludedWord(norm, words) {
  const tokens = norm.split(' ')
  return words.some(w => tokens.includes(w))
}

function findHeaderColumn(ws, range, keywords, { exclude = [], validate } = {}) {
  const maxRow = Math.min(MAX_HEADER_ROW, range.e.r)
  for (const kw of keywords) {
    for (let r = 0; r <= maxRow; r++) {
      for (let c = 0; c <= range.e.c; c++) {
        const cell = ws[XLSX.utils.encode_cell({ r, c })]
        if (!cell || cell.v == null) continue
        const norm = normalize(String(cell.v))
        if (!norm || !norm.includes(kw)) continue
        if (hasExcludedWord(norm, exclude)) continue
        if (validate && !validate(c)) continue
        return { col: c, header: String(cell.v).trim() }
      }
    }
  }
  return { col: -1, header: null }
}

function findInitialStockColumn(ws, range) {
  return findHeaderColumn(ws, range, INITIAL_STOCK_HEADER_KEYWORDS)
}

function findNameColumn(ws, range) {
  const validate = (col) => columnIsTextish(ws, range, col)
  const found = findHeaderColumn(ws, range, NAME_HEADER_KEYWORDS, { exclude: NAME_EXCLUDE_WORDS, validate })
  if (found.col !== -1) return found
  return { col: DEFAULT_NAME_COL, header: null }
}

// La columna de Stock inicial puede tener fórmula (poco común, pero por si
// acaso) o venir como texto formateado en vez de número puro.
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

// Lee del Excel corporativo SOLO nombres de producto + Stock inicial. Nunca
// toca (ni siquiera lee para comparar) el stock actual/restantes — ese lo
// calcula la app sola con lo registrado en Registro. `initialStockMap` es
// `{ productId: valorInicialActualEnLaApp }`, solo para poder mostrar el
// diff antes/después en el panel de revisión.
export function detectInitialStockSync(fileBuffer, products, initialStockMap) {
  const workbook = XLSX.read(new Uint8Array(fileBuffer), { type: 'array' })

  if (!workbook.SheetNames.includes(SHEET_NAME)) {
    throw new Error(`Hoja "${SHEET_NAME}" no encontrada en el archivo`)
  }

  const ws = workbook.Sheets[SHEET_NAME]
  const range = XLSX.utils.decode_range(ws['!ref'] || 'A1')

  const { col: initialCol, header: initialColHeader } = findInitialStockColumn(ws, range)
  if (initialCol === -1) {
    throw new Error(
      'No se encontró la columna "Stock inicial" en el Excel (se buscó ese ' +
      `encabezado en las primeras ${MAX_HEADER_ROW + 1} filas). Verifica el archivo.`
    )
  }

  const { col: nameCol, header: nameColHeader } = findNameColumn(ws, range)

  const existingChanges = []
  const newProducts = []
  const skipped = []
  const seen = new Set()
  let rowsScanned = 0
  let rowsWithName = 0

  for (let r = 2; r <= range.e.r; r++) {
    rowsScanned++
    const nameCell = ws[XLSX.utils.encode_cell({ r, c: nameCol })]
    if (!nameCell || nameCell.v == null) continue
    const raw = String(nameCell.v).trim()
    const norm = normalize(raw)
    if (norm.length < 3 || seen.has(norm)) continue
    rowsWithName++
    seen.add(norm)

    const initialCell = ws[XLSX.utils.encode_cell({ r, c: initialCol })]
    const { value: newInitial, reason } = readStockValue(initialCell)
    const productId = matchProduct(raw, products)

    if (newInitial == null) {
      skipped.push({ name: raw, reason, matched: Boolean(productId) })
      continue
    }

    if (productId) {
      const product = products.find(p => p.id === productId)
      const oldInitial = initialStockMap[productId] ?? product.initialStock ?? 0
      if (oldInitial !== newInitial) {
        existingChanges.push({ id: productId, name: product.name, oldInitial, newInitial })
      }
    } else {
      newProducts.push({ name: raw, stock: newInitial })
    }
  }

  return {
    initialColLetter: XLSX.utils.encode_col(initialCol),
    initialColHeader,
    nameColLetter: XLSX.utils.encode_col(nameCol),
    nameColHeader,
    existingChanges,
    newProducts,
    skipped,
    rowsScanned,
    rowsWithName,
  }
}
