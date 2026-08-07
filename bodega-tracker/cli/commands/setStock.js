import { parseArgs } from 'node:util'
import { loadProducts, loadInitialStocks, loadHistory, saveInitialStocks, flattenStock, migrateLegacyStock } from '../lib/store.js'
import { applySetInitialStock } from '../../src/core/inventory.js'
import { resolveProduct } from '../lib/resolveProduct.js'
import { confirmWrite } from '../lib/confirm.js'
import { printJSON, die } from '../lib/format.js'

function today() {
  return new Date().toISOString().slice(0, 10)
}

// Equivalente CLI de "editar stock actual" en el Dashboard: ancla el ciclo
// HOY con el valor dado — desde ahí, cada registro futuro se descuenta/suma
// normalmente. No es un contador aparte: es setInitialStock(id, valor, hoy).
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

  const { products, productMap } = await loadProducts()
  const product = resolveProduct(query, products)
  let initialStocks = await loadInitialStocks()
  const history = await loadHistory()
  initialStocks = await migrateLegacyStock(initialStocks, products)
  const stock = flattenStock(initialStocks, history, products, productMap)
  const current = stock[product.id]
  const date = today()

  const preview = () => {
    console.error(`Fijar stock de "${product.name}" (${product.id}): ${current} -> ${newQty} (vigente desde ${date})`)
  }

  const proceed = await confirmWrite({
    preview, dryRun: values['dry-run'], yes: values.yes,
    actionLabel: 'Aplicar',
  })
  if (!proceed) return

  const next = applySetInitialStock(initialStocks, { productId: product.id, value: newQty, date })
  await saveInitialStocks(next)

  if (values.json) printJSON({ ok: true, id: product.id, stock: newQty, date })
  else console.log(`Stock actualizado: ${product.name} = ${newQty} (vigente desde ${date})`)
}
