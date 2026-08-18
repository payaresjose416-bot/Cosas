import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mergeThresholds, mergeHistory, mergeProducts } from '../merge.js'

// initialStocks usa mergeThresholds tal cual (LWW por objeto completo) para su
// shape {value, date, updatedAt} — value y date viajan juntos bajo el mismo
// updatedAt, así que no hace falta merge por campo individual.
test('mergeThresholds: sirve igual para el shape {value, date, updatedAt} de initialStocks', () => {
  const local = { azucar: { value: 4, date: '2026-06-01', updatedAt: 100 } }
  const cloud = { azucar: { value: 5, date: '2026-06-30', updatedAt: 200 } }
  const merged = mergeThresholds(local, cloud)
  assert.equal(merged.azucar.value, 5)
  assert.equal(merged.azucar.date, '2026-06-30')
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
