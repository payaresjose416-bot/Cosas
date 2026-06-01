import { PRODUCT_MAP } from '../utils/products.js'

const MONTHS_ES = [
  'ene','feb','mar','abr','may','jun',
  'jul','ago','sep','oct','nov','dic',
]

function formatDate(iso) {
  const [y, m, d] = iso.split('-')
  return `${parseInt(d)} ${MONTHS_ES[parseInt(m) - 1]} ${y}`
}

export default function TabHistorial({ history, deleteDay, onToast }) {
  const sorted = [...history].sort((a, b) => b.date.localeCompare(a.date))

  const handleDelete = (date) => {
    if (window.confirm(`¿Eliminar el registro de ${formatDate(date)}?`)) {
      deleteDay(date)
      onToast(`Registro ${formatDate(date)} eliminado`, 'warn')
    }
  }

  if (sorted.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-2">
        <span className="text-4xl">📦</span>
        <p className="text-text-muted font-ui text-sm">Sin registros todavía</p>
        <p className="text-text-muted font-ui text-xs">
          Usa la pestaña Registro para agregar el consumo diario
        </p>
      </div>
    )
  }

  const totalItems = sorted.reduce((s, h) => s + h.items.reduce((a, i) => a + i.qty, 0), 0)

  return (
    <div className="flex flex-col gap-3 pb-4">
      {/* Summary */}
      <div className="flex gap-2">
        <div className="flex-1 bg-surface border border-border rounded-xl px-3 py-2 text-center">
          <p className="text-2xl font-mono font-bold text-accent-green">{sorted.length}</p>
          <p className="text-xs text-text-muted font-ui">días</p>
        </div>
        <div className="flex-1 bg-surface border border-border rounded-xl px-3 py-2 text-center">
          <p className="text-2xl font-mono font-bold text-accent-blue">{totalItems}</p>
          <p className="text-xs text-text-muted font-ui">unidades</p>
        </div>
      </div>

      {/* Entries */}
      {sorted.map(entry => (
        <div key={entry.date}
          className="bg-surface border border-border rounded-2xl overflow-hidden animate-fade-in"
        >
          <div className="flex items-center justify-between px-3 py-2.5 border-b border-border">
            <span className="font-mono text-sm text-accent-green font-bold">
              {formatDate(entry.date)}
            </span>
            <div className="flex items-center gap-3">
              <span className="text-xs text-text-muted font-mono">
                {entry.items.reduce((s, i) => s + i.qty, 0)} uds
              </span>
              <button
                onClick={() => handleDelete(entry.date)}
                className="text-xs text-accent-danger font-ui active:opacity-70"
              >
                Eliminar
              </button>
            </div>
          </div>
          <div className="px-3 py-2 space-y-1.5">
            {entry.items.map(item => {
              const product = PRODUCT_MAP[item.id]
              return (
                <div key={item.id} className="flex justify-between items-center text-sm">
                  <span className="text-text-muted font-ui">
                    {product?.name ?? item.id}
                  </span>
                  <span className="font-mono text-text-primary tabular-nums">
                    {item.qty} <span className="text-text-muted text-xs">{product?.unit}</span>
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
