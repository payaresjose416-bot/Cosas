import { parseArgs } from 'node:util'
import { loadProducts, loadInitialStocks, loadThresholds, loadHistory, flattenStock } from '../lib/store.js'
import { getStatus } from '../../src/core/status.js'
import { printTable, printJSON, statusLabel, die } from '../lib/format.js'

const ESTADO_MAP = { critico: 'critical', bajo: 'low', ok: 'ok' }

export async function run(args) {
  const { values } = parseArgs({
    args,
    options: {
      categoria: { type: 'string' },
      estado: { type: 'string' },
      json: { type: 'boolean', default: false },
    },
  })

  if (values.estado && !ESTADO_MAP[values.estado]) {
    die(`--estado debe ser critico, bajo u ok (recibí "${values.estado}")`)
  }

  const { products, productMap } = await loadProducts()
  const initialStocks = await loadInitialStocks()
  const thresholds = await loadThresholds()
  const history = await loadHistory()
  const stock = flattenStock(initialStocks, history, products, productMap)

  let rows = products.map(p => ({
    id: p.id,
    nombre: p.name,
    categoria: p.category,
    unidad: p.unit,
    stock: +(stock[p.id] ?? p.initialStock).toFixed(2),
    estado: getStatus(p.id, { stock, history, thresholds, productMap }),
  }))

  if (values.categoria) rows = rows.filter(r => r.categoria === values.categoria)
  if (values.estado) rows = rows.filter(r => r.estado === ESTADO_MAP[values.estado])

  if (values.json) {
    printJSON(rows)
    return
  }

  if (rows.length === 0) {
    console.log('(sin productos que coincidan con el filtro)')
    return
  }

  printTable(
    ['ID', 'PRODUCTO', 'CATEGORÍA', 'UNIDAD', 'STOCK', 'ESTADO'],
    rows.map(r => [r.id, r.nombre, r.categoria, r.unidad, r.stock, statusLabel(r.estado)]),
  )
}
