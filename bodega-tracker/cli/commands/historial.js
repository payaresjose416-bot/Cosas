import { parseArgs } from 'node:util'
import { loadProducts, loadHistory } from '../lib/store.js'
import { printTable, printJSON } from '../lib/format.js'

export async function run(args) {
  const { values } = parseArgs({
    args,
    options: {
      desde: { type: 'string' },
      hasta: { type: 'string' },
      limite: { type: 'string' },
      json: { type: 'boolean', default: false },
    },
  })

  const { productMap } = await loadProducts()
  const rawHistory = await loadHistory()
  let entries = rawHistory.filter(h => !h.deleted)

  if (values.desde) entries = entries.filter(h => h.date >= values.desde)
  if (values.hasta) entries = entries.filter(h => h.date <= values.hasta)

  entries = entries.sort((a, b) => b.date.localeCompare(a.date))
  if (values.limite) entries = entries.slice(0, Number(values.limite))

  const rows = entries.map(h => ({
    fecha: h.date,
    tipo: h.type || 'salida',
    items: h.items.map(i => ({ id: i.id, nombre: productMap[i.id]?.name ?? i.id, qty: i.qty })),
  }))

  if (values.json) { printJSON(rows); return }

  if (rows.length === 0) {
    console.log('(sin registros)')
    return
  }

  for (const r of rows) {
    console.log(`${r.fecha}  ${r.tipo}`)
    printTable(['PRODUCTO', 'CANTIDAD'], r.items.map(i => [i.nombre, i.qty]))
    console.log()
  }
}
