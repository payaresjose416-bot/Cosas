import { parseArgs } from 'node:util'
import { parseInput } from '../../src/utils/parser.js'
import { loadProducts, loadHistory, saveHistory } from '../lib/store.js'
import { historyForSaveDay } from '../../src/core/inventory.js'
import { resolveProduct } from '../lib/resolveProduct.js'
import { confirmWrite } from '../lib/confirm.js'
import { printJSON, die } from '../lib/format.js'

function today() {
  return new Date().toISOString().slice(0, 10)
}

export async function run(args) {
  const { values, positionals } = parseArgs({
    args,
    options: {
      item: { type: 'string', multiple: true },
      fecha: { type: 'string' },
      tipo: { type: 'string', default: 'salida' },
      yes: { type: 'boolean', default: false },
      'dry-run': { type: 'boolean', default: false },
      json: { type: 'boolean', default: false },
    },
    allowPositionals: true,
  })

  if (values.tipo !== 'salida' && values.tipo !== 'entrada') {
    die(`--tipo debe ser "salida" o "entrada" (recibí "${values.tipo}")`)
  }
  const date = values.fecha || today()
  const { products } = await loadProducts()

  let items
  if (values.item?.length) {
    items = values.item.map(spec => {
      const [rawId, rawQty] = spec.split('=')
      if (!rawId || rawQty === undefined) die(`--item mal formado: "${spec}" (usa id=cantidad)`)
      const product = resolveProduct(rawId, products)
      const qty = Number(rawQty)
      if (!Number.isFinite(qty) || qty <= 0) die(`Cantidad inválida en --item "${spec}"`)
      return { id: product.id, qty }
    })
  } else {
    const text = positionals.join(' ')
    if (!text.trim()) die('Uso: bodega registrar "<texto libre>"  ó  bodega registrar --item <id>=<qty> [--item ...]')
    items = parseInput(text, products)
    if (items.length === 0) {
      die(`No reconocí ningún producto en: "${text}". Usa "bodega stock --json" para ver los ids y --item id=qty.`)
    }
  }

  const productMap = Object.fromEntries(products.map(p => [p.id, p]))
  const preview = () => {
    console.error(`Registrar ${values.tipo} del ${date}:`)
    for (const i of items) console.error(`  - ${productMap[i.id]?.name ?? i.id}: ${i.qty}`)
  }

  const proceed = await confirmWrite({
    preview, dryRun: values['dry-run'], yes: values.yes,
    actionLabel: 'Registrar en Supabase',
  })
  if (!proceed) return

  const rawHistory = await loadHistory()
  const nextHistory = historyForSaveDay(rawHistory, { date, items, type: values.tipo })
  await saveHistory(nextHistory)

  if (values.json) printJSON({ ok: true, date, type: values.tipo, items })
  else console.log(`Registrado: ${date} (${values.tipo}), ${items.length} producto(s).`)
}
