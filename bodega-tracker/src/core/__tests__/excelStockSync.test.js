import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as XLSX from 'xlsx'
import { detectInitialStockSync } from '../../utils/excelStockSync.js'

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

test('detectInitialStockSync: encuentra la columna "Stock inicial" por encabezado y produce el diff', () => {
  const rows = [
    [],
    ['#', 'Producto', 'Stock inicial', '', '', '', 'Restantes'],
    [1, 'AZUCAR MANUELITA X 200 SOBRES', 5, '', '', '', 0],
    [2, 'DETERGENTE MULTI NEUTRO', 10, '', '', '', 3],
  ]
  const buf = makeBuffer(rows)
  // El stock actual de la app (0 y 10) es irrelevante para esta función — ni
  // siquiera se le pasa. Solo compara contra el "stock inicial" ya guardado.
  const result = detectInitialStockSync(buf, products, { azucar: 0, detergente: 10 })

  assert.equal(result.initialColHeader, 'Stock inicial')
  assert.equal(result.existingChanges.length, 1)
  assert.equal(result.existingChanges[0].id, 'azucar')
  assert.equal(result.existingChanges[0].oldInitial, 0)
  assert.equal(result.existingChanges[0].newInitial, 5)
  // Detergente: 10 (Excel) === 10 (app) -> sin cambio, aunque Restantes diga 3.
  // La columna Restantes NUNCA se lee para esto.
})

test('detectInitialStockSync: si no hay ninguna columna "Stock inicial", falla con error claro', () => {
  const rows = [
    [],
    ['#', 'Producto', 'Restantes'],
    [1, 'AZUCAR MANUELITA X 200 SOBRES', 5],
  ]
  const buf = makeBuffer(rows)
  assert.throws(() => detectInitialStockSync(buf, products, {}), /No se encontró la columna "Stock inicial"/)
})

test('detectInitialStockSync: encuentra el nombre por encabezado aunque no sea la columna B', () => {
  const rows = [
    ['Artículo', 'Categoría', 'Stock inicial'], // nombre en columna A, no B
    [],
    ['AZUCAR MANUELITA X 200 SOBRES', 'Cafeteria', 3],
  ]
  const buf = makeBuffer(rows)
  const result = detectInitialStockSync(buf, products, { azucar: 0 })

  assert.equal(result.nameColLetter, 'A')
  assert.equal(result.rowsWithName, 1)
  assert.equal(result.existingChanges[0].newInitial, 3)
})

test('detectInitialStockSync: si el nombre real vive en otra columna que B y no hay encabezado reconocible, reporta 0 filas con nombre en vez de fallar en silencio', () => {
  const rows = [
    [],
    ['#', 'X', 'Y', 'Stock inicial'],
    // el nombre real está en la columna A, la app sigue mirando B (fallback)
    ['AZUCAR MANUELITA X 200 SOBRES', '', '', 5],
  ]
  const buf = makeBuffer(rows)
  const result = detectInitialStockSync(buf, products, {})

  assert.equal(result.nameColLetter, 'B') // fallback, sin encabezado reconocido
  assert.equal(result.rowsWithName, 0)
  assert.equal(result.existingChanges.length, 0)
  assert.equal(result.newProducts.length, 0)
  assert.equal(result.skipped.length, 0)
  assert.ok(result.rowsScanned > 0) // sí se escanearon filas, solo no había nombre en B
})

// Caso real: el usuario compartió el .xlsx corporativo real, y su layout es
// exactamente este — "ID de producto" | "Nombre" | "Descripcion" (¡contiene
// la UNIDAD de medida, no una descripción!) | "Stock inicial" | ... . Con
// 'descripcion' antes que 'nombre' en la prioridad, la app tomaba la columna
// de unidades como si fuera el nombre, y como muchos productos comparten
// unidad, la deduplicación por nombre colapsaba ~30 productos en 6 filas.
test('detectInitialStockSync: layout real corporativo — "Nombre" gana sobre "Descripcion" (que es la unidad) e "ID de producto" no se confunde con nombre', () => {
  const rows = [
    ['INFORMACION DEL PRODUCTO', '', '', 'CONSUMO DIARIO'],
    ['ID de producto', 'Nombre', 'Descripcion', 'Stock inicial', 'Suministrado a', '', '', 'Restantes'],
    [1696, 'Ambientador glade aerosol', 'UNIDAD', 3, 'Servicios de Limpieza', '', '', 3],
    [2488, 'Aromatica Bamby Manzani x25x1gr', 'CAJA', 6, 'Servicios de Limpieza', '', '', 6],
    [6143, 'Aromatica Bamby Yerbabuena x 20 unid', 'CAJA', 2, 'Servicios de Limpieza', '', '', 0],
    ['', 'aromatica infusion frutos rojos x20 unid', 'CAJA', 6, 'Servicios de Limpieza', '', '', 6],
  ]
  const catalogo = [
    { id: 'ambientador', name: 'Ambientador Glade Aerosol', excelNames: ['ambientador glade'], initialStock: 3 },
    { id: 'aromatica_manz', name: 'Aromática Bamby Manzanilla', excelNames: ['bamby manzani'], initialStock: 1 },
    { id: 'aromatica_yerba', name: 'Aromática Bamby Yerbabuena', excelNames: ['bamby yerbabuena'], initialStock: 4 },
    { id: 'aromatica_frutos', name: 'Aromática Frutos Rojos', excelNames: ['frutos rojos'], initialStock: 1 },
  ]
  const buf = makeBuffer(rows)
  const result = detectInitialStockSync(buf, catalogo, {
    ambientador: 3, aromatica_manz: 6, aromatica_yerba: 2, aromatica_frutos: 6,
  })

  assert.equal(result.nameColHeader, 'Nombre')
  assert.equal(result.rowsWithName, 4)
  assert.equal(result.newProducts.length, 0) // ninguno cayó como "producto nuevo" por leer la unidad
  assert.equal(result.existingChanges.length, 0) // todos los "stock inicial" ya coincidían
})

// El caso reportado tras el fix anterior: una columna de código numérico con
// encabezado "Item" desviaba la detección (¡"item" matcheaba, pero apuntaba a
// códigos, no a nombres!) y el panel terminaba mostrando "1696", "2488"...
// como si fueran productos. 'item' ya no es palabra clave, y aunque lo fuera,
// la validación de contenido (mayoría de texto, no números) la descartaría.
test('detectInitialStockSync: una columna de código numérico con encabezado ambiguo no se confunde con la de nombre', () => {
  const rows = [
    [],
    ['Item', 'Descripción', 'Stock inicial'],
    [1696, 'AZUCAR MANUELITA X 200 SOBRES', 5],
    [2488, 'DETERGENTE MULTI NEUTRO', 10],
  ]
  const buf = makeBuffer(rows)
  const result = detectInitialStockSync(buf, products, { azucar: 0, detergente: 10 })

  assert.equal(result.nameColHeader, 'Descripción')
  assert.equal(result.existingChanges.length, 1)
  assert.equal(result.existingChanges[0].id, 'azucar')
  assert.equal(result.newProducts.length, 0) // nada quedó como "producto nuevo" numérico
})

// Si NINGUNA columna de texto matchea las palabras clave (el header real dice
// algo como "Insumo", que no está en la lista) y la única candidata que
// matchea por palabra es numérica, debe descartarla y caer al fallback (B) en
// vez de quedarse con la columna de códigos.
test('detectInitialStockSync: si la única columna que matchea por header es numérica, cae al fallback en vez de usarla', () => {
  const rows = [
    [],
    ['Elemento', 'Insumo', 'Stock inicial'], // 'Elemento' es el código (numérico), 'Insumo' no matchea ninguna keyword
    [1696, 'AZUCAR MANUELITA X 200 SOBRES', 5],
  ]
  const buf = makeBuffer(rows)
  const result = detectInitialStockSync(buf, products, { azucar: 0 })

  assert.equal(result.nameColLetter, 'B') // fallback: la columna A ("Elemento") es numérica, se descarta
})

// La rama de fórmula-sin-valor-cacheado de readStockValue (celda con .f pero
// sin .v ni .w, como la deja un .xlsx generado por script) ya está cubierta
// directamente en stockCell.test.js — reproducir esa celda a través de un
// roundtrip real de XLSX.write/read no es viable aquí: esta versión de la
// librería descarta las celdas de fórmula que no traen un .v cacheado al
// escribir un .xlsx, así que no hay forma de simular el archivo de origen
// sin ensamblar el XML del paquete a mano.
