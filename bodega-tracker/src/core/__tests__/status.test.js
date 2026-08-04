import { test } from 'node:test'
import assert from 'node:assert/strict'
import { getDaysRemaining, getStatus } from '../status.js'

const productMap = {
  detergente: { id: 'detergente', initialStock: 10, dailyRate: 0.5 },
}

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
