import { useState, useEffect, useCallback, useRef } from 'react'
import { useSync } from './useSync.js'
import { mergeNotes } from '../core/merge.js'
import { applyAddNote, applyDeleteNote } from '../core/notes.js'

const LS_KEY = 'bodega_buzon'

function initNotes() {
  try {
    const stored = localStorage.getItem(LS_KEY)
    if (stored) return JSON.parse(stored)
  } catch { /* localStorage corrupto o inaccesible, arranca vacío */ }
  return []
}

// Buzón de notas/hallazgos que un agente (p. ej. Claude Desktop, vía
// `bodega queja` en el CLI) le deja al usuario, visible en la pestaña Buzón.
// El usuario solo puede descartarlas (tombstone) desde la app — crearlas es
// exclusivo del CLI. Mismo patrón de sync que el resto de useInventory.js.
export function useBuzon() {
  const [notes, setNotes] = useState(initNotes)
  const skipSync = useRef(false)

  const syncNotes = useSync('buzon', notes, useCallback((cloudNotes) => {
    skipSync.current = true
    setNotes(prev => {
      const merged = mergeNotes(prev, cloudNotes)
      localStorage.setItem(LS_KEY, JSON.stringify(merged))
      return merged
    })
  }, []), mergeNotes)

  useEffect(() => {
    localStorage.setItem(LS_KEY, JSON.stringify(notes))
    if (skipSync.current) { skipSync.current = false; return }
    syncNotes(notes)
  }, [notes, syncNotes])

  const deleteNote = useCallback((id) => {
    setNotes(prev => applyDeleteNote(prev, id))
  }, [])

  // Expuesto para consistencia con el resto de hooks/pruebas; la creación
  // real de notas vive en el CLI (`bodega queja`), no en la UI.
  const addNote = useCallback((text, author) => {
    setNotes(prev => applyAddNote(prev, { text, author }))
  }, [])

  return { notes: notes.filter(n => !n.deleted), addNote, deleteNote }
}
