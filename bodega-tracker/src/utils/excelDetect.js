import * as XLSX from 'xlsx'
import { normalize, matchProduct } from './excelExport.js'

const SHEET_NAME = 'Matriz de Consumo (2)'

export function detectNewProducts(fileBuffer, knownProducts) {
  const workbook = XLSX.read(new Uint8Array(fileBuffer), { type: 'array' })

  if (!workbook.SheetNames.includes(SHEET_NAME)) return []

  const ws = workbook.Sheets[SHEET_NAME]
  const range = XLSX.utils.decode_range(ws['!ref'] || 'A1')

  const newNames = []
  const seen = new Set()

  for (let r = 2; r <= range.e.r; r++) {
    const cell = ws[XLSX.utils.encode_cell({ r, c: 1 })]
    if (!cell || !cell.v) continue

    const raw = String(cell.v).trim()
    const norm = normalize(raw)
    if (norm.length < 3 || seen.has(norm)) continue
    seen.add(norm)

    const matched = matchProduct(raw, knownProducts)
    if (!matched) {
      newNames.push(raw)
    }
  }

  return newNames
}
