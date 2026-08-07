import { parseArgs } from 'node:util'
import { loadProducts, loadInitialStocks, loadThresholds, loadHistory, flattenStock, migrateLegacyStock } from '../lib/store.js'
import { getStatus, getDaysRemaining } from '../../src/core/status.js'
import { printJSON, printTable } from '../lib/format.js'

export async function run(args) {
  const { values } = parseArgs({ args, options: { json: { type: 'boolean', default: false } } })

  const { products, productMap } = await loadProducts()
  let initialStocks = await loadInitialStocks()
  const thresholds = await loadThresholds()
  const history = await loadHistory()
  initialStocks = await migrateLegacyStock(initialStocks, products)
  const stock = flattenStock(initialStocks, history, products, productMap)

  const byStatus = { critical: [], low: [], ok: [] }
  for (const p of products) {
    const status = getStatus(p.id, { stock, history, thresholds, productMap })
    const days = +getDaysRemaining(p.id, { stock, history, productMap }).toFixed(1)
    byStatus[status].push({ id: p.id, nombre: p.name, stock: +(stock[p.id] ?? p.initialStock).toFixed(2), diasRestantes: days })
  }

  const listaCompras = [...byStatus.critical, ...byStatus.low].map(p => p.id)

  if (values.json) {
    printJSON({ critico: byStatus.critical, bajo: byStatus.low, ok: byStatus.ok, listaCompras })
    return
  }

  console.log(`Total productos: ${products.length}`)
  console.log(`Crítico: ${byStatus.critical.length} · Bajo: ${byStatus.low.length} · OK: ${byStatus.ok.length}\n`)

  if (byStatus.critical.length) {
    console.log('CRÍTICO (comprar ya):')
    printTable(['ID', 'PRODUCTO', 'STOCK', 'DÍAS'], byStatus.critical.map(p => [p.id, p.nombre, p.stock, p.diasRestantes]))
    console.log()
  }
  if (byStatus.low.length) {
    console.log('BAJO (comprar pronto):')
    printTable(['ID', 'PRODUCTO', 'STOCK', 'DÍAS'], byStatus.low.map(p => [p.id, p.nombre, p.stock, p.diasRestantes]))
  }
  if (byStatus.critical.length === 0 && byStatus.low.length === 0) {
    console.log('Todo el inventario está OK.')
  }
}
