import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  applySaveDay, applyDeleteDay, applyUpdateStock, applySetThreshold, applySetInitialStock, applyStockSyncChanges,
} from '../inventory.js'

test('applySaveDay: registra una salida nueva y descuenta stock', () => {
  const stockEntries = { detergente: { qty: 10, updatedAt: 0 } }
  const { stockEntries: nextStock, rawHistory } = applySaveDay(stockEntries, [], {
    date: '2026-01-01', items: [{ id: 'detergente', qty: 3 }], type: 'salida', now: 1000,
  })
  assert.equal(nextStock.detergente.qty, 7)
  assert.equal(nextStock.detergente.updatedAt, 1000)
  assert.equal(rawHistory.length, 1)
  assert.equal(rawHistory[0].items[0].qty, 3)
})

test('applySaveDay: al editar un día ya registrado, revierte el efecto anterior antes de aplicar el nuevo', () => {
  const stockEntries = { detergente: { qty: 7, updatedAt: 1000 } } // ya se descontaron 3 de un 10 inicial
  const rawHistory = [{ date: '2026-01-01', type: 'salida', items: [{ id: 'detergente', qty: 3 }], updatedAt: 1000 }]
  const { stockEntries: nextStock, rawHistory: nextHistory } = applySaveDay(stockEntries, rawHistory, {
    date: '2026-01-01', items: [{ id: 'detergente', qty: 5 }], type: 'salida', now: 2000,
  })
  // revierte +3 (vuelve a 10) y aplica -5 => 5
  assert.equal(nextStock.detergente.qty, 5)
  assert.equal(nextHistory.length, 1)
  assert.equal(nextHistory[0].items[0].qty, 5)
})

test('applySaveDay: entrada suma stock en vez de restar', () => {
  const stockEntries = { detergente: { qty: 2, updatedAt: 0 } }
  const { stockEntries: nextStock } = applySaveDay(stockEntries, [], {
    date: '2026-01-01', items: [{ id: 'detergente', qty: 4 }], type: 'entrada', now: 1000,
  })
  assert.equal(nextStock.detergente.qty, 6)
})

test('applySaveDay: el stock nunca baja de cero', () => {
  const stockEntries = { detergente: { qty: 1, updatedAt: 0 } }
  const { stockEntries: nextStock } = applySaveDay(stockEntries, [], {
    date: '2026-01-01', items: [{ id: 'detergente', qty: 5 }], type: 'salida', now: 1000,
  })
  assert.equal(nextStock.detergente.qty, 0)
})

test('applyDeleteDay: tombstonea el registro (no lo elimina) y revierte el efecto en stock', () => {
  const stockEntries = { detergente: { qty: 7, updatedAt: 1000 } }
  const rawHistory = [{ date: '2026-01-01', type: 'salida', items: [{ id: 'detergente', qty: 3 }], updatedAt: 1000 }]
  const { stockEntries: nextStock, rawHistory: nextHistory } = applyDeleteDay(stockEntries, rawHistory, {
    date: '2026-01-01', type: 'salida', now: 2000,
  })
  assert.equal(nextStock.detergente.qty, 10) // se revierte la salida de 3
  assert.equal(nextHistory.length, 1)
  assert.equal(nextHistory[0].deleted, true)
  assert.equal(nextHistory[0].items.length, 0)
})

test('applyDeleteDay: borrar un día que no existe no revienta y solo agrega el tombstone', () => {
  const stockEntries = { detergente: { qty: 5, updatedAt: 0 } }
  const { stockEntries: nextStock, rawHistory } = applyDeleteDay(stockEntries, [], {
    date: '2026-01-01', type: 'salida', now: 1000,
  })
  assert.equal(nextStock.detergente.qty, 5)
  assert.equal(rawHistory[0].deleted, true)
})

test('applyUpdateStock: fija stock a mano con updatedAt fresco y sin negativos', () => {
  const stockEntries = { detergente: { qty: 5, updatedAt: 0 } }
  const next = applyUpdateStock(stockEntries, { productId: 'detergente', newQty: -3, now: 1000 })
  assert.equal(next.detergente.qty, 0)
  assert.equal(next.detergente.updatedAt, 1000)
})

test('applySetInitialStock: fija el stock inicial con updatedAt fresco y sin negativos', () => {
  const next = applySetInitialStock({}, { productId: 'detergente', value: -3, now: 1000 })
  assert.equal(next.detergente.value, 0)
  assert.equal(next.detergente.updatedAt, 1000)
})

test('applySetInitialStock: valor null crea un tombstone de borrado (vuelve al valor del catálogo)', () => {
  const initialStocks = { detergente: { value: 10, updatedAt: 0 } }
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

test('applyStockSyncChanges: aplica solo los productos incluidos en el diff del Excel', () => {
  const stockEntries = { a: { qty: 1, updatedAt: 0 }, b: { qty: 2, updatedAt: 0 } }
  const next = applyStockSyncChanges(stockEntries, [{ id: 'a', newStock: 9 }], 1000)
  assert.equal(next.a.qty, 9)
  assert.equal(next.a.updatedAt, 1000)
  assert.equal(next.b.qty, 2) // no tocado
})
