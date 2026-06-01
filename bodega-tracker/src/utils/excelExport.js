import * as XLSX from 'xlsx'
import { PRODUCT_ORDER } from './products.js'

const SHEET_NAME = 'Matriz de Consumo (2)'

/**
 * Write consumption data into the corporate .xlsx template.
 * Columns F→AA (indices 5–26) = days 1–22 of the period.
 * Rows 3–30 = products 1–28.
 *
 * @param {ArrayBuffer} fileBuffer  Existing .xlsx file as ArrayBuffer
 * @param {Array} history           [{ date: 'YYYY-MM-DD', items: [{id, qty}] }]
 * @param {number} month            1-based month
 * @param {number} year
 * @returns {Uint8Array}            Modified .xlsx bytes for download
 */
export function writeToExcel(fileBuffer, history, month, year) {
  const workbook = XLSX.read(new Uint8Array(fileBuffer), { type: 'array' })

  if (!workbook.SheetNames.includes(SHEET_NAME)) {
    throw new Error(`Hoja "${SHEET_NAME}" no encontrada en el archivo`)
  }

  const ws = workbook.Sheets[SHEET_NAME]

  // Build dayMap: dayOfMonth → { productId → qty }
  const dayMap = {}
  for (const entry of history) {
    const d = new Date(entry.date + 'T00:00:00')
    if (d.getMonth() + 1 !== month || d.getFullYear() !== year) continue
    const day = d.getDate()
    if (day < 1 || day > 22) continue
    if (!dayMap[day]) dayMap[day] = {}
    for (const item of entry.items) {
      dayMap[day][item.id] = (dayMap[day][item.id] || 0) + item.qty
    }
  }

  for (const [day, products] of Object.entries(dayMap)) {
    const colIndex = parseInt(day) + 4  // day 1 → col 5 = F, day 22 → col 26 = AA
    const colStr = XLSX.utils.encode_col(colIndex)

    for (const [productId, qty] of Object.entries(products)) {
      const rowIndex = PRODUCT_ORDER.indexOf(productId)
      if (rowIndex === -1) continue
      const rowNumber = rowIndex + 3  // product 0 → row 3 (1-based)
      const cellAddr = `${colStr}${rowNumber}`

      if (!ws[cellAddr]) ws[cellAddr] = {}
      ws[cellAddr].v = qty
      ws[cellAddr].t = 'n'
      // Remove any formula so our value persists on open
      delete ws[cellAddr].f
    }
  }

  return XLSX.write(workbook, { type: 'array', bookType: 'xlsx' })
}

/**
 * Generate TSV text (rows = products, columns = dates).
 */
export function generateTSV(history, products) {
  if (!history.length) return ''

  const dates = [...new Set(history.map(h => h.date))].sort()
  const header = ['Producto', ...dates].join('\t')

  const rows = products.map(p => {
    const cols = dates.map(date => {
      const entry = history.find(h => h.date === date)
      const item = entry?.items.find(i => i.id === p.id)
      return item ? item.qty : 0
    })
    return [p.name, ...cols].join('\t')
  })

  return [header, ...rows].join('\n')
}
