import { test } from 'node:test'
import assert from 'node:assert/strict'
import { toEntries, mergeStock, mergeThresholds, mergeHistory, mergeProducts } from '../merge.js'

test('toEntries normaliza números planos (formato legacy) y objetos {qty, updatedAt}', () => {
  const out = toEntries({ a: 5, b: { qty: 3, updatedAt: 100 } })
  assert.deepEqual(out, { a: { qty: 5, updatedAt: 0 }, b: { qty: 3, updatedAt: 100 } })
})

test('mergeStock: gana el updatedAt más reciente por producto, sin importar de qué lado viene', () => {
  const local = { a: { qty: 5, updatedAt: 100 }, b: { qty: 1, updatedAt: 50 } }
  const cloud = { a: { qty: 9, updatedAt: 50 }, b: { qty: 7, updatedAt: 200 } }
  const merged = mergeStock(local, cloud)
  assert.equal(merged.a.qty, 5)   // local más reciente
  assert.equal(merged.b.qty, 7)   // cloud más reciente
})

test('mergeStock: acepta formato legacy (número plano) mezclado con el nuevo en ambos lados', () => {
  const local = { a: 5 }                                  // legacy, updatedAt implícito 0
  const cloud = { a: { qty: 9, updatedAt: 100 }, b: 3 }    // b también legacy
  const merged = mergeStock(local, cloud)
  assert.equal(merged.a.qty, 9)  // cloud (updatedAt 100) gana sobre legacy (0)
  assert.equal(merged.b.qty, 3)
})

test('mergeStock: la nube nunca se encoge — un producto ausente en local sobrevive', () => {
  const local = { a: { qty: 5, updatedAt: 100 } }
  const cloud = { a: { qty: 5, updatedAt: 100 }, b: { qty: 2, updatedAt: 10 } }
  const merged = mergeStock(local, cloud)
  assert.ok('b' in merged, 'un producto que solo existe en la nube no debe perderse')
})

test('mergeThresholds: tombstone con updatedAt reciente gana y "borra" el umbral', () => {
  const local = { a: { critical: 2, low: 5, updatedAt: 10 } }
  const cloud = { a: { deleted: true, updatedAt: 20 } }
  const merged = mergeThresholds(local, cloud)
  assert.equal(merged.a.deleted, true)
})

test('mergeThresholds: en empate de updatedAt (ambos legacy sin campo) gana lo local', () => {
  const local = { a: { critical: 1, low: 2 } }
  const cloud = { a: { critical: 9, low: 9 } }
  const merged = mergeThresholds(local, cloud)
  assert.equal(merged.a.critical, 1)
})

test('mergeHistory: tombstone de borrado no resucita si la nube trae una versión vieja sin deleted', () => {
  const local = [{ date: '2026-01-01', type: 'salida', items: [], deleted: true, updatedAt: 200 }]
  const cloud = [{ date: '2026-01-01', type: 'salida', items: [{ id: 'x', qty: 1 }], updatedAt: 100 }]
  const merged = mergeHistory(local, cloud)
  assert.equal(merged.length, 1)
  assert.equal(merged[0].deleted, true)
})

test('mergeHistory: entrada más reciente de la nube reemplaza a la local desactualizada', () => {
  const local = [{ date: '2026-01-01', type: 'salida', items: [{ id: 'x', qty: 1 }], updatedAt: 100 }]
  const cloud = [{ date: '2026-01-01', type: 'salida', items: [{ id: 'x', qty: 5 }], updatedAt: 300 }]
  const merged = mergeHistory(local, cloud)
  assert.equal(merged[0].items[0].qty, 5)
})

test('mergeHistory: salida y entrada del mismo día son registros distintos (clave date|type)', () => {
  const local = [
    { date: '2026-01-01', type: 'salida', items: [], updatedAt: 100 },
    { date: '2026-01-01', type: 'entrada', items: [], updatedAt: 100 },
  ]
  const merged = mergeHistory(local, [])
  assert.equal(merged.length, 2)
})

test('mergeProducts: unión por id, sin duplicar productos personalizados', () => {
  const local = [{ id: 'custom_a', name: 'A' }]
  const cloud = [{ id: 'custom_a', name: 'A vieja' }, { id: 'custom_b', name: 'B' }]
  const merged = mergeProducts(local, cloud)
  assert.equal(merged.length, 2)
  assert.equal(merged.find(p => p.id === 'custom_a').name, 'A') // local gana por presencia
})
