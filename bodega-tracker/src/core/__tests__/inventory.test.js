import { test } from 'node:test'
import assert from 'node:assert/strict'
import { historyForSaveDay, historyForDeleteDay, applySetThreshold, applySetInitialStock } from '../inventory.js'

test('historyForSaveDay: registra una salida nueva en el historial', () => {
  const rawHistory = historyForSaveDay([], {
    date: '2026-01-01', items: [{ id: 'detergente', qty: 3 }], type: 'salida', now: 1000,
  })
  assert.equal(rawHistory.length, 1)
  assert.equal(rawHistory[0].items[0].qty, 3)
  assert.equal(rawHistory[0].updatedAt, 1000)
})

test('historyForSaveDay: al editar un día ya registrado, reemplaza (no duplica) la entrada', () => {
  const rawHistory = [{ date: '2026-01-01', type: 'salida', items: [{ id: 'detergente', qty: 3 }], updatedAt: 1000 }]
  const nextHistory = historyForSaveDay(rawHistory, {
    date: '2026-01-01', items: [{ id: 'detergente', qty: 5 }], type: 'salida', now: 2000,
  })
  assert.equal(nextHistory.length, 1)
  assert.equal(nextHistory[0].items[0].qty, 5)
})

test('historyForDeleteDay: tombstonea el registro (no lo elimina)', () => {
  const rawHistory = [{ date: '2026-01-01', type: 'salida', items: [{ id: 'detergente', qty: 3 }], updatedAt: 1000 }]
  const nextHistory = historyForDeleteDay(rawHistory, { date: '2026-01-01', type: 'salida', now: 2000 })
  assert.equal(nextHistory.length, 1)
  assert.equal(nextHistory[0].deleted, true)
  assert.equal(nextHistory[0].items.length, 0)
})

test('historyForDeleteDay: borrar un día que no existe no revienta y solo agrega el tombstone', () => {
  const nextHistory = historyForDeleteDay([], { date: '2026-01-01', type: 'salida', now: 1000 })
  assert.equal(nextHistory[0].deleted, true)
})

test('applySetInitialStock: fija valor y fecha con updatedAt fresco y sin negativos', () => {
  const next = applySetInitialStock({}, { productId: 'detergente', value: -3, date: '2026-06-30', now: 1000 })
  assert.equal(next.detergente.value, 0)
  assert.equal(next.detergente.date, '2026-06-30')
  assert.equal(next.detergente.updatedAt, 1000)
})

test('applySetInitialStock: sin fecha, guarda date: null (ancla congelada, ver getCurrentStock)', () => {
  const next = applySetInitialStock({}, { productId: 'detergente', value: 5, now: 1000 })
  assert.equal(next.detergente.date, null)
})

test('applySetInitialStock: valor null crea un tombstone de borrado (vuelve al valor del catálogo)', () => {
  const initialStocks = { detergente: { value: 10, date: '2026-06-30', updatedAt: 0 } }
  const next = applySetInitialStock(initialStocks, { productId: 'detergente', value: null, now: 1000 })
  assert.equal(next.detergente.deleted, true)
  assert.equal(next.detergente.updatedAt, 1000)
})

test('applySetThreshold: valor null crea un tombstone de borrado', () => {
  const thresholds = { detergente: { critical: 2, low: 5, updatedAt: 0 } }
  const next = applySetThreshold(thresholds, { productId: 'detergente', value: null, now: 1000 })
  assert.equal(next.detergente.deleted, true)
  assert.equal(next.detergente.updatedAt, 1000)
})

test('applySetThreshold: valor objeto normaliza a número y marca updatedAt', () => {
  const next = applySetThreshold({}, { productId: 'detergente', value: { critical: '2', low: '5' }, now: 1000 })
  assert.equal(next.detergente.critical, 2)
  assert.equal(next.detergente.low, 5)
})
