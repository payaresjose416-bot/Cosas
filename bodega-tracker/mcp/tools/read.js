// Tools de solo lectura — mapeo directo de cli/commands/{stock,estado,producto,historial}.js,
// sin la parte de impresión a consola (aquí no hay terminal, solo devolver datos).
import { z } from 'zod'
import { loadProducts, loadInitialStocks, loadThresholds, loadHistory, flattenStock } from '../../cli/lib/store.js'
import { resolveProduct } from '../../cli/lib/resolveProduct.js'
import { getStatus, getDaysRemaining } from '../../src/core/status.js'
import { registerTool } from '../lib/toolError.js'

const ESTADO_MAP = { critico: 'critical', bajo: 'low', ok: 'ok' }

async function loadAll() {
  const { products, productMap } = await loadProducts()
  const initialStocks = await loadInitialStocks()
  const thresholds = await loadThresholds()
  const history = await loadHistory()
  const stock = flattenStock(initialStocks, history, products, productMap)
  return { products, productMap, stock, thresholds, history }
}

export function registerReadTools(server) {
  registerTool(server,
    'bodega_stock',
    {
      title: 'Ver stock de bodega',
      description: 'Lista el stock actual (calculado a partir del ancla y el historial) de cafetería/aseo, con estado (crítico/bajo/ok). Solo lectura.',
      inputSchema: {
        categoria: z.enum(['cafeteria', 'aseo']).optional(),
        estado: z.enum(['critico', 'bajo', 'ok']).optional(),
      },
    },
    async ({ categoria, estado }) => {
      const { products, productMap, stock, thresholds, history } = await loadAll()

      let rows = products.map(p => ({
        id: p.id,
        nombre: p.name,
        categoria: p.category,
        unidad: p.unit,
        stock: +(stock[p.id] ?? p.initialStock).toFixed(2),
        estado: getStatus(p.id, { stock, history, thresholds, productMap }),
      }))
      if (categoria) rows = rows.filter(r => r.categoria === categoria)
      if (estado) rows = rows.filter(r => r.estado === ESTADO_MAP[estado])

      return { content: [{ type: 'text', text: JSON.stringify(rows, null, 2) }] }
    },
  )

  registerTool(server,
    'bodega_estado',
    {
      title: 'Resumen de estado de bodega',
      description: 'Resumen de bodega: productos críticos, bajos y ok, más la lista de compras sugerida. Solo lectura.',
      inputSchema: {},
    },
    async () => {
      const { products, productMap, stock, thresholds, history } = await loadAll()

      const byStatus = { critical: [], low: [], ok: [] }
      for (const p of products) {
        const status = getStatus(p.id, { stock, history, thresholds, productMap })
        const days = +getDaysRemaining(p.id, { stock, history, productMap }).toFixed(1)
        byStatus[status].push({ id: p.id, nombre: p.name, stock: +(stock[p.id] ?? p.initialStock).toFixed(2), diasRestantes: days })
      }
      const listaCompras = [...byStatus.critical, ...byStatus.low].map(p => p.id)
      const result = { critico: byStatus.critical, bajo: byStatus.low, ok: byStatus.ok, listaCompras }

      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
    },
  )

  registerTool(server,
    'bodega_producto',
    {
      title: 'Detalle de un producto',
      description: 'Detalle de un producto de bodega: stock, estado, días restantes, umbral, últimos movimientos. Solo lectura. NUNCA inventes un id — pásale el nombre en texto libre y esta tool lo resuelve.',
      inputSchema: { query: z.string().describe('id exacto o nombre/keyword en texto libre del producto') },
    },
    async ({ query }) => {
      const { products, productMap, stock, thresholds, history } = await loadAll()
      const product = resolveProduct(query, products) // lanza CliError si es ambiguo o no existe

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

      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
    },
  )

  registerTool(server,
    'bodega_historial',
    {
      title: 'Historial de movimientos de bodega',
      description: 'Lista de días registrados (salidas/entradas), opcionalmente filtrado por rango de fechas. Solo lectura.',
      inputSchema: {
        desde: z.string().describe('YYYY-MM-DD').optional(),
        hasta: z.string().describe('YYYY-MM-DD').optional(),
        limite: z.number().int().positive().optional(),
      },
    },
    async ({ desde, hasta, limite }) => {
      const { productMap } = await loadProducts()
      const rawHistory = await loadHistory()
      let entries = rawHistory.filter(h => !h.deleted)

      if (desde) entries = entries.filter(h => h.date >= desde)
      if (hasta) entries = entries.filter(h => h.date <= hasta)
      entries = entries.sort((a, b) => b.date.localeCompare(a.date))
      if (limite) entries = entries.slice(0, limite)

      const rows = entries.map(h => {
        const tipo = h.type || 'salida'
        return {
          fecha: h.date,
          tipo,
          items: h.items.map(i => ({
            id: i.id,
            nombre: productMap[i.id]?.name ?? i.id,
            qty: tipo === 'sync' ? `${i.oldStock} → ${i.newStock}` : i.qty,
          })),
        }
      })

      return { content: [{ type: 'text', text: JSON.stringify(rows, null, 2) }] }
    },
  )
}
