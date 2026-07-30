import { parseArgs } from 'node:util'
import { loadProducts, loadThresholds, saveThresholds } from '../lib/store.js'
import { applySetThreshold } from '../../src/core/inventory.js'
import { resolveProduct } from '../lib/resolveProduct.js'
import { confirmWrite } from '../lib/confirm.js'
import { printJSON, die } from '../lib/format.js'

export async function run(args) {
  const { values, positionals } = parseArgs({
    args,
    options: {
      critico: { type: 'string' },
      bajo: { type: 'string' },
      quitar: { type: 'boolean', default: false },
      yes: { type: 'boolean', default: false },
      'dry-run': { type: 'boolean', default: false },
      json: { type: 'boolean', default: false },
    },
    allowPositionals: true,
  })
  const [query] = positionals
  if (!query) die('Uso: bodega umbral <producto> --critico N --bajo N   |   bodega umbral <producto> --quitar')

  const { products } = await loadProducts()
  const product = resolveProduct(query, products)
  const thresholds = await loadThresholds()

  let value
  if (values.quitar) {
    value = null
  } else {
    if (values.critico === undefined || values.bajo === undefined) {
      die('Necesitas --critico N y --bajo N (o usa --quitar para borrar el umbral).')
    }
    const critical = Number(values.critico)
    const low = Number(values.bajo)
    if (!Number.isFinite(critical) || !Number.isFinite(low)) die('--critico y --bajo deben ser números.')
    value = { critical, low }
  }

  const preview = () => {
    if (value === null) console.error(`Quitar umbral de "${product.name}" (${product.id})`)
    else console.error(`Umbral de "${product.name}" (${product.id}): crítico ≤ ${value.critical}, bajo ≤ ${value.low}`)
  }

  const proceed = await confirmWrite({
    preview, dryRun: values['dry-run'], yes: values.yes,
    actionLabel: 'Aplicar',
  })
  if (!proceed) return

  const next = applySetThreshold(thresholds, { productId: product.id, value })
  await saveThresholds(next)

  if (values.json) printJSON({ ok: true, id: product.id, umbral: value })
  else console.log(`Umbral actualizado para ${product.name}.`)
}
