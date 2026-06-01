import { useState, useRef } from 'react'
import { writeToExcel, generateTSV } from '../utils/excelExport.js'
import { PRODUCTS } from '../utils/products.js'

const MONTHS_ES = [
  'Enero','Febrero','Marzo','Abril','Mayo','Junio',
  'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre',
]

export default function TabExportar({ history, stock, onToast }) {
  const now = new Date()
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [year, setYear] = useState(now.getFullYear())
  const [excelBuffer, setExcelBuffer] = useState(null)
  const [fileName, setFileName] = useState('')
  const fileRef = useRef()

  const filteredHistory = history.filter(h => {
    const d = new Date(h.date + 'T00:00:00')
    return d.getMonth() + 1 === month && d.getFullYear() === year
  })

  const tsvText = generateTSV(filteredHistory, PRODUCTS)

  const handleCopy = async () => {
    if (!tsvText) { onToast('Sin datos para copiar', 'warn'); return }
    try {
      await navigator.clipboard.writeText(tsvText)
      onToast('Copiado al portapapeles ✓', 'success')
    } catch {
      onToast('Error al copiar — selecciona el texto manualmente', 'error')
    }
  }

  const handleFileUpload = (e) => {
    const file = e.target.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => {
      setExcelBuffer(ev.target.result)
      setFileName(file.name)
      onToast(`Archivo cargado: ${file.name}`, 'info')
    }
    reader.readAsArrayBuffer(file)
    // Reset input so same file can be re-selected
    e.target.value = ''
  }

  const handleExport = () => {
    if (!excelBuffer) { onToast('Carga el archivo .xlsx primero', 'warn'); return }
    if (filteredHistory.length === 0) { onToast('Sin registros para este periodo', 'warn'); return }
    try {
      const result = writeToExcel(excelBuffer, filteredHistory, month, year)
      const blob = new Blob([result], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `bodega_${year}_${String(month).padStart(2, '0')}.xlsx`
      a.click()
      URL.revokeObjectURL(url)
      onToast('Excel exportado ✓', 'success')
    } catch (e) {
      onToast(`Error: ${e.message}`, 'error')
    }
  }

  return (
    <div className="flex flex-col gap-4 pb-4">
      {/* Period selector */}
      <div className="flex gap-2">
        <select
          value={month}
          onChange={e => setMonth(Number(e.target.value))}
          className="flex-1 bg-surface border border-border rounded-xl px-3 py-2.5
            text-text-primary font-ui text-sm focus:outline-none focus:border-accent-green
            transition-colors"
        >
          {MONTHS_ES.map((name, i) => (
            <option key={i + 1} value={i + 1}>{name}</option>
          ))}
        </select>
        <input
          type="number"
          value={year}
          onChange={e => setYear(Number(e.target.value))}
          className="w-24 bg-surface border border-border rounded-xl px-3 py-2.5
            text-text-primary font-mono text-sm focus:outline-none focus:border-accent-green
            transition-colors"
        />
      </div>

      {/* Period stats */}
      <div className="flex gap-2">
        <div className="flex-1 bg-surface border border-border rounded-xl px-3 py-2 text-center">
          <p className="text-xl font-mono font-bold text-accent-green">{filteredHistory.length}</p>
          <p className="text-xs text-text-muted font-ui">días registrados</p>
        </div>
        <div className="flex-1 bg-surface border border-border rounded-xl px-3 py-2 text-center">
          <p className="text-xl font-mono font-bold text-accent-blue">
            {filteredHistory.reduce((s, h) => s + h.items.reduce((a, i) => a + i.qty, 0), 0)}
          </p>
          <p className="text-xs text-text-muted font-ui">unidades totales</p>
        </div>
      </div>

      {/* TSV */}
      <div className="bg-surface border border-border rounded-2xl p-3">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[11px] font-mono text-text-muted uppercase tracking-widest">
            Vista previa TSV
          </span>
          <button
            onClick={handleCopy}
            className="text-xs text-accent-blue font-ui font-semibold active:opacity-70"
          >
            Copiar todo
          </button>
        </div>
        <pre className="text-[11px] font-mono text-text-primary overflow-x-auto
          max-h-36 overflow-y-auto leading-relaxed">
          {tsvText || '(sin datos para este periodo)'}
        </pre>
      </div>

      {/* Excel export */}
      <div className="bg-surface border border-border rounded-2xl p-4 flex flex-col gap-3">
        <div>
          <p className="text-text-primary font-ui font-bold text-sm">
            Exportar al Excel corporativo
          </p>
          <p className="text-text-muted text-xs font-ui mt-1 leading-relaxed">
            Escribe en la hoja <span className="text-text-primary font-mono text-[11px]">Matriz de Consumo (2)</span>,
            columnas F–AA (días 1–22), filas 3–30.
          </p>
        </div>

        <button
          onClick={() => fileRef.current.click()}
          className={`w-full py-3 border border-dashed rounded-xl text-sm font-ui
            transition-colors active:opacity-80
            ${excelBuffer
              ? 'border-accent-green/40 text-accent-green bg-accent-green/5'
              : 'border-border text-text-muted active:border-accent-green active:text-accent-green'}`}
        >
          {excelBuffer
            ? `✓ ${fileName} — cambiar`
            : 'Seleccionar archivo .xlsx'}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".xlsx,.xls"
          onChange={handleFileUpload}
          className="hidden"
        />

        <button
          onClick={handleExport}
          disabled={!excelBuffer || filteredHistory.length === 0}
          className="w-full py-3.5 bg-accent-green text-bg font-ui font-bold
            rounded-xl text-sm tracking-wide
            disabled:opacity-30 active:opacity-90 transition-opacity"
        >
          Descargar Excel actualizado
        </button>
      </div>
    </div>
  )
}
