import { PRODUCT_MAP } from '../utils/products.js'

export default function ProductCard({ productId, qty, onIncrement, onDecrement }) {
  const product = PRODUCT_MAP[productId]
  if (!product) return null

  const isCafe = product.category === 'cafeteria'
  const accent = isCafe ? 'text-accent-warn' : 'text-accent-blue'
  const badgeBg = isCafe
    ? 'bg-accent-warn/10 border-accent-warn/25 text-accent-warn'
    : 'bg-accent-blue/10 border-accent-blue/25 text-accent-blue'
  const active = qty > 0

  return (
    <div className={`rounded-xl p-3 flex flex-col gap-2 border transition-all duration-200
      ${active
        ? 'bg-accent-green/5 border-accent-green/30'
        : 'bg-surface border-border'}`}
    >
      <div className="flex items-start justify-between gap-1 min-h-[2.5rem]">
        <p className="text-text-primary font-ui font-semibold text-sm leading-tight">
          {product.name}
        </p>
        <span className={`shrink-0 text-[10px] px-1.5 py-0.5 rounded-md border font-mono font-bold ${badgeBg}`}>
          {isCafe ? 'CAF' : 'ASEO'}
        </span>
      </div>

      <p className={`text-xs font-mono ${accent}`}>{product.unit}</p>

      <div className="flex items-center justify-between mt-1">
        <button
          onPointerDown={() => onDecrement(productId)}
          className="w-9 h-9 rounded-xl bg-border flex items-center justify-center
            text-xl font-mono text-text-primary
            active:bg-accent-danger/20 active:text-accent-danger
            transition-colors select-none"
          aria-label="Restar"
        >
          −
        </button>

        <span className={`font-mono font-bold text-2xl tabular-nums transition-colors
          ${active ? 'text-accent-green' : 'text-text-muted'}`}>
          {qty}
        </span>

        <button
          onPointerDown={() => onIncrement(productId)}
          className="w-9 h-9 rounded-xl bg-border flex items-center justify-center
            text-xl font-mono text-text-primary
            active:bg-accent-green/20 active:text-accent-green
            transition-colors select-none"
          aria-label="Sumar"
        >
          +
        </button>
      </div>
    </div>
  )
}
