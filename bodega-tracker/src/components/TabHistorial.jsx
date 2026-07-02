const MONTHS_ES = [
  'ene','feb','mar','abr','may','jun',
  'jul','ago','sep','oct','nov','dic',
]

function formatDate(iso) {
  const [y, m, d] = iso.split('-')
  return `${parseInt(d)} ${MONTHS_ES[parseInt(m) - 1]} ${y}`
}

export default function TabHistorial({ history, deleteDay, onToast, productMap, onEditEntry }) {
  const sorted = [...history].sort((a, b) =>
    b.date.localeCompare(a.date) || ((a.type || 'salida') === 'entrada' ? -1 : 1)
  )

  const handleDelete = (entry) => {
    const entryType = entry.type || 'salida'
    const label = entryType === 'entrada' ? 'entrada' : 'registro'
    if (window.confirm(`Eliminar ${label} de ${formatDate(entry.date)}?`)) {
      deleteDay(entry.date, entryType)
      onToast(`${entryType === 'entrada' ? 'Entrada' : 'Registro'} ${formatDate(entry.date)} eliminado`, 'warn')
    }
  }

  if (sorted.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-2">
        <span className="text-4xl">📦</span>
        <p className="text-text-muted font-ui text-sm">Sin registros todavia</p>
        <p className="text-text-muted font-ui text-xs">
          Usa la pestana Registro para agregar el consumo diario
        </p>
      </div>
    )
  }

  const totalItems = sorted.reduce((s, h) => s + h.items.reduce((a, i) => a + i.qty, 0), 0)

  return (
    <div className="flex flex-col gap-3 pb-4">
      <div className="flex gap-2">
        <div className="flex-1 bg-surface border border-border rounded-xl px-3 py-2 text-center">
          <p className="text-2xl font-mono font-bold text-accent-green">{sorted.length}</p>
          <p className="text-xs text-text-muted font-ui">registros</p>
        </div>
        <div className="flex-1 bg-surface border border-border rounded-xl px-3 py-2 text-center">
          <p className="text-2xl font-mono font-bold text-accent-blue">{totalItems}</p>
          <p className="text-xs text-text-muted font-ui">unidades</p>
        </div>
      </div>

      {sorted.map(entry => {
        const isEntrada = (entry.type || 'salida') === 'entrada'
        return (
          <div
            key={entry.date + (entry.type || 'salida')}
            className={`bg-surface border rounded-2xl overflow-hidden animate-fade-in
              ${isEntrada ? 'border-accent-blue/30' : 'border-border'}`}
          >
            <div className={`flex items-center justify-between px-3 py-2.5 border-b
              ${isEntrada ? 'border-accent-blue/20' : 'border-border'}`}
            >
              <div className="flex items-center gap-2">
                <span className={`font-mono text-sm font-bold
                  ${isEntrada ? 'text-accent-blue' : 'text-accent-green'}`}
                >
                  {isEntrada ? '↑ ' : ''}{formatDate(entry.date)}
                </span>
                {isEntrada && (
                  <span className="text-[10px] font-ui font-bold text-accent-blue
                    bg-accent-blue/10 px-2 py-0.5 rounded-full">
                    ENTRADA
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs text-text-muted font-mono">
                  {entry.items.reduce((s, i) => s + i.qty, 0)} uds
                </span>
                <button
                  onClick={() => onEditEntry(entry)}
                  className="text-xs text-accent-blue font-ui active:opacity-70"
                >
                  Editar
                </button>
                <button
                  onClick={() => handleDelete(entry)}
                  className="text-xs text-accent-danger font-ui active:opacity-70"
                >
                  Eliminar
                </button>
              </div>
            </div>
            <div className="px-3 py-2 space-y-1.5">
              {entry.items.map(item => {
                const product = productMap[item.id]
                return (
                  <div key={item.id} className="flex justify-between items-center text-sm">
                    <span className="text-text-muted font-ui">
                      {product?.name ?? item.id}
                    </span>
                    <span className={`font-mono tabular-nums
                      ${isEntrada ? 'text-accent-blue' : 'text-text-primary'}`}
                    >
                      {isEntrada ? '+' : ''}{item.qty}{' '}
                      <span className="text-text-muted text-xs">{product?.unit}</span>
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}
