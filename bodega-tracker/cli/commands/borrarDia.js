import { parseArgs } from 'node:util'
import { loadProducts, loadStockEntries, loadHistory, saveStockEntries, saveHistory } from '../lib/store.js'
import { historyForDeleteDay, stockBumpForDeleteDay } from '../../src/core/inventory.js'
import { confirmWrite } from '../lib/confirm.js'
import { printJSON, die } from '../lib/format.js'

export async function run(args) {
  const { values, positionals } = parseArgs({
    args,
    options: {
      tipo: { type: 'string', default: 'salida' },
      yes: { type: 'boolean', default: false },
      'dry-run': { type: 'boolean', default: false },
      json: { type: 'boolean', default: false },
    },
    allowPositionals: true,
  })
  const [date] = positionals
  if (!date) die('Uso: bodega borrar-dia <fecha YYYY-MM-DD> [--tipo salida|entrada]')

  const { productMap } = await loadProducts()
  const rawHistory = await loadHistory()
  const entry = rawHistory.find(h => h.date === date && (h.type || 'salida') === values.tipo && !h.deleted)

  if (!entry) die(`No hay ningún registro de "${values.tipo}" en ${date}.`)

  const preview = () => {
    console.error(`Borrar ${values.tipo} del ${date}:`)
    for (const i of entry.items) console.error(`  - ${productMap[i.id]?.name ?? i.id}: ${i.qty}`)
    console.error('(se revierte el efecto en stock)')
  }

  const proceed = await confirmWrite({
    preview, dryRun: values['dry-run'], yes: values.yes,
    actionLabel: 'Borrar este registro',
  })
  if (!proceed) return

  const stockEntries = await loadStockEntries()
  const nextStock = stockBumpForDeleteDay(stockEntries, { entry })
  const nextHistory = historyForDeleteDay(rawHistory, { date, type: values.tipo })

  await saveStockEntries(nextStock)
  await saveHistory(nextHistory)

  if (values.json) printJSON({ ok: true, date, type: values.tipo })
  else console.log(`Borrado: ${date} (${values.tipo}).`)
}
