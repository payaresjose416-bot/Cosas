function formatDateTime(ts) {
  const d = new Date(ts)
  return d.toLocaleString('es-CO', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

export default function TabBuzon({ notes, deleteNote, onToast }) {
  const sorted = [...notes].sort((a, b) => b.createdAt - a.createdAt)

  const handleDelete = (note) => {
    deleteNote(note.id)
    onToast('Nota descartada', 'info')
  }

  if (sorted.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-2">
        <span className="text-4xl">📬</span>
        <p className="text-text-muted font-ui text-sm">Buzón vacío</p>
        <p className="text-text-muted font-ui text-xs text-center px-8">
          Aquí aparecen las notas que un agente deja con "bodega queja" desde el CLI
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3 pb-4">
      {sorted.map(note => (
        <div
          key={note.id}
          className="bg-surface border border-border rounded-2xl overflow-hidden animate-fade-in"
        >
          <div className="flex items-center justify-between px-3 py-2.5 border-b border-border">
            <div className="flex items-center gap-2">
              <span className="font-mono text-sm font-bold text-accent-green">
                {formatDateTime(note.createdAt)}
              </span>
              {note.author && (
                <span className="text-[10px] font-ui font-bold text-text-muted
                  bg-bg px-2 py-0.5 rounded-full">
                  {note.author}
                </span>
              )}
            </div>
            <button
              onClick={() => handleDelete(note)}
              className="text-xs text-accent-danger font-ui active:opacity-70"
            >
              Descartar
            </button>
          </div>
          <div className="px-3 py-2.5">
            <p className="text-sm text-text-primary font-ui whitespace-pre-wrap">
              {note.text}
            </p>
          </div>
        </div>
      ))}
    </div>
  )
}
