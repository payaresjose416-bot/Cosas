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

export default function TabDashboard({ stock, history, getDaysRemaining, getStatus, onToast, products, productMap }) {
  const [filter, setFilter] = useState('todos')
  const { loading, result, error, analyze } = useAI()

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

          return (
            <div key={p.id}
              className="grid grid-cols-[1fr_4rem_4rem] items-center px-3 py-2.5
                border-b border-border last:border-0 gap-2"
            >
              <div>
                <p className="text-sm font-ui text-text-primary leading-tight">{p.name}</p>
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
