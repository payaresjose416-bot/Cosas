// Tools de escritura contra Supabase — en pares `_preview` / `_confirmar`.
// `_preview` resuelve nombres a ids, valida, y devuelve el contenido exacto
// que se va a escribir + un confirmToken (ver mcp/lib/confirmTokens.js).
// `_confirmar` recibe ese mismo contenido resuelto (no solo el token) y
// valida que coincida antes de escribir — así el diálogo de aprobación de
// la tool call (que muestra los argumentos) es la vista previa real. Regla
// de plugins/bodega/skills/bodega/SKILL.md: nunca escribir sin que el
// usuario haya visto y aprobado el contenido exacto (productos, cantidades,
// fecha), nunca inventar un id de producto.
import { z } from 'zod'
import {
  loadProducts, loadHistory, loadThresholds, loadInitialStocks, loadCustomProducts,
  flattenStock, saveHistory, saveThresholds, saveInitialStocks, saveCustomProducts,
} from '../../cli/lib/store.js'
import { resolveProduct } from '../../cli/lib/resolveProduct.js'
import { parseInput } from '../../src/utils/parser.js'
import {
  historyForSaveDay, historyForDeleteDay, applySetThreshold, applySetInitialStock,
} from '../../src/core/inventory.js'
import { buildCustomProducts } from '../../src/core/catalog.js'
import { BASE_PRODUCTS } from '../../src/utils/products.js'
import { CliError } from '../../cli/lib/format.js'
import { registerTool } from '../lib/toolError.js'
import { issueToken, consumeToken } from '../lib/confirmTokens.js'

function today() {
  return new Date().toISOString().slice(0, 10)
}

const itemInput = z.object({ id: z.string(), qty: z.number().positive() })
const resolvedItem = z.object({ id: z.string(), qty: z.number().positive(), nombre: z.string() })

export function registerWriteTools(server) {
  // --- registrar ---------------------------------------------------------
  registerTool(server,
    'bodega_registrar_preview',
    {
      title: 'Vista previa: registrar salida/entrada',
      description: 'Resuelve un registro de salida/entrada (texto libre o lista de items) a productos concretos y muestra la vista previa exacta, sin escribir nada todavía. Usa bodega_registrar_confirmar con el confirmToken devuelto para aplicarlo.',
      inputSchema: {
        texto: z.string().describe('texto libre, ej: "5 detergente 2 cloro"').optional(),
        items: z.array(itemInput).describe('alternativa a texto: ids ya resueltos con bodega_stock/bodega_producto').optional(),
        fecha: z.string().describe('YYYY-MM-DD, por defecto hoy').optional(),
        tipo: z.enum(['salida', 'entrada']).default('salida'),
      },
    },
    async ({ texto, items: rawItems, fecha, tipo }) => {
      const { products } = await loadProducts()
      const productMap = Object.fromEntries(products.map(p => [p.id, p]))

      let items
      if (rawItems?.length) {
        items = rawItems.map(({ id, qty }) => {
          const product = resolveProduct(id, products)
          return { id: product.id, qty }
        })
      } else if (texto?.trim()) {
        items = parseInput(texto, products)
        if (items.length === 0) {
          throw new CliError(`No reconocí ningún producto en: "${texto}". Usa bodega_stock para ver los ids, o pasa "items" con ids exactos.`)
        }
      } else {
        throw new CliError('Necesitas "texto" o "items".')
      }

      const date = fecha || today()
      const resolvedItems = items.map(i => ({ id: i.id, qty: i.qty, nombre: productMap[i.id]?.name ?? i.id }))
      const payload = { items: resolvedItems, fecha: date, tipo }
      const confirmToken = issueToken('bodega_registrar', payload)

      return { content: [{ type: 'text', text: JSON.stringify({ ...payload, confirmToken }, null, 2) }] }
    },
  )

  registerTool(server,
    'bodega_registrar_confirmar',
    {
      title: 'Aplicar: registrar salida/entrada',
      description: 'Aplica un registro ya mostrado en bodega_registrar_preview. Requiere el mismo contenido exacto (items, fecha, tipo) y el confirmToken de ese preview — si no coinciden, se rechaza.',
      inputSchema: {
        items: z.array(resolvedItem),
        fecha: z.string(),
        tipo: z.enum(['salida', 'entrada']),
        confirmToken: z.string(),
      },
    },
    async ({ items, fecha, tipo, confirmToken }) => {
      consumeToken('bodega_registrar', confirmToken, { items, fecha, tipo })

      const rawHistory = await loadHistory()
      const nextHistory = historyForSaveDay(rawHistory, { date: fecha, items, type: tipo })
      await saveHistory(nextHistory)

      return { content: [{ type: 'text', text: JSON.stringify({ ok: true, fecha, tipo, items }, null, 2) }] }
    },
  )

  // --- borrar-dia ----------------------------------------------------------
  registerTool(server,
    'bodega_borrar_dia_preview',
    {
      title: 'Vista previa: borrar un día de historial',
      description: 'Muestra qué se va a borrar para una fecha+tipo, sin borrar todavía. El stock calculado se ajusta solo (no hay nada que revertir aparte).',
      inputSchema: { fecha: z.string().describe('YYYY-MM-DD'), tipo: z.enum(['salida', 'entrada']).default('salida') },
    },
    async ({ fecha, tipo }) => {
      const { productMap } = await loadProducts()
      const rawHistory = await loadHistory()
      const entry = rawHistory.find(h => h.date === fecha && (h.type || 'salida') === tipo && !h.deleted)
      if (!entry) throw new CliError(`No hay ningún registro de "${tipo}" en ${fecha}.`)

      const items = entry.items.map(i => ({ id: i.id, qty: i.qty, nombre: productMap[i.id]?.name ?? i.id }))
      const payload = { fecha, tipo, items }
      const confirmToken = issueToken('bodega_borrar_dia', { fecha, tipo })

      return { content: [{ type: 'text', text: JSON.stringify({ ...payload, confirmToken }, null, 2) }] }
    },
  )

  registerTool(server,
    'bodega_borrar_dia_confirmar',
    {
      title: 'Aplicar: borrar un día de historial',
      description: 'Aplica el borrado ya mostrado en bodega_borrar_dia_preview.',
      inputSchema: { fecha: z.string(), tipo: z.enum(['salida', 'entrada']), confirmToken: z.string() },
    },
    async ({ fecha, tipo, confirmToken }) => {
      consumeToken('bodega_borrar_dia', confirmToken, { fecha, tipo })

      const rawHistory = await loadHistory()
      const entry = rawHistory.find(h => h.date === fecha && (h.type || 'salida') === tipo && !h.deleted)
      if (!entry) throw new CliError(`No hay ningún registro de "${tipo}" en ${fecha}.`)

      const nextHistory = historyForDeleteDay(rawHistory, { date: fecha, type: tipo })
      await saveHistory(nextHistory)

      return { content: [{ type: 'text', text: JSON.stringify({ ok: true, fecha, tipo }, null, 2) }] }
    },
  )

  // --- set-stock -------------------------------------------------------------
  // Equivalente MCP de "editar stock actual" en el Dashboard: ancla el ciclo
  // HOY con el valor dado (setInitialStock(id, valor, hoy)) — no es un
  // contador aparte, ver CLAUDE.md ("Stock is computed, not stored").
  registerTool(server,
    'bodega_set_stock_preview',
    {
      title: 'Vista previa: fijar el stock actual de un producto',
      description: 'Resuelve el producto (por nombre o id) y muestra stock actual -> nuevo (ancla el ciclo desde hoy), sin escribir todavía.',
      inputSchema: { producto: z.string().describe('id exacto o nombre en texto libre'), cantidad: z.number().min(0) },
    },
    async ({ producto, cantidad }) => {
      const { products, productMap } = await loadProducts()
      const product = resolveProduct(producto, products)
      const initialStocks = await loadInitialStocks()
      const history = await loadHistory()
      const stock = flattenStock(initialStocks, history, products, productMap)
      const actual = stock[product.id]
      const date = today()

      const payload = { productId: product.id, cantidad, fecha: date }
      const confirmToken = issueToken('bodega_set_stock', payload)

      return { content: [{ type: 'text', text: JSON.stringify({ id: product.id, nombre: product.name, stockActual: actual, stockNuevo: cantidad, vigenteDesde: date, confirmToken }, null, 2) }] }
    },
  )

  registerTool(server,
    'bodega_set_stock_confirmar',
    {
      title: 'Aplicar: fijar el stock actual de un producto',
      description: 'Aplica el cambio de stock ya mostrado en bodega_set_stock_preview.',
      inputSchema: { productId: z.string(), cantidad: z.number().min(0), fecha: z.string(), confirmToken: z.string() },
    },
    async ({ productId, cantidad, fecha, confirmToken }) => {
      consumeToken('bodega_set_stock', confirmToken, { productId, cantidad, fecha })

      const initialStocks = await loadInitialStocks()
      const next = applySetInitialStock(initialStocks, { productId, value: cantidad, date: fecha })
      await saveInitialStocks(next)

      return { content: [{ type: 'text', text: JSON.stringify({ ok: true, id: productId, stock: cantidad, vigenteDesde: fecha }, null, 2) }] }
    },
  )

  // --- umbral ----------------------------------------------------------------
  registerTool(server,
    'bodega_umbral_preview',
    {
      title: 'Vista previa: fijar o quitar umbral de un producto',
      description: 'Resuelve el producto y muestra el umbral que se va a fijar (o quitar), sin escribir todavía.',
      inputSchema: {
        producto: z.string().describe('id exacto o nombre en texto libre'),
        critico: z.number().optional(),
        bajo: z.number().optional(),
        quitar: z.boolean().default(false),
      },
    },
    async ({ producto, critico, bajo, quitar }) => {
      const { products } = await loadProducts()
      const product = resolveProduct(producto, products)

      let value
      if (quitar) {
        value = null
      } else {
        if (critico === undefined || bajo === undefined) {
          throw new CliError('Necesitas "critico" y "bajo" (o "quitar": true para borrar el umbral).')
        }
        value = { critical: critico, low: bajo }
      }

      const payload = { productId: product.id, value }
      const confirmToken = issueToken('bodega_umbral', payload)

      return { content: [{ type: 'text', text: JSON.stringify({ id: product.id, nombre: product.name, umbral: value, confirmToken }, null, 2) }] }
    },
  )

  registerTool(server,
    'bodega_umbral_confirmar',
    {
      title: 'Aplicar: fijar o quitar umbral de un producto',
      description: 'Aplica el umbral ya mostrado en bodega_umbral_preview.',
      inputSchema: {
        productId: z.string(),
        critico: z.number().optional(),
        bajo: z.number().optional(),
        quitar: z.boolean().default(false),
        confirmToken: z.string(),
      },
    },
    async ({ productId, critico, bajo, quitar, confirmToken }) => {
      const value = quitar ? null : { critical: critico, low: bajo }
      consumeToken('bodega_umbral', confirmToken, { productId, value })

      const thresholds = await loadThresholds()
      const next = applySetThreshold(thresholds, { productId, value })
      await saveThresholds(next)

      return { content: [{ type: 'text', text: JSON.stringify({ ok: true, id: productId, umbral: value }, null, 2) }] }
    },
  )

  // --- producto-nuevo ------------------------------------------------------
  registerTool(server,
    'bodega_producto_nuevo_preview',
    {
      title: 'Vista previa: agregar producto nuevo al catálogo',
      description: 'Genera el id/keywords del producto nuevo y muestra la vista previa, sin agregarlo todavía. Falla si ya existe un producto equivalente.',
      inputSchema: { nombre: z.string(), stock: z.number().min(0).default(0) },
    },
    async ({ nombre, stock }) => {
      const customProducts = await loadCustomProducts()
      const [newProduct] = buildCustomProducts([{ name: nombre, stock }], [...BASE_PRODUCTS, ...customProducts])
      if (!newProduct) throw new CliError(`Ya existe un producto equivalente a "${nombre}".`)

      const payload = { nombre, stock }
      const confirmToken = issueToken('bodega_producto_nuevo', payload)

      return { content: [{ type: 'text', text: JSON.stringify({ producto: newProduct, confirmToken }, null, 2) }] }
    },
  )

  registerTool(server,
    'bodega_producto_nuevo_confirmar',
    {
      title: 'Aplicar: agregar producto nuevo al catálogo',
      description: 'Aplica el alta ya mostrada en bodega_producto_nuevo_preview.',
      inputSchema: { nombre: z.string(), stock: z.number().min(0).default(0), confirmToken: z.string() },
    },
    async ({ nombre, stock, confirmToken }) => {
      consumeToken('bodega_producto_nuevo', confirmToken, { nombre, stock })

      const customProducts = await loadCustomProducts()
      const [newProduct] = buildCustomProducts([{ name: nombre, stock }], [...BASE_PRODUCTS, ...customProducts])
      if (!newProduct) throw new CliError(`Ya existe un producto equivalente a "${nombre}" (se agregó entre el preview y ahora).`)

      await saveCustomProducts([...customProducts, newProduct])

      return { content: [{ type: 'text', text: JSON.stringify({ ok: true, producto: newProduct }, null, 2) }] }
    },
  )
}
