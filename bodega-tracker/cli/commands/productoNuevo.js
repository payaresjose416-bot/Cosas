import { parseArgs } from 'node:util'
import { BASE_PRODUCTS } from '../../src/utils/products.js'
import { loadCustomProducts, saveCustomProducts } from '../lib/store.js'
import { buildCustomProducts } from '../../src/core/catalog.js'
import { confirmWrite } from '../lib/confirm.js'
import { printJSON, die } from '../lib/format.js'

export async function run(args) {
  const { values, positionals } = parseArgs({
    args,
    options: {
      stock: { type: 'string', default: '0' },
      yes: { type: 'boolean', default: false },
      'dry-run': { type: 'boolean', default: false },
      json: { type: 'boolean', default: false },
    },
    allowPositionals: true,
  })
  const name = positionals.join(' ')
  if (!name.trim()) die('Uso: bodega producto-nuevo <nombre> [--stock N]')

  const stock = Number(values.stock)
  if (!Number.isFinite(stock) || stock < 0) die(`--stock inválido: "${values.stock}"`)

  const customProducts = await loadCustomProducts()
  const [newProduct] = buildCustomProducts([{ name, stock }], [...BASE_PRODUCTS, ...customProducts])

  if (!newProduct) die(`Ya existe un producto equivalente a "${name}".`)

  const preview = () => {
    console.error(`Producto nuevo: ${newProduct.name} (${newProduct.id}), stock inicial ${newProduct.initialStock}`)
  }

  const proceed = await confirmWrite({
    preview, dryRun: values['dry-run'], yes: values.yes,
    actionLabel: 'Agregar al catálogo',
  })
  if (!proceed) return

  await saveCustomProducts([...customProducts, newProduct])

  if (values.json) printJSON({ ok: true, product: newProduct })
  else console.log(`Agregado: ${newProduct.name} (${newProduct.id})`)
}
