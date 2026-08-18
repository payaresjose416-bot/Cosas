// Tools del Excel corporativo — mapeo de cli/commands/excel.js. El Excel
// nunca sobrescribe el stock actual (eso lo calcula la app sola con lo
// registrado vía bodega_registrar) — solo trae nombres de producto y el
// valor de referencia "stock inicial" (el ancla), con su fecha.
// Rutas de archivo son locales a la máquina donde corre el servidor MCP
// (igual que el CLI: `bodega excel ... <archivo.xlsx>` ya asume rutas locales).
import { z } from 'zod'
import fs from 'node:fs'
import { writeToExcel } from '../../src/utils/excelExport.js'
import { detectInitialStockSync } from '../../src/utils/excelStockSync.js'
import { detectNewProducts } from '../../src/utils/excelDetect.js'
import { applySetInitialStock } from '../../src/core/inventory.js'
import { loadProducts, loadHistory, loadInitialStocks, saveInitialStocks } from '../../cli/lib/store.js'
import { CliError } from '../../cli/lib/format.js'
import { registerTool } from '../lib/toolError.js'
import { issueToken, consumeToken } from '../lib/confirmTokens.js'

function readExcelFile(filePath) {
  if (!fs.existsSync(filePath)) throw new CliError(`No existe el archivo: ${filePath}`)
  return fs.readFileSync(filePath)
}

function buildCurrentAnchors(products, initialStocks) {
  return Object.fromEntries(products.map(p => {
    const o = initialStocks[p.id]
    return [p.id, { value: (o && !o.deleted) ? o.value : (p.initialStock ?? 0), date: (o && !o.deleted) ? (o.date ?? null) : null }]
  }))
}

export function registerExcelTools(server) {
  // Solo lectura — el CLI tampoco pide confirmación para esta.
  registerTool(server,
    'bodega_excel_detectar',
    {
      title: 'Detectar productos nuevos en el Excel corporativo',
      description: 'Lee el Excel corporativo de consumo y lista nombres de producto que no están en el catálogo de bodega. Solo lectura, no toca Supabase.',
      inputSchema: { archivo: z.string().describe('ruta local absoluta al .xlsx') },
    },
    async ({ archivo }) => {
      const buf = readExcelFile(archivo)
      const { products } = await loadProducts()
      const newNames = detectNewProducts(buf, products)
      return { content: [{ type: 'text', text: JSON.stringify({ newNames }, null, 2) }] }
    },
  )

  // Escribe un .xlsx local, NO toca Supabase — el CLI tampoco pide
  // confirmación para esto (excel.js -> exportar()), así que se mantiene
  // igual: sin par preview/confirmar.
  registerTool(server,
    'bodega_excel_exportar',
    {
      title: 'Exportar historial al Excel corporativo',
      description: 'Vuelca el historial de salidas registrado en bodega al Excel corporativo (hoja "Matriz de Consumo (2)") y escribe un archivo nuevo. No modifica Supabase, solo genera un archivo local.',
      inputSchema: {
        archivo: z.string().describe('ruta local absoluta al .xlsx de entrada'),
        salida: z.string().describe('ruta de salida; por defecto <archivo>.actualizado.xlsx').optional(),
      },
    },
    async ({ archivo, salida }) => {
      const buf = readExcelFile(archivo)
      const { products } = await loadProducts()
      const history = await loadHistory()

      const { bytes, matched, unmatched } = writeToExcel(buf, history, products)
      const outPath = salida || archivo.replace(/\.xlsx$/i, '') + '.actualizado.xlsx'
      fs.writeFileSync(outPath, Buffer.from(bytes))

      return { content: [{ type: 'text', text: JSON.stringify({ ok: true, outPath, matched, unmatched }, null, 2) }] }
    },
  )

  // Compara la columna "Stock inicial" del Excel contra el ancla en vivo —
  // SÍ escribe en Supabase (initial_stocks), por eso lleva el par
  // preview/confirmar. `confirmar` relee el Excel y recalcula antes de
  // aplicar, para no aplicar un diff basado en un ancla que ya cambió entre
  // el preview y la confirmación. Nunca toca el stock actual directamente.
  registerTool(server,
    'bodega_excel_sync_stock_preview',
    {
      title: 'Vista previa: sincronizar el stock inicial desde el Excel',
      description: 'Compara la columna "Stock inicial" del Excel corporativo contra el ancla en vivo de bodega y muestra los cambios que se aplicarían, sin escribir todavía. No toca el stock actual.',
      inputSchema: {
        archivo: z.string().describe('ruta local absoluta al .xlsx'),
        fecha: z.string().describe('YYYY-MM-DD, fallback si no se puede leer la fecha del encabezado del Excel').optional(),
      },
    },
    async ({ archivo, fecha }) => {
      const buf = readExcelFile(archivo)
      const { products } = await loadProducts()
      const initialStocks = await loadInitialStocks()
      const currentAnchors = buildCurrentAnchors(products, initialStocks)

      const {
        existingChanges, newProducts, skipped, initialColLetter, initialColHeader, initialDate,
        nameColLetter, nameColHeader, rowsScanned, rowsWithName,
      } = detectInitialStockSync(buf, products, currentAnchors)

      const effectiveDate = initialDate ?? fecha
      if (!effectiveDate && existingChanges.length > 0) {
        throw new CliError(`No se pudo leer la fecha del encabezado "${initialColHeader}". Pásala en "fecha" (YYYY-MM-DD).`)
      }

      if (existingChanges.length === 0) {
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              ok: true, existingChanges: [], newProducts, skipped,
              initialColLetter, initialColHeader, nameColLetter, nameColHeader, rowsScanned, rowsWithName,
            }, null, 2),
          }],
        }
      }

      const confirmToken = issueToken('bodega_excel_sync_stock', { archivo, fecha })
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            existingChanges, newProducts, skipped, fechaVigente: effectiveDate,
            initialColLetter, initialColHeader, nameColLetter, nameColHeader, rowsScanned, rowsWithName,
            confirmToken,
          }, null, 2),
        }],
      }
    },
  )

  registerTool(server,
    'bodega_excel_sync_stock_confirmar',
    {
      title: 'Aplicar: sincronizar el stock inicial desde el Excel',
      description: 'Aplica la sincronización de stock inicial ya mostrada en bodega_excel_sync_stock_preview. Vuelve a leer el Excel y a recalcular antes de escribir, por si el ancla cambió desde el preview.',
      inputSchema: {
        archivo: z.string(),
        fecha: z.string().optional(),
        confirmToken: z.string(),
      },
    },
    async ({ archivo, fecha, confirmToken }) => {
      consumeToken('bodega_excel_sync_stock', confirmToken, { archivo, fecha })

      const buf = readExcelFile(archivo)
      const { products } = await loadProducts()
      const initialStocks = await loadInitialStocks()
      const currentAnchors = buildCurrentAnchors(products, initialStocks)

      const { existingChanges, newProducts, skipped, initialColHeader, initialDate } = detectInitialStockSync(buf, products, currentAnchors)
      const effectiveDate = initialDate ?? fecha
      if (!effectiveDate && existingChanges.length > 0) {
        throw new CliError(`No se pudo leer la fecha del encabezado "${initialColHeader}". Pásala en "fecha" (YYYY-MM-DD).`)
      }
      if (existingChanges.length === 0) {
        return { content: [{ type: 'text', text: JSON.stringify({ ok: true, applied: [], newProducts, skipped }, null, 2) }] }
      }

      let nextInitialStocks = initialStocks
      for (const c of existingChanges) {
        nextInitialStocks = applySetInitialStock(nextInitialStocks, { productId: c.id, value: c.newInitial, date: effectiveDate })
      }
      await saveInitialStocks(nextInitialStocks)

      return { content: [{ type: 'text', text: JSON.stringify({ ok: true, applied: existingChanges, newProducts, skipped, fechaVigente: effectiveDate }, null, 2) }] }
    },
  )
}
