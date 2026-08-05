import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as XLSX from 'xlsx'
import { detectStockSync } from '../../utils/excelStockSync.js'

const products = [
  { id: 'azucar', name: 'Azúcar Manuelita x200 Sobres', excelNames: ['azucar manuelita', 'azucar'], initialStock: 0 },
  { id: 'detergente', name: 'Detergente Multi Neutro x1kg', excelNames: ['detergente'], initialStock: 0 },
]

// Construye un workbook con la hoja "Matriz de Consumo (2)" a partir de una
// matriz de filas (aoa), tal como haría el control de inventario real.
function makeBuffer(rows, sheetName = 'Matriz de Consumo (2)') {
  const wb = XLSX.utils.book_new()
  const ws = XLSX.utils.aoa_to_sheet(rows)
  XLSX.utils.book_append_sheet(wb, ws, sheetName)
  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' })
}

test('detectStockSync: encuentra la columna de restantes por encabezado y produce el diff', () => {
  const rows = [
    [],
    ['#', 'Producto', 'Stock inicial', '', '', '', 'Restantes'],
    [1, 'AZUCAR MANUELITA X 200 SOBRES', 10, '', '', '', 5],
    [2, 'DETERGENTE MULTI NEUTRO', 10, '', '', '', 10],
  ]
  const buf = makeBuffer(rows)
  const result = detectStockSync(buf, products, { azucar: 0, detergente: 10 })

  assert.equal(result.stockColHeader, 'Restantes')
  assert.equal(result.existingChanges.length, 1)
  assert.equal(result.existingChanges[0].id, 'azucar')
  assert.equal(result.existingChanges[0].oldStock, 0)
  assert.equal(result.existingChanges[0].newStock, 5)
})

test('detectStockSync: nunca toma una columna que diga "stock inicial" como columna de cierre', () => {
  // Ninguna columna dice "restante" — solo hay "stock inicial". No debe
  // confundirla y usarla como si fuera el cierre del ciclo.
  const rows = [
    [],
    ['#', 'Producto', 'Stock inicial'],
    [1, 'AZUCAR MANUELITA X 200 SOBRES', 10],
  ]
  const buf = makeBuffer(rows)
  assert.throws(() => detectStockSync(buf, products, {}), /No se encontró una columna de stock/)
})

test('detectStockSync: encuentra el nombre por encabezado aunque no sea la columna B', () => {
  const rows = [
    ['Artículo', 'Categoría', 'Restantes'], // nombre en columna A, no B
    [],
    ['AZUCAR MANUELITA X 200 SOBRES', 'Cafeteria', 3],
  ]
  const buf = makeBuffer(rows)
  const result = detectStockSync(buf, products, { azucar: 0 })

  assert.equal(result.nameColLetter, 'A')
  assert.equal(result.rowsWithName, 1)
  assert.equal(result.existingChanges[0].newStock, 3)
})

test('detectStockSync: si el nombre real vive en otra columna que B y no hay encabezado reconocible, reporta 0 filas con nombre en vez de fallar en silencio', () => {
  const rows = [
    [],
    ['#', 'X', 'Y', 'Restantes'],
    // el nombre real está en la columna A, la app sigue mirando B (fallback)
    ['AZUCAR MANUELITA X 200 SOBRES', '', '', 5],
  ]
  const buf = makeBuffer(rows)
  const result = detectStockSync(buf, products, {})

  assert.equal(result.nameColLetter, 'B') // fallback, sin encabezado reconocido
  assert.equal(result.rowsWithName, 0)
  assert.equal(result.existingChanges.length, 0)
  assert.equal(result.newProducts.length, 0)
  assert.equal(result.skipped.length, 0)
  assert.ok(result.rowsScanned > 0) // sí se escanearon filas, solo no había nombre en B
})

// La rama de fórmula-sin-valor-cacheado de readStockValue (celda con .f pero
// sin .v ni .w, como la deja un .xlsx generado por script) ya está cubierta
// directamente en stockCell.test.js — reproducir esa celda a través de un
// roundtrip real de XLSX.write/read no es viable aquí: esta versión de la
// librería descarta las celdas de fórmula que no traen un .v cacheado al
// escribir un .xlsx, así que no hay forma de simular el archivo de origen
// sin ensamblar el XML del paquete a mano.
