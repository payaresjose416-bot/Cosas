import { useState, useRef } from 'react'
import { writeToExcel, generateTSV } from '../utils/excelExport.js'
import { detectNewProducts } from '../utils/excelDetect.js'
import { detectStockSync } from '../utils/excelStockSync.js'

const MONTHS_ES = [
  'Enero','Febrero','Marzo','Abril','Mayo','Junio',
  'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre',
]

export default function TabExportar({ history, stock, onToast, products, addProducts, applyStockSync }) {
  const now = new Date()
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [year, setYear] = useState(now.getFullYear())
  const [excelBuffer, setExcelBuffer] = useState(null)
  const [fileName, setFileName] = useState('')
  const [exportResult, setExportResult] = useState(null)
  const [detectedProducts, setDetectedProducts] = useState([])
  const [selectedNew, setSelectedNew] = useState(new Set())
  const [stockSyncResult, setStockSyncResult] = useState(null)
  const [selectedStockChanges, setSelectedStockChanges] = useState(new Set())
  const [selectedStockNew, setSelectedStockNew] = useState(new Set())
  const fileRef = useRef()

  const filteredHistory = history.filter(h => {
    const d = new Date(h.date + 'T00:00:00')
    return d.getMonth() + 1 === month && d.getFullYear() === year
  })

  const tsvText = generateTSV(filteredHistory, products)

  const handleCopy = async () => {
    if (!tsvText) { onToast('Sin datos para copiar', 'warn'); return }
    try {
      await navigator.clipboard.writeText(tsvText)
      onToast('Copiado al portapapeles', 'success')
    } catch {
      onToast('Error al copiar', 'error')
    }
  }

  const handleFileUpload = (e) => {
    const file = e.target.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => {
      const buffer = ev.target.result
      setExcelBuffer(buffer)
      setFileName(file.name)
      setExportResult(null)
      onToast(`Archivo cargado: ${file.name}`, 'info')

      try {
        const newNames = detectNewProducts(buffer, products)
        if (newNames.length > 0) {
          setDetectedProducts(newNames)
          setSelectedNew(new Set(newNames))
        } else {
          setDetectedProducts([])
          setSelectedNew(new Set())
        }
      } catch {
        setDetectedProducts([])
        setSelectedNew(new Set())
      }
    }
    reader.readAsArrayBuffer(file)
    e.target.value = ''
  }

  const handleAddProducts = () => {
    const toAdd = detectedProducts.filter(name => selectedNew.has(name))
    if (toAdd.length === 0) return
    addProducts(toAdd)
    onToast(`${toAdd.length} producto(s) agregado(s)`, 'success')
    setDetectedProducts([])
    setSelectedNew(new Set())
  }

  const handleDismissDetected = () => {
    setDetectedProducts([])
    setSelectedNew(new Set())
  }

  const toggleSelected = (name) => {
    setSelectedNew(prev => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }

  const handleReviewStockSync = () => {
    if (!excelBuffer) { onToast('Carga el archivo .xlsx primero', 'warn'); return }
    try {
      const result = detectStockSync(excelBuffer, products, stock)
      if (result.existingChanges.length === 0 && result.newProducts.length === 0) {
        onToast('No se detectaron cambios de stock', 'info')
        return
      }
      setStockSyncResult(result)
      setSelectedStockChanges(new Set(result.existingChanges.map(c => c.id)))
      setSelectedStockNew(new Set(result.newProducts.map(n => n.name)))
      setDetectedProducts([])
      setSelectedNew(new Set())
    } catch (e) {
      onToast(`Error: ${e.message}`, 'error')
    }
  }

  const toggleStockChange = (id) => {
    setSelectedStockChanges(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleStockNew = (name) => {
    setSelectedStockNew(prev => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }

  const handleApplyStockSync = () => {
    if (!stockSyncResult) return
    const changesToApply = stockSyncResult.existingChanges.filter(c => selectedStockChanges.has(c.id))
    const newToAdd = stockSyncResult.newProducts.filter(n => selectedStockNew.has(n.name))

    if (changesToApply.length > 0) {
      applyStockSync(changesToApply.map(({ id, newStock }) => ({ id, newStock })))
    }
    if (newToAdd.length > 0) {
      addProducts(newToAdd)
    }
    onToast(
      `Stock actualizado: ${changesToApply.length} producto(s), ${newToAdd.length} nuevo(s)`,
      'success'
    )
    setStockSyncResult(null)
    setSelectedStockChanges(new Set())
    setSelectedStockNew(new Set())
  }

  const handleDismissStockSync = () => {
    setStockSyncResult(null)
    setSelectedStockChanges(new Set())
    setSelectedStockNew(new Set())
  }

  const handleExport = () => {
    if (!excelBuffer) { onToast('Carga el archivo .xlsx primero', 'warn'); return }
    if (history.length === 0) { onToast('Sin registros guardados', 'warn'); return }
    try {
      const { bytes, matched, unmatched } = writeToExcel(excelBuffer, history, products)
      const blob = new Blob([bytes], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = fileName.replace('.xlsx', '_actualizado.xlsx')
      a.click()
      URL.revokeObjectURL(url)

      setExportResult({ matched, unmatched })
      onToast(`Excel exportado — ${matched} celdas escritas`, 'success')
    } catch (e) {
      onToast(`Error: ${e.message}`, 'error')
    }
  }

  return (
    <div className="flex flex-col gap-4 pb-4">
      {/* Period selector (for TSV) */}
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
          <p className="text-xs text-text-muted font-ui">dias registrados</p>
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
            Sube tu Excel de control de inventario. La app busca los productos por nombre
            y las fechas por encabezado — no importa si cambiaste el orden de las filas.
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
            ? `${fileName} — cambiar`
            : 'Seleccionar archivo .xlsx'}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".xlsx,.xls"
          onChange={handleFileUpload}
          className="hidden"
        />

        {/* Detected new products panel */}
        {detectedProducts.length > 0 && (
          <div className="bg-accent-blue/5 border border-accent-blue/30 rounded-xl p-3 animate-fade-in">
            <p className="text-sm font-ui font-bold text-accent-blue">
              {detectedProducts.length} producto(s) nuevo(s) detectado(s)
            </p>
            <p className="text-xs text-text-muted font-ui mt-1">
              Estos productos estan en tu Excel pero no en la app. Selecciona los que quieras agregar.
            </p>
            <div className="mt-2 space-y-1.5">
              {detectedProducts.map(name => (
                <label key={name} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedNew.has(name)}
                    onChange={() => toggleSelected(name)}
                    className="w-4 h-4 rounded border-border accent-accent-green"
                  />
                  <span className="text-sm font-mono text-text-primary">{name}</span>
                </label>
              ))}
            </div>
            <div className="flex gap-2 mt-3">
              <button
                onClick={handleAddProducts}
                disabled={selectedNew.size === 0}
                className="flex-1 py-2 bg-accent-blue text-bg font-ui font-bold
                  rounded-lg text-sm disabled:opacity-30 active:opacity-90 transition-opacity"
              >
                Agregar seleccionados
              </button>
              <button
                onClick={handleDismissDetected}
                className="px-4 py-2 text-text-muted font-ui text-sm
                  active:text-text-primary transition-colors"
              >
                Ignorar
              </button>
            </div>
          </div>
        )}

        {/* Sync stock button */}
        {excelBuffer && (
          <button
            onClick={handleReviewStockSync}
            className="w-full py-2.5 border border-accent-green/40 text-accent-green
              rounded-xl text-sm font-ui font-semibold active:opacity-80 transition-opacity"
          >
            Sincronizar stock desde este Excel
          </button>
        )}

        {/* Stock sync review panel */}
        {stockSyncResult && (
          <div className="bg-accent-green/5 border border-accent-green/30 rounded-xl p-3 animate-fade-in">
            <p className="text-sm font-ui font-bold text-accent-green">
              Revisión de stock — columna "{stockSyncResult.stockColLetter}"
            </p>

            {stockSyncResult.existingChanges.length > 0 && (
              <>
                <p className="text-xs text-text-muted font-ui mt-2 mb-1.5">
                  Cambios de stock en productos existentes:
                </p>
                <div className="space-y-1.5">
                  {stockSyncResult.existingChanges.map(c => (
                    <label key={c.id} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedStockChanges.has(c.id)}
                        onChange={() => toggleStockChange(c.id)}
                        className="w-4 h-4 rounded border-border accent-accent-green"
                      />
                      <span className="text-sm font-mono text-text-primary flex-1">{c.name}</span>
                      <span className="text-xs font-mono text-text-muted">{c.oldStock} → {c.newStock}</span>
                    </label>
                  ))}
                </div>
              </>
            )}

            {stockSyncResult.newProducts.length > 0 && (
              <>
                <p className="text-xs text-text-muted font-ui mt-3 mb-1.5">
                  Productos nuevos (se agregarán con su stock actual):
                </p>
                <div className="space-y-1.5">
                  {stockSyncResult.newProducts.map(n => (
                    <label key={n.name} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedStockNew.has(n.name)}
                        onChange={() => toggleStockNew(n.name)}
                        className="w-4 h-4 rounded border-border accent-accent-blue"
                      />
                      <span className="text-sm font-mono text-text-primary flex-1">{n.name}</span>
                      <span className="text-xs font-mono text-text-muted">stock: {n.stock}</span>
                    </label>
                  ))}
                </div>
              </>
            )}

            <div className="flex gap-2 mt-3">
              <button
                onClick={handleApplyStockSync}
                disabled={selectedStockChanges.size === 0 && selectedStockNew.size === 0}
                className="flex-1 py-2 bg-accent-green text-bg font-ui font-bold
                  rounded-lg text-sm disabled:opacity-30 active:opacity-90 transition-opacity"
              >
                Aplicar cambios de stock
              </button>
              <button
                onClick={handleDismissStockSync}
                className="px-4 py-2 text-text-muted font-ui text-sm
                  active:text-text-primary transition-colors"
              >
                Ignorar
              </button>
            </div>
          </div>
        )}

        <button
          onClick={handleExport}
          disabled={!excelBuffer || history.length === 0}
          className="w-full py-3.5 bg-accent-green text-bg font-ui font-bold
            rounded-xl text-sm tracking-wide
            disabled:opacity-30 active:opacity-90 transition-opacity"
        >
          Descargar Excel actualizado
        </button>

        {/* Export feedback */}
        {exportResult && (
          <div className="bg-surface border border-border rounded-xl p-3 animate-fade-in">
            <p className="text-sm font-ui text-accent-green font-semibold">
              {exportResult.matched} celdas escritas correctamente
            </p>
            {exportResult.unmatched.length > 0 && (
              <div className="mt-2">
                <p className="text-xs text-accent-warn font-ui">
                  Productos no encontrados en el Excel:
                </p>
                <ul className="mt-1 space-y-0.5">
                  {exportResult.unmatched.map(name => (
                    <li key={name} className="text-xs text-text-muted font-mono">
                      — {name}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
