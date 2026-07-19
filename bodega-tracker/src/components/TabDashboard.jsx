import { useState } from 'react'
import { useAI } from '../hooks/useAI.js'

const FILTER_LABELS = { todos: 'Todos', critical: 'Critico', low: 'Bajo', ok: 'OK' }
const STATUS_LABEL = { critical: 'CRITICO', low: 'BAJO', ok: 'OK' }
const MONTHS_ES = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic']

const STATUS = {
  critical: {
    bar:   'bg-accent-danger',
    text:  'text-accent-danger',
    badge: 'bg-accent-danger/10 border-accent-danger/30 text-accent-danger',
  },
  low: {
    bar:   'bg-accent-warn',
    text:  'text-accent-warn',
    badge: 'bg-accent-warn/10 border-accent-warn/30 text-accent-warn',
  },
  ok: {
    bar:   'bg-accent-green',
    text:  'text-accent-green',
    badge: 'bg-accent-green/10 border-accent-green/30 text-accent-green',
  },
}

export default function TabDashboard({ stock, history, getDaysRemaining, getStatus, onToast, products, productMap, thresholds, setThreshold }) {
  const [filter, setFilter] = useState('todos')
  const [qtyOverride, setQtyOverride] = useState({})
  const [editingId, setEditingId] = useState(null)
  const [editVals, setEditVals] = useState({ critical: '', low: '' })
  const { loading, result, error, analyze } = useAI()

  const shopping = products
    .filter(p => {
      const s = getStatus(p.id)
      return s === 'critical' || s === 'low'
    })
    .map(p => {
      const currentStock = stock[p.id] ?? p.initialStock
      const days = getDaysRemaining(p.id)
      const rate = isFinite(days) && days > 0 ? currentStock / days : 0
      const t = thresholds?.[p.id]
      let suggested
      if (rate > 0) suggested = Math.max(1, Math.ceil(rate * 14 - currentStock))
      else if (t && !t.deleted && t.low > 0) suggested = Math.max(1, Math.ceil(t.low * 2 - currentStock))
      else suggested = 1
      return { product: p, qty: qtyOverride[p.id] ?? suggested }
    })

  const shoppingText = () => {
    const now = new Date()
    const dateStr = `${now.getDate()}/${now.getMonth() + 1}/${now.getFullYear()}`
    const lines = shopping.map(({ product, qty }) => `• ${product.name}: ${qty} ${product.unit}`)
    return `Lista de compras — ${dateStr}\n${lines.join('\n')}`
  }

  const handleCopyList = async () => {
    try {
      await navigator.clipboard.writeText(shoppingText())
      onToast('Lista copiada al portapapeles', 'success')
    } catch {
      onToast('Error al copiar', 'error')
    }
  }

  const handleShareList = async () => {
    const text = shoppingText()
    if (navigator.share) {
      try {
        await navigator.share({ title: 'Lista de compras — Bodega', text })
      } catch {}
    } else {
      handleCopyList()
    }
  }

  const adjustQty = (id, delta) => {
    setQtyOverride(prev => {
      const current = shopping.find(s => s.product.id === id)?.qty ?? 1
      return { ...prev, [id]: Math.max(1, current + delta) }
    })
  }

  const openThresholdEditor = (p) => {
    if (editingId === p.id) { setEditingId(null); return }
    const t = thresholds?.[p.id]
    setEditVals(t && !t.deleted
      ? { critical: String(t.critical), low: String(t.low) }
      : { critical: '', low: '' })
    setEditingId(p.id)
  }

  const handleSaveThreshold = (p) => {
    const critical = Number(editVals.critical)
    const low = Number(editVals.low)
    if (!isFinite(critical) || !isFinite(low) || low < critical) {
      onToast('Revisa los valores: "bajo" debe ser mayor o igual que "crítico"', 'warn')
      return
    }
    setThreshold(p.id, { critical, low })
    setEditingId(null)
    onToast(`Umbral guardado para ${p.name}`, 'success')
  }

  const handleAutoThreshold = (p) => {
    setThreshold(p.id, null)
    setEditingId(null)
    onToast(`${p.name} vuelve al cálculo automático`, 'info')
  }

  const counts = { critical: 0, low: 0, ok: 0 }
  for (const p of products) counts[getStatus(p.id)]++

  const visibleProducts = filter === 'todos'
    ? products
    : products.filter(p => getStatus(p.id) === filter)

  const handleDownloadStock = () => {
    const now = new Date()
    const dateStr = `${now.getDate()} ${MONTHS_ES[now.getMonth()]} ${now.getFullYear()}`
    const iso = now.toISOString().slice(0, 10)

    const cafeteria = products.filter(p => p.category === 'cafeteria')
    const aseo = products.filter(p => p.category !== 'cafeteria')

    const formatSection = (title, items) => {
      if (items.length === 0) return ''
      const lines = items.map(p => {
        const qty = stock[p.id] ?? p.initialStock
        const qtyStr = qty % 1 === 0 ? String(qty) : qty.toFixed(1)
        const status = STATUS_LABEL[getStatus(p.id)]
        return `  ${p.name.padEnd(30)} ${qtyStr.padStart(6)} ${p.unit.padEnd(10)} [${status}]`
      })
      return `${title}\n${lines.join('\n')}`
    }

    const totalProducts = products.length
    const text = [
      'STOCK ACTUAL — Bodega Tracker',
      `Fecha: ${dateStr}`,
      '─'.repeat(50),
      '',
      formatSection('CAFETERIA', cafeteria),
      '',
      formatSection('ASEO', aseo),
      '',
      '─'.repeat(50),
      `Total productos: ${totalProducts}`,
    ].join('\n')

    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `stock_${iso}.txt`
    a.click()
    URL.revokeObjectURL(url)
    onToast('Stock descargado como .txt', 'success')
  }

  return (
    <div className="flex flex-col gap-4 pb-4">
      <div className="grid grid-cols-3 gap-2">
        {(['critical', 'low', 'ok']).map(key => (
          <button
            key={key}
            onClick={() => setFilter(filter === key ? 'todos' : key)}
            className={`rounded-2xl p-3 border text-left transition-all
              ${filter === key
                ? STATUS[key].badge
                : 'bg-surface border-border'}`}
          >
            <div className={`text-3xl font-mono font-bold leading-none ${STATUS[key].text}`}>
              {counts[key]}
            </div>
            <div className="text-xs text-text-muted font-ui mt-1 capitalize">
              {FILTER_LABELS[key]}
            </div>
          </button>
        ))}
      </div>

      {/* Lista de compras sugerida */}
      <div className="bg-surface border border-border rounded-2xl p-4">
        <div className="flex items-center justify-between mb-1">
          <p className="text-text-primary font-ui font-bold text-sm">Lista de compras</p>
          {shopping.length > 0 && (
            <span className="text-[11px] font-mono text-text-muted">
              cobertura ~14 dias
            </span>
          )}
        </div>
        {shopping.length === 0 ? (
          <p className="text-text-muted text-xs font-ui">
            Stock saludable — nada por comprar
          </p>
        ) : (
          <>
            <div className="mt-2 space-y-1.5">
              {shopping.map(({ product, qty }) => (
                <div key={product.id} className="flex items-center gap-2 text-sm">
                  <span className="flex-1 text-text-muted font-ui leading-tight">{product.name}</span>
                  <button
                    onClick={() => adjustQty(product.id, -1)}
                    className="w-6 h-6 rounded-md bg-bg border border-border text-text-muted
                      active:text-text-primary font-mono text-xs"
                  >−</button>
                  <span className="font-mono text-accent-green font-bold tabular-nums w-8 text-center">
                    {qty}
                  </span>
                  <button
                    onClick={() => adjustQty(product.id, 1)}
                    className="w-6 h-6 rounded-md bg-bg border border-border text-text-muted
                      active:text-text-primary font-mono text-xs"
                  >+</button>
                  <span className="text-[10px] font-mono text-text-muted w-16">{product.unit}</span>
                </div>
              ))}
            </div>
            <div className="flex gap-2 mt-3">
              <button
                onClick={handleCopyList}
                className="flex-1 py-2 border border-border rounded-xl text-text-muted
                  font-ui text-sm font-semibold active:bg-bg transition-colors"
              >
                Copiar
              </button>
              <button
                onClick={handleShareList}
                className="flex-1 py-2 bg-accent-green text-bg rounded-xl
                  font-ui text-sm font-bold active:opacity-90 transition-opacity"
              >
                Compartir
              </button>
            </div>
          </>
        )}
      </div>

      <div className="flex gap-1 bg-surface border border-border rounded-xl p-1">
        {Object.entries(FILTER_LABELS).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            className={`flex-1 py-1.5 rounded-lg text-xs font-ui font-semibold transition-colors
              ${filter === key
                ? 'bg-accent-green/20 text-accent-green'
                : 'text-text-muted active:text-text-primary'}`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="bg-surface border border-border rounded-2xl overflow-hidden">
        <div className="grid grid-cols-[1fr_4rem_4rem] text-[11px] font-mono text-text-muted
          border-b border-border px-3 py-2 uppercase tracking-wider">
          <span>Producto</span>
          <span className="text-right">Stock</span>
          <span className="text-right">Dias</span>
        </div>

        {visibleProducts.length === 0 && (
          <p className="text-center text-text-muted text-sm font-ui py-8">Sin productos</p>
        )}

        {visibleProducts.map(p => {
          const status = getStatus(p.id)
          const days = getDaysRemaining(p.id)
          const pct = Math.min(100, Math.max(0, (days / 14) * 100))
          const sc = STATUS[status]
          const currentStock = stock[p.id] ?? p.initialStock
          const t = thresholds?.[p.id]
          const hasCustom = t && !t.deleted

          return (
            <div key={p.id} className="border-b border-border last:border-0">
              <button
                onClick={() => openThresholdEditor(p)}
                className="w-full grid grid-cols-[1fr_4rem_4rem] items-center px-3 py-2.5 gap-2 text-left"
              >
                <div>
                  <p className="text-sm font-ui text-text-primary leading-tight">
                    {p.name}
                    {hasCustom && <span className="ml-1.5 text-[10px] text-accent-blue">⚙</span>}
                  </p>
                  <div className="mt-1.5 h-1 bg-border rounded-full w-20 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${sc.bar}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
                <span className="font-mono text-sm text-right text-text-primary tabular-nums">
                  {currentStock % 1 === 0 ? currentStock : currentStock.toFixed(1)}
                </span>
                <span className={`font-mono text-sm text-right font-bold tabular-nums ${sc.text}`}>
                  {isFinite(days) && days < 999 ? days.toFixed(1) : '∞'}
                </span>
              </button>

              {editingId === p.id && (
                <div className="px-3 pb-3 animate-fade-in">
                  <div className="bg-bg border border-border rounded-xl p-3">
                    <p className="text-[11px] font-mono text-text-muted uppercase tracking-wider mb-2">
                      Umbral de alerta ({p.unit.toLowerCase()})
                    </p>
                    <div className="flex gap-2 items-center">
                      <label className="flex-1">
                        <span className="text-xs text-accent-danger font-ui">Critico si ≤</span>
                        <input
                          type="number" inputMode="decimal" min="0"
                          value={editVals.critical}
                          onChange={e => setEditVals(v => ({ ...v, critical: e.target.value }))}
                          className="mt-1 w-full bg-surface border border-border rounded-lg px-2 py-1.5
                            text-text-primary font-mono text-sm focus:outline-none focus:border-accent-danger"
                        />
                      </label>
                      <label className="flex-1">
                        <span className="text-xs text-accent-warn font-ui">Bajo si ≤</span>
                        <input
                          type="number" inputMode="decimal" min="0"
                          value={editVals.low}
                          onChange={e => setEditVals(v => ({ ...v, low: e.target.value }))}
                          className="mt-1 w-full bg-surface border border-border rounded-lg px-2 py-1.5
                            text-text-primary font-mono text-sm focus:outline-none focus:border-accent-warn"
                        />
                      </label>
                    </div>
                    <div className="flex gap-2 mt-3">
                      <button
                        onClick={() => handleSaveThreshold(p)}
                        disabled={editVals.critical === '' || editVals.low === ''}
                        className="flex-1 py-1.5 bg-accent-green text-bg font-ui font-bold rounded-lg
                          text-xs disabled:opacity-30 active:opacity-90"
                      >
                        Guardar
                      </button>
                      {hasCustom && (
                        <button
                          onClick={() => handleAutoThreshold(p)}
                          className="flex-1 py-1.5 border border-border rounded-lg text-text-muted
                            font-ui text-xs active:text-text-primary"
                        >
                          Usar automatico
                        </button>
                      )}
                      <button
                        onClick={() => setEditingId(null)}
                        className="px-3 py-1.5 text-text-muted font-ui text-xs active:text-text-primary"
                      >
                        Cerrar
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>

      <button
        onClick={handleDownloadStock}
        className="w-full py-3.5 bg-accent-green/10 border border-accent-green/30
          rounded-2xl text-accent-green font-ui font-semibold text-sm
          active:bg-accent-green/20 transition-colors"
      >
        Descargar stock (.txt)
      </button>

      <button
        onClick={() => analyze({ stock, history, getDaysRemaining, products })}
        disabled={loading}
        className="w-full py-3.5 bg-accent-blue/10 border border-accent-blue/30
          rounded-2xl text-accent-blue font-ui font-semibold text-sm
          active:bg-accent-blue/20 disabled:opacity-40 transition-colors"
      >
        {loading
          ? <span className="flex items-center justify-center gap-2">
              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
              Analizando...
            </span>
          : 'Analizar con Claude'
        }
      </button>

      {error && (
        <div className="bg-accent-danger/10 border border-accent-danger/30
          rounded-2xl p-3 text-accent-danger text-sm font-mono">
          {error}
        </div>
      )}

      {result && (
        <div className="bg-surface border border-accent-blue/20 rounded-2xl p-4 animate-fade-in">
          <p className="text-accent-blue font-bold text-[11px] font-mono uppercase tracking-widest mb-3">
            Analisis Claude
          </p>
          <div className="text-text-primary text-sm font-ui leading-relaxed whitespace-pre-wrap">
            {result}
          </div>
        </div>
      )}
    </div>
  )
}
