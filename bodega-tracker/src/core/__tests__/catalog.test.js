import { test } from 'node:test'
import assert from 'node:assert/strict'
import { slugify, titleCase, buildCustomProducts } from '../catalog.js'

test('slugify: quita acentos y normaliza a snake_case con prefijo custom_', () => {
  assert.equal(slugify('Papel Higiénico Extra'), 'custom_papel_higienico_extra')
})

test('titleCase: capitaliza cada palabra (comportamiento heredado: \\b\\w no es unicode-aware, así que la letra siguiente a una vocal acentuada también se capitaliza)', () => {
  assert.equal(titleCase('jabon liquido'), 'Jabon Liquido')
  assert.equal(titleCase('jabón líquido'), 'JabóN LíQuido')
})

test('buildCustomProducts: acepta strings (stock 0) y objetos {name, stock}', () => {
  const products = buildCustomProducts(['Vasos', { name: 'Servilletas', stock: 20 }], [])
  assert.equal(products.length, 2)
  assert.equal(products[0].initialStock, 0)
  assert.equal(products[1].initialStock, 20)
})

test('buildCustomProducts: no duplica un producto cuyo id ya existe (base o custom)', () => {
  const existing = [{ id: 'custom_vasos', name: 'Vasos' }]
  const products = buildCustomProducts(['Vasos'], existing)
  assert.equal(products.length, 0)
})

test('buildCustomProducts: genera keywords a partir del nombre normalizado', () => {
  const [p] = buildCustomProducts(['Jabón En Polvo'], [])
  assert.deepEqual(p.keywords, ['jabon', 'en', 'polvo'])
})
