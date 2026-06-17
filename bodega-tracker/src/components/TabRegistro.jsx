import { useState, useMemo, useCallback } from 'react'
import ProductCard from './ProductCard.jsx'
import { parseInput } from '../utils/parser.js'

export default function TabRegistro({ stock, saveDay, onToast, products, productMap }) {
  const today = new Date().toISOString().slice(0, 10)
  const [date, setDate] = useState(today)
  const [rawInput, setRawInput] = useState('')
  const [quantities, setQuantities] = useState({})
  const [search, setSearch] = useState('')
  const [showPreview, setShowPreview] = useState(false)

  const handleParse = () => {
    const trimmed = rawInput.trim()
    if (!trimmed) return
    const parsed = parseInput(trimmed, products)
    if (parsed.length === 0) {
      onToast('No se reconocieron productos', 'warn')
      return
    }
    setQuantities(prev => {
      const next = { ...prev }
      for (const { id, qty } of parsed) next[id] = (next[id] || 0) + qty
      return next
    })
    setRawInput('')
    onToast(`${parsed.length} producto(s) agregado(s)`, 'info')
  }

  const increment = useCallback((id) => {
    setQuantities(prev => ({ ...prev, [id]: (prev[id] || 0) + 1 }))
  }, [])

  const decrement = useCallback((id) => {
    setQuantities(prev => {
      const next = { ...prev }
      if ((next[id] || 0) <= 1) delete next[id]
      else next[id]--
      return next
    })
  }, [])

  const activeItems = useMemo(
    () => Object.entries(quantities).filter(([, q]) => q > 0),
    [quantities]
  )

  const filteredProducts = useMemo(() => {
    const q = search.toLowerCase()
    if (!q) return products
    return products.filter(p =>
      p.name.toLowerCase().includes(q) ||
      p.keywords.some(k => k.includes(q))
    )
  }, [search, products])

  const handleSave = () => {
    if (activeItems.length === 0) {
      onToast('No hay items para guardar', 'warn')
      return
    }
    const items = activeItems.map(([id, qty]) => ({ id, qty }))
    saveDay(date, items)
    setQuantities({})
    setShowPreview(false)
    onToast(`Registro ${date} guardado`, 'success')
  }

  const handleClear = () => {
    setQuantities({})
    setShowPreview(false)
    onToast('Registro limpiado', 'info')
  }

  return (
    <div className="flex flex-col gap-3 pb-28">
      <div className="flex gap-2">
        <input
          type="date"
          value={date}
          onChange={e => setDate(e.target.value)}
          className="flex-1 bg-surface border border-border rounded-xl px-3 py-2.5
            text-text-primary font-mono text-sm focus:outline-none focus:border-accent-green
            transition-colors"
        />
        <button
          onClick={() => setDate(today)}
          className="px-4 py-2.5 bg-surface border border-border rounded-xl
            text-accent-green font-ui font-semibold text-sm
            active:bg-accent-green/10 transition-colors"
        >
          Hoy
        </button>
      </div>

      <div className="flex gap-2">
        <input
          type="text"
          value={rawInput}
          onChange={e => setRawInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleParse()}
          placeholder="ej: 2 cafe 1 papel desinfectante"
          className="flex-1 bg-surface border border-border rounded-xl px-3 py-2.5
            text-text-primary font-mono text-sm placeholder:text-text-muted
            focus:outline-none focus:border-accent-green transition-colors"
        />
        <button
          onClick={handleParse}
          className="px-4 py-2.5 bg-accent-green/10 border border-accent-green/30
            rounded-xl text-accent-green font-ui font-semibold text-sm
            active:bg-accent-green/20 transition-colors"
        >
          Agregar
        </button>
      </div>

      <input
        type="text"
        value={search}
        onChange={e => setSearch(e.target.value)}
        placeholder="Buscar producto..."
        className="bg-surface border border-border rounded-xl px-3 py-2.5
          text-text-primary font-mono text-sm placeholder:text-text-muted
          focus:outline-none focus:border-accent-blue transition-colors"
      />

      <div className="grid grid-cols-2 gap-2">
        {filteredProducts.map(p => (
          <ProductCard
            key={p.id}
            product={p}
            productId={p.id}
            qty={quantities[p.id] || 0}
            onIncrement={increment}
            onDecrement={decrement}
          />
        ))}
      </div>

      {activeItems.length > 0 && (
        <div className="fixed bottom-16 left-0 right-0 max-w-md mx-auto px-4 pb-2 z-20">
          <div className="bg-bg/95 backdrop-blur-md border border-border rounded-2xl p-3 shadow-xl">
            <button
              onClick={() => setShowPreview(!showPreview)}
              className="w-full py-2.5 bg-accent-green text-bg font-ui font-bold
                rounded-xl text-sm tracking-wide active:opacity-90 transition-opacity"
            >
              {showPreview
                ? 'Ocultar resumen'
                : `Ver resumen — ${activeItems.length} producto(s)`}
            </button>

            {showPreview && (
              <div className="mt-2 space-y-1 animate-fade-in">
                {activeItems.map(([id, qty]) => (
                  <div key={id} className="flex justify-between items-center text-sm px-1">
                    <span className="text-text-muted font-ui">{productMap[id]?.name}</span>
                    <span className="font-mono text-accent-green tabular-nums">{qty} {productMap[id]?.unit}</span>
                  </div>
                ))}
                <div className="flex gap-2 mt-2 pt-2 border-t border-border">
                  <button
                    onClick={handleClear}
                    className="flex-1 py-2 border border-border rounded-xl
                      text-text-muted font-ui text-sm active:bg-surface transition-colors"
                  >
                    Limpiar
                  </button>
                  <button
                    onClick={handleSave}
                    className="flex-2 px-6 py-2 bg-accent-green text-bg
                      font-ui font-bold rounded-xl text-sm active:opacity-90"
                  >
                    Guardar
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
