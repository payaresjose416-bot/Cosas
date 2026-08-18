import { test } from 'node:test'
import assert from 'node:assert/strict'
import { getDaysRemaining, getStatus, getCurrentStock } from '../status.js'

const productMap = {
  detergente: { id: 'detergente', initialStock: 10, dailyRate: 0.5 },
}

test('getCurrentStock: sin ancla, cae al initialStock del catálogo', () => {
  const stock = getCurrentStock('detergente', { initialStocks: {}, history: [], productMap })
  assert.equal(stock, 10)
})

test('getCurrentStock: ancla sin fecha queda congelada (no descuenta nada)', () => {
  const initialStocks = { detergente: { value: 7, date: null, updatedAt: 100 } }
  const history = [{ date: '2026-07-01', type: 'salida', items: [{ id: 'detergente', qty: 3 }] }]
  const stock = getCurrentStock('detergente', { initialStocks, history, productMap })
  assert.equal(stock, 7)
})

test('getCurrentStock: descuenta salidas registradas desde la fecha ancla en adelante', () => {
  const initialStocks = { detergente: { value: 10, date: '2026-06-30', updatedAt: 100 } }
  const history = [
    { date: '2026-06-30', type: 'salida', items: [{ id: 'detergente', qty: 2 }] },
    { date: '2026-07-05', type: 'salida', items: [{ id: 'detergente', qty: 3 }] },
  ]
  const stock = getCurrentStock('detergente', { initialStocks, history, productMap })
  assert.equal(stock, 5) // 10 - 2 - 3
})

test('getCurrentStock: suma entradas registradas desde la fecha ancla', () => {
  const initialStocks = { detergente: { value: 5, date: '2026-06-30', updatedAt: 100 } }
  const history = [{ date: '2026-07-01', type: 'entrada', items: [{ id: 'detergente', qty: 4 }] }]
  const stock = getCurrentStock('detergente', { initialStocks, history, productMap })
  assert.equal(stock, 9)
})

test('getCurrentStock: ignora registros con fecha ANTERIOR al ancla', () => {
  const initialStocks = { detergente: { value: 10, date: '2026-06-30', updatedAt: 100 } }
  const history = [{ date: '2026-06-29', type: 'salida', items: [{ id: 'detergente', qty: 8 }] }]
  const stock = getCurrentStock('detergente', { initialStocks, history, productMap })
  assert.equal(stock, 10) // el registro del 29 es de ANTES del ciclo, no cuenta
})

test('getCurrentStock: nunca baja de cero', () => {
  const initialStocks = { detergente: { value: 2, date: '2026-06-30', updatedAt: 100 } }
  const history = [{ date: '2026-07-01', type: 'salida', items: [{ id: 'detergente', qty: 10 }] }]
  const stock = getCurrentStock('detergente', { initialStocks, history, productMap })
  assert.equal(stock, 0)
})

// Regresión: los registros heredados `type: 'sync'` (bitácora de una versión
// anterior que sincronizaba stock desde Excel) traen items {oldStock, newStock}
// SIN `qty`. Sin el guard de tipo, `delta += item.qty` sumaba undefined y todo
// el stock del producto se volvía NaN.
test('getCurrentStock: ignora registros heredados type "sync" y no devuelve NaN', () => {
  const initialStocks = { detergente: { value: 10, date: '2026-06-30', updatedAt: 100 } }
  const history = [
    { date: '2026-07-01', type: 'sync', items: [{ id: 'detergente', oldStock: 0, newStock: 4 }] },
    { date: '2026-07-02', type: 'salida', items: [{ id: 'detergente', qty: 3 }] },
  ]
  const stock = getCurrentStock('detergente', { initialStocks, history, productMap })
  assert.ok(!Number.isNaN(stock), 'el stock no debe ser NaN')
  assert.equal(stock, 7) // 10 - 3; el registro 'sync' se ignora por completo
})

test('getCurrentStock: ancla tombstoneada (deleted) cae al catálogo', () => {
  const initialStocks = { detergente: { deleted: true, updatedAt: 100 } }
  const stock = getCurrentStock('detergente', { initialStocks, history: [], productMap })
  assert.equal(stock, 10)
})

test('getDaysRemaining: usa el promedio de consumo real de los últimos días si hay historial', () => {
  const stock = { detergente: 10 }
  const history = [
    { type: 'salida', items: [{ id: 'detergente', qty: 2 }] },
    { type: 'salida', items: [{ id: 'detergente', qty: 2 }] },
  ]
  // consumo total 4 en 2 días => promedio 2/día => 10/2 = 5 días
  const days = getDaysRemaining('detergente', { stock, history, productMap })
  assert.equal(days, 5)
})

test('getDaysRemaining: cae al dailyRate del catálogo cuando no hay consumo reciente', () => {
  const stock = { detergente: 10 }
  const days = getDaysRemaining('detergente', { stock, history: [], productMap })
  assert.equal(days, 20) // 10 / 0.5
})

test('getDaysRemaining: producto sin dailyRate ni historial devuelve 999 (nunca crítico)', () => {
  const pm = { x: { id: 'x', initialStock: 5, dailyRate: 0 } }
  const days = getDaysRemaining('x', { stock: { x: 5 }, history: [], productMap: pm })
  assert.equal(days, 999)
})

test('getDaysRemaining: ignora entradas al calcular consumo (solo cuenta salidas)', () => {
  const stock = { detergente: 10 }
  const history = [
    { type: 'entrada', items: [{ id: 'detergente', qty: 50 }] },
  ]
  const days = getDaysRemaining('detergente', { stock, history, productMap })
  assert.equal(days, 20) // sin salidas recientes, cae a dailyRate
})

test('getStatus: con umbral explícito, compara stock actual contra critical/low', () => {
  const stock = { detergente: 3 }
  const thresholds = { detergente: { critical: 2, low: 5 } }
  assert.equal(getStatus('detergente', { stock, history: [], thresholds, productMap }), 'low')
})

test('getStatus: umbral tombstoneado (deleted) se ignora y cae al cálculo por días', () => {
  const stock = { detergente: 3 } // 3/0.5 = 6 días => critical
  const thresholds = { detergente: { deleted: true } }
  assert.equal(getStatus('detergente', { stock, history: [], thresholds, productMap }), 'critical')
})

test('getStatus: sin umbral, usa el corte por días (< 7 crítico, < 15 bajo, resto ok)', () => {
  const pm = { x: { id: 'x', initialStock: 100, dailyRate: 1 } }
  assert.equal(getStatus('x', { stock: { x: 5 }, history: [], thresholds: {}, productMap: pm }), 'critical')
  assert.equal(getStatus('x', { stock: { x: 10 }, history: [], thresholds: {}, productMap: pm }), 'low')
  assert.equal(getStatus('x', { stock: { x: 20 }, history: [], thresholds: {}, productMap: pm }), 'ok')
})
