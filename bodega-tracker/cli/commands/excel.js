import { parseArgs } from 'node:util'
import fs from 'node:fs'
import { writeToExcel } from '../../src/utils/excelExport.js'
import { detectStockSync } from '../../src/utils/excelStockSync.js'
import { detectNewProducts } from '../../src/utils/excelDetect.js'
import { applyStockSyncChanges } from '../../src/core/inventory.js'
import { loadProducts, loadHistory, loadStockEntries, saveStockEntries, flattenStock } from '../lib/store.js'
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
  const stockEntries = await loadStockEntries()
  const stockMap = flattenStock(stockEntries, products)

  const { existingChanges, newProducts } = detectStockSync(buf, products, stockMap)

  if (existingChanges.length === 0) {
    if (values.json) printJSON({ ok: true, existingChanges: [], newProducts })
    else {
      console.log('No hay cambios de stock que aplicar.')
      if (newProducts.length) console.log(`Productos nuevos en el Excel (no en el catálogo): ${newProducts.map(p => p.name).join(', ')}`)
    }
    return
  }

  const preview = () => {
    console.error('Cambios de stock detectados en el Excel:')
    printTable(['PRODUCTO', 'ANTES', 'DESPUÉS'], existingChanges.map(c => [c.name, c.oldStock, c.newStock]))
    if (newProducts.length) console.error(`\n(${newProducts.length} producto(s) nuevos en el Excel, sin match en el catálogo — usa "bodega producto-nuevo" para agregarlos)`)
  }

  const proceed = await confirmWrite({
    preview, dryRun: values['dry-run'], yes: values.yes,
    actionLabel: 'Aplicar estos cambios de stock',
  })
  if (!proceed) return

  const changes = existingChanges.map(c => ({ id: c.id, newStock: c.newStock }))
  const nextStock = applyStockSyncChanges(stockEntries, changes)
  await saveStockEntries(nextStock)

  if (values.json) printJSON({ ok: true, applied: existingChanges, newProducts })
  else console.log(`Aplicado: ${existingChanges.length} producto(s) actualizados.`)
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
