import { parseArgs } from 'node:util'
import { loadProducts, loadInitialStocks, loadThresholds, loadHistory, flattenStock, migrateLegacyStock } from '../lib/store.js'
import { getStatus, getDaysRemaining } from '../../src/core/status.js'
import { resolveProduct } from '../lib/resolveProduct.js'
import { printJSON, statusLabel, die } from '../lib/format.js'

export async function run(args) {
  const { values, positionals } = parseArgs({
    args, options: { json: { type: 'boolean', default: false } }, allowPositionals: true,
  })
  const [query] = positionals
  if (!query) die('Uso: bodega producto <id|nombre>')

  const { products, productMap } = await loadProducts()
  const product = resolveProduct(query, products) // lanza CliError si es ambiguo o no existe

  let initialStocks = await loadInitialStocks()
  const thresholds = await loadThresholds()
  const history = await loadHistory()
  initialStocks = await migrateLegacyStock(initialStocks, products)
  const stock = flattenStock(initialStocks, history, products, productMap)

  const status = getStatus(product.id, { stock, history, thresholds, productMap })
  const days = getDaysRemaining(product.id, { stock, history, productMap })
  const threshold = thresholds[product.id] && !thresholds[product.id].deleted ? thresholds[product.id] : null

  const recentHistory = history
    .filter(h => h.items.some(i => i.id === product.id))
    .slice(-10)
    .map(h => {
      const item = h.items.find(i => i.id === product.id)
      const tipo = h.type || 'salida'
      return tipo === 'sync'
        ? { fecha: h.date, tipo, cantidad: `${item.oldStock} → ${item.newStock}` }
        : { fecha: h.date, tipo, cantidad: item?.qty ?? 0 }
    })

  const result = {
    id: product.id, nombre: product.name, categoria: product.category, unidad: product.unit,
    stock: +(stock[product.id] ?? product.initialStock).toFixed(2),
    estado: status,
    diasRestantes: +days.toFixed(1),
    umbral: threshold,
    historialReciente: recentHistory,
  }

  if (values.json) { printJSON(result); return }

  console.log(`${result.nombre} (${result.id})`)
  console.log(`Categoría: ${result.categoria} · Unidad: ${result.unidad}`)
  console.log(`Stock: ${result.stock} · Estado: ${statusLabel(result.estado)} · Días restantes: ${result.diasRestantes}`)
  console.log(threshold ? `Umbral: crítico ≤ ${threshold.critical}, bajo ≤ ${threshold.low}` : 'Umbral: (usa cálculo por días)')
  if (recentHistory.length) {
    console.log('\nÚltimos movimientos:')
    for (const h of recentHistory) console.log(`  ${h.fecha}  ${h.tipo.padEnd(7)}  ${h.cantidad}`)
  }
}
