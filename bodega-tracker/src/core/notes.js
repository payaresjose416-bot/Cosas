// Reducers puros para el buzón de notas/quejas — mismo patrón que
// core/inventory.js: sin useState, sin efectos, usado tanto por
// src/hooks/useBuzon.js como por el CLI (cli/commands/queja.js, quejas.js).
// Pensado para que un agente que opera la app vía el CLI (ver
// plugins/bodega/skills/bodega/SKILL.md) le deje hallazgos al usuario,
// visibles en la pestaña Buzón de la app web.

export function applyAddNote(notes, { text, author, now = Date.now() }) {
  const entry = {
    id: crypto.randomUUID(),
    text,
    author: author || null,
    createdAt: now,
    updatedAt: now,
    deleted: false,
  }
  return [...notes, entry]
}

// Tombstone en vez de borrado real: al fusionar con la nube gana por
// updatedAt y la nota descartada no resucita en otro dispositivo.
export function applyDeleteNote(notes, id, { now = Date.now() } = {}) {
  return notes.map(n => n.id === id ? { ...n, deleted: true, updatedAt: now } : n)
}
