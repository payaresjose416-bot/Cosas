import { parseArgs } from 'node:util'
import { loadProducts, loadStockEntries, saveStockEntries, flattenStock } from '../lib/store.js'
import { applyUpdateStock } from '../../src/core/inventory.js'
import { resolveProduct } from '../lib/resolveProduct.js'
import { confirmWrite } from '../lib/confirm.js'
import { printJSON, die } from '../lib/format.js'

export async function run(args) {
  const { values, positionals } = parseArgs({
    args,
    options: {
      yes: { type: 'boolean', default: false },
      'dry-run': { type: 'boolean', default: false },
      json: { type: 'boolean', default: false },
    },
    allowPositionals: true,
  })
  const [query, rawQty] = positionals
  if (!query || rawQty === undefined) die('Uso: bodega set-stock <producto> <cantidad>')

  const newQty = Number(rawQty)
  if (!Number.isFinite(newQty) || newQty < 0) die(`Cantidad inválida: "${rawQty}"`)

  const { products } = await loadProducts()
  const product = resolveProduct(query, products)
  const stockEntries = await loadStockEntries()
  const stock = flattenStock(stockEntries, products)
  const current = stock[product.id]

  const preview = () => {
    console.error(`Fijar stock de "${product.name}" (${product.id}): ${current} -> ${newQty}`)
  }

  const proceed = await confirmWrite({
    preview, dryRun: values['dry-run'], yes: values.yes,
    actionLabel: 'Aplicar',
  })
  if (!proceed) return

  const nextStock = applyUpdateStock(stockEntries, { productId: product.id, newQty })
  await saveStockEntries(nextStock)

  if (values.json) printJSON({ ok: true, id: product.id, stock: newQty })
  else console.log(`Stock actualizado: ${product.name} = ${newQty}`)
}
