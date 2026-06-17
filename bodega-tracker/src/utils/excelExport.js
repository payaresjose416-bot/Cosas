import * as XLSX from 'xlsx'

const SHEET_NAME = 'Matriz de Consumo (2)'

export function normalize(str) {
  return String(str)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function serialToISO(serial) {
  const date = XLSX.SSF.parse_date_code(serial)
  if (!date) return null
  const y = date.y
  const m = String(date.m).padStart(2, '0')
  const d = String(date.d).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function matchProduct(excelName, products) {
  const norm = normalize(excelName)
  if (!norm) return null

  let bestMatch = null
  let bestLen = 0

  for (const product of products) {
    for (const eName of (product.excelNames || [])) {
      const normE = normalize(eName)
      if (norm.includes(normE) && normE.length > bestLen) {
        bestMatch = product.id
        bestLen = normE.length
      }
    }
  }

  return bestMatch
}

export function writeToExcel(fileBuffer, history, products) {
  const workbook = XLSX.read(new Uint8Array(fileBuffer), { type: 'array' })

  if (!workbook.SheetNames.includes(SHEET_NAME)) {
    throw new Error(`Hoja "${SHEET_NAME}" no encontrada en el archivo`)
  }

  const ws = workbook.Sheets[SHEET_NAME]
  const range = XLSX.utils.decode_range(ws['!ref'] || 'A1')

  const dateToCol = {}
  for (let c = 5; c <= range.e.c; c++) {
    const cell = ws[XLSX.utils.encode_cell({ r: 1, c })]
    if (!cell) continue
    if (typeof cell.v === 'number' && cell.v > 40000) {
      const iso = serialToISO(cell.v)
      if (iso) dateToCol[iso] = c
    } else if (typeof cell.v === 'string') {
      const match = String(cell.v).match(/(\d{4})-(\d{2})-(\d{2})/)
      if (match) dateToCol[match[0]] = c
    }
  }

  const productToRow = {}
  const unmatched = []
  for (let r = 2; r <= range.e.r; r++) {
    const cell = ws[XLSX.utils.encode_cell({ r, c: 1 })]
    if (!cell || !cell.v) continue
    const productId = matchProduct(cell.v, products)
    if (productId) {
      productToRow[productId] = r
    }
  }

  const consumptionMap = {}
  for (const entry of history) {
    if (!dateToCol[entry.date]) continue
    if (!consumptionMap[entry.date]) consumptionMap[entry.date] = {}
    for (const item of entry.items) {
      consumptionMap[entry.date][item.id] =
        (consumptionMap[entry.date][item.id] || 0) + item.qty
    }
  }

  let matched = 0
  for (const [date, prods] of Object.entries(consumptionMap)) {
    const col = dateToCol[date]
    if (col === undefined) continue

    for (const [productId, qty] of Object.entries(prods)) {
      const row = productToRow[productId]
      if (row === undefined) {
        const pName = products.find(p => p.id === productId)?.name || productId
        if (!unmatched.includes(pName)) unmatched.push(pName)
        continue
      }

      const addr = XLSX.utils.encode_cell({ r: row, c: col })
      if (!ws[addr]) ws[addr] = {}
      ws[addr].v = qty
      ws[addr].t = 'n'
      delete ws[addr].f
      matched++
    }
  }

  const bytes = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' })
  return { bytes, matched, unmatched }
}

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
    if (cols.every(v => v === 0)) return null
    return [p.name, ...cols].join('\t')
  }).filter(Boolean)

  return [header, ...rows].join('\n')
}
