import { parseArgs } from 'node:util'
import fs from 'node:fs'
import { writeToExcel } from '../../src/utils/excelExport.js'
import { detectInitialStockSync } from '../../src/utils/excelStockSync.js'
import { detectNewProducts } from '../../src/utils/excelDetect.js'
import { applySetInitialStock } from '../../src/core/inventory.js'
import { loadProducts, loadHistory, loadInitialStocks, saveInitialStocks, flattenInitialStocks } from '../lib/store.js'
import { confirmWrite } from '../lib/confirm.js'
import { printTable, printJSON, die } from '../lib/format.js'

function readFile(filePath) {
  if (!fs.existsSync(filePath)) die(`No existe el archivo: ${filePath}`)
  return fs.readFileSync(filePath)
}

async function exportar(args) {
  const { values, positionals } = parseArgs({
    args, options: { o: { type: 'string' }, json: { type: 'boolean', default: false } }, allowPositionals: true,
  })
  const [filePath] = positionals
  if (!filePath) die('Uso: bodega excel exportar <archivo.xlsx> [-o salida.xlsx]')

  const buf = readFile(filePath)
  const { products } = await loadProducts()
  const history = await loadHistory()

  const { bytes, matched, unmatched } = writeToExcel(buf, history, products)

  const outPath = values.o || filePath.replace(/\.xlsx$/i, '') + '.actualizado.xlsx'
  fs.writeFileSync(outPath, Buffer.from(bytes))

  if (values.json) { printJSON({ ok: true, outPath, matched, unmatched }); return }
  console.log(`Escrito: ${outPath} (${matched} celdas actualizadas)`)
  if (unmatched.length) console.log(`Productos sin match en el Excel: ${unmatched.join(', ')}`)
}

// El Excel corporativo nunca sobrescribe el stock actual (eso lo calcula la
// app sola con lo registrado vía `bodega registrar`) — solo trae nombres de
// producto y el valor de referencia "Stock inicial".
async function syncStock(args) {
  const { values, positionals } = parseArgs({
    args,
    options: { yes: { type: 'boolean', default: false }, 'dry-run': { type: 'boolean', default: false }, json: { type: 'boolean', default: false } },
    allowPositionals: true,
  })
  const [filePath] = positionals
  if (!filePath) die('Uso: bodega excel sync-stock <archivo.xlsx>')

  const buf = readFile(filePath)
  const { products } = await loadProducts()
  const initialStocks = await loadInitialStocks()
  const initialStockMap = flattenInitialStocks(initialStocks, products)

  const {
    existingChanges, newProducts, skipped, initialColLetter, initialColHeader,
    nameColLetter, nameColHeader, rowsScanned, rowsWithName,
  } = detectInitialStockSync(buf, products, initialStockMap)

  // Los saltados son el fallo silencioso que más duele: su stock inicial queda
  // sin corregir y el dashboard sigue mostrando un número viejo. Siempre avisarlos.
  const warnSkipped = () => {
    if (!skipped.length) return
    console.error(`\n${skipped.length} producto(s) NO se pudieron leer (su stock inicial queda sin corregir):`)
    printTable(['PRODUCTO', 'MOTIVO'], skipped.map(s => [s.name, s.reason]))
    if (skipped.some(s => s.reason === 'formula-sin-valor')) {
      console.error('Sugerencia: abre el Excel en Excel/Sheets y guárdalo de nuevo para que queden los valores calculados.')
    }
  }

  if (existingChanges.length === 0) {
    if (values.json) {
      printJSON({
        ok: true, existingChanges: [], newProducts, skipped,
        initialColLetter, initialColHeader, nameColLetter, nameColHeader, rowsScanned, rowsWithName,
      })
    } else {
      console.log(`Columna de stock inicial: ${initialColLetter} ("${initialColHeader}") · columna de nombre: ${nameColLetter}${nameColHeader ? ` ("${nameColHeader}")` : ' (por defecto, sin encabezado detectado)'}`)
      console.log(`${rowsScanned} fila(s) revisadas, ${rowsWithName} con nombre de producto.`)
      if (rowsWithName === 0) {
        console.log(`Ningún nombre de producto se leyó en la columna ${nameColLetter} — probablemente los nombres están en otra columna en este archivo.`)
      } else {
        console.log('No hay cambios de stock inicial que aplicar.')
      }
      if (newProducts.length) console.log(`Productos nuevos en el Excel (no en el catálogo): ${newProducts.map(p => p.name).join(', ')}`)
      warnSkipped()
    }
    return
  }

  const preview = () => {
    console.error(`Cambios de stock inicial detectados en el Excel (columna ${initialColLetter} — "${initialColHeader}"). Esto NO toca el stock actual:`)
    printTable(['PRODUCTO', 'ANTES', 'DESPUÉS'], existingChanges.map(c => [c.name, c.oldInitial, c.newInitial]))
    if (newProducts.length) console.error(`\n(${newProducts.length} producto(s) nuevos en el Excel, sin match en el catálogo — usa "bodega producto-nuevo" para agregarlos)`)
    warnSkipped()
  }

  const proceed = await confirmWrite({
    preview, dryRun: values['dry-run'], yes: values.yes,
    actionLabel: 'Aplicar este stock inicial',
  })
  if (!proceed) return

  let nextInitialStocks = initialStocks
  for (const c of existingChanges) {
    nextInitialStocks = applySetInitialStock(nextInitialStocks, { productId: c.id, value: c.newInitial })
  }
  await saveInitialStocks(nextInitialStocks)

  if (values.json) printJSON({ ok: true, applied: existingChanges, newProducts, skipped })
  else console.log(`Aplicado: ${existingChanges.length} producto(s) actualizados (solo stock inicial).`)
}

async function detectar(args) {
  const { values, positionals } = parseArgs({ args, options: { json: { type: 'boolean', default: false } }, allowPositionals: true })
  const [filePath] = positionals
  if (!filePath) die('Uso: bodega excel detectar <archivo.xlsx>')

  const buf = readFile(filePath)
  const { products } = await loadProducts()
  const newNames = detectNewProducts(buf, products)

  if (values.json) { printJSON({ newNames }); return }
  if (newNames.length === 0) console.log('No hay productos nuevos en el Excel.')
  else {
    console.log('Productos en el Excel que no están en el catálogo:')
    for (const n of newNames) console.log(`  - ${n}`)
  }
}

const SUBCOMMANDS = { exportar, 'sync-stock': syncStock, detectar }

export async function run(args) {
  const [sub, ...rest] = args
  const handler = SUBCOMMANDS[sub]
  if (!handler) die(`Subcomando de excel desconocido: "${sub ?? ''}". Usa: exportar | sync-stock | detectar`)
  await handler(rest)
}
