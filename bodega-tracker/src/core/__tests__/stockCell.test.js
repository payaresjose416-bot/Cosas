import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readStockValue } from '../../utils/excelStockSync.js'

// La columna "Restantes" del Excel corporativo es calculada, así que sus celdas
// suelen ser fórmulas. Un .xlsx escrito por un script (openpyxl) guarda la
// fórmula pero no su resultado, y antes esas filas se saltaban en silencio.

test('lee un valor numerico normal', () => {
  assert.deepEqual(readStockValue({ v: 5 }), { value: 5, reason: null })
})

test('lee cero como cero (no como celda vacia)', () => {
  assert.deepEqual(readStockValue({ v: 0 }), { value: 0, reason: null })
})

test('lee el valor cacheado de una formula', () => {
  assert.deepEqual(readStockValue({ f: 'D5-SUM(F5:AA5)', v: 3 }), { value: 3, reason: null })
})

test('cae al texto formateado (.w) cuando la formula no trae valor en .v', () => {
  assert.deepEqual(readStockValue({ f: 'D5-SUM(F5:AA5)', w: '4' }), { value: 4, reason: null })
})

test('reporta la formula sin valor en vez de saltarla en silencio', () => {
  assert.deepEqual(
    readStockValue({ f: 'D5-SUM(F5:AA5)' }),
    { value: null, reason: 'formula-sin-valor' },
  )
})

test('acepta decimales con coma (locale es-CO)', () => {
  assert.deepEqual(readStockValue({ v: '1,5' }), { value: 1.5, reason: null })
})

test('reporta celda vacia y valor no numerico por separado', () => {
  assert.deepEqual(readStockValue(undefined), { value: null, reason: 'celda-vacia' })
  assert.deepEqual(readStockValue({ v: 'N/A' }), { value: null, reason: 'no-numerico' })
})
