import { test } from 'node:test'
import assert from 'node:assert/strict'
import { normalize, matchProduct } from '../catalog.js'
import { BASE_PRODUCTS } from '../../utils/products.js'

// Red de seguridad para los `excelNames` del catálogo. Son subcadenas sueltas y
// es fácil agregar una tan genérica que le robe la fila a otro producto — un
// fallo que en producción se ve como "sincronicé y el stock de X no cambió".

test('cada producto matchea su propio nombre del catálogo', () => {
  for (const p of BASE_PRODUCTS) {
    assert.equal(
      matchProduct(p.name, BASE_PRODUCTS), p.id,
      `"${p.name}" deberia matchear ${p.id}`,
    )
  }
})

test('ningun excelName le roba la fila a otro producto', () => {
  for (const p of BASE_PRODUCTS) {
    for (const eName of p.excelNames) {
      assert.equal(
        matchProduct(eName, BASE_PRODUCTS), p.id,
        `el excelName "${eName}" de ${p.id} matchea otro producto`,
      )
    }
  }
})

// Dos excelNames que normalizan igual ('pano multiuso' / 'paño multiuso') son
// código muerto: el segundo nunca puede matchear nada que el primero no matchee.
test('no hay excelNames que normalicen al mismo texto', () => {
  const seen = new Map()
  for (const p of BASE_PRODUCTS) {
    for (const eName of p.excelNames) {
      const norm = normalize(eName)
      const prev = seen.get(norm)
      assert.equal(prev, undefined, `"${eName}" (${p.id}) normaliza igual que un excelName de ${prev}`)
      seen.set(norm, p.id)
    }
  }
})

// El caso que motivó el arreglo: el Excel corporativo no siempre escribe la
// marca, y 'azucar manuelita' por sí solo no matcheaba "AZUCAR X 200 SOBRES",
// así que el azúcar se saltaba en silencio y su stock nunca se corregía.
test('azucar matchea aunque el Excel omita la marca "Manuelita"', () => {
  for (const nombre of [
    'AZUCAR X 200 SOBRES',
    'Azúcar Manuelita x200 Sobres',
    'AZÚCAR',
    'azucar en sobres',
  ]) {
    assert.equal(matchProduct(nombre, BASE_PRODUCTS), 'azucar', `fallo con "${nombre}"`)
  }
})

test('los dos lavalozas Axion no se confunden entre si', () => {
  assert.equal(matchProduct('LAVALOZA CREMA AXION X 800 GR', BASE_PRODUCTS), 'lavaloza_800')
  assert.equal(matchProduct('LAVALOZA CREMA AXION X 450 GR', BASE_PRODUCTS), 'lavaloza_450')
})

test('las tres aromaticas no se confunden entre si', () => {
  assert.equal(matchProduct('AROMATICA MANZANILLA', BASE_PRODUCTS), 'aromatica_manz')
  assert.equal(matchProduct('AROMATICA YERBABUENA', BASE_PRODUCTS), 'aromatica_yerba')
  assert.equal(matchProduct('AROMATICA FRUTOS ROJOS', BASE_PRODUCTS), 'aromatica_frutos')
})

test('las bolsas de basura no se confunden con la bolsa canequer', () => {
  assert.equal(matchProduct('BOLSAS BASURA NEGRAS X10', BASE_PRODUCTS), 'bolsas_negras')
  assert.equal(matchProduct('BOLSA CANEQUER VERDE X50', BASE_PRODUCTS), 'bolsa_canequer')
})

test('las esponjas x12 / x18 / de acero no se confunden entre si', () => {
  assert.equal(matchProduct('ESPONJAS X12', BASE_PRODUCTS), 'esponjas12')
  assert.equal(matchProduct('ESPONJAS X18', BASE_PRODUCTS), 'esponjas18')
  assert.equal(matchProduct('ESPONJA DE ACERO (BRILLO)', BASE_PRODUCTS), 'esponja_acero')
})

test('un nombre desconocido no matchea nada', () => {
  assert.equal(matchProduct('PRODUCTO INVENTADO QUE NO EXISTE', BASE_PRODUCTS), null)
  assert.equal(matchProduct('', BASE_PRODUCTS), null)
})
