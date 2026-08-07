// Funciones puras de fusión (merge) para datos sincronizados entre dispositivos.
// Sin React, sin localStorage, sin APIs de navegador — las usan tanto los hooks
// de la app web (src/hooks/*) como el CLI (cli/*). Ver CLAUDE.md: "cross-device
// sync" para las reglas que este archivo debe seguir (LWW por registro,
// tombstones, la nube nunca se encoge).

// Normaliza un mapa legado `{id: qty}` (número plano, formato viejo de la
// clave nube 'stock', ya retirada) a `{id: {qty, updatedAt}}`. Solo la usa la
// migración de arranque en useInventory.js/cli/lib/store.js para leer esa
// clave una última vez — no participa de ningún merge en curso.
export function toEntries(qtyMap) {
  return Object.fromEntries(Object.entries(qtyMap || {}).map(([id, v]) =>
    [id, (v && typeof v === 'object') ? v : { qty: Number(v) || 0, updatedAt: 0 }]
  ))
}

// LWW por clave: gana la versión con updatedAt más reciente (incluye tombstones
// de borrado, para que un "eliminar" no resucite al sincronizar). Entradas
// legacy sin updatedAt cuentan como 0 — en empate gana lo local (unión, v11).
export function mergeThresholds(local, cloud) {
  const next = { ...local }
  for (const [id, cv] of Object.entries(cloud || {})) {
    const lv = next[id]
    if (!lv || (cv.updatedAt || 0) > (lv.updatedAt || 0)) next[id] = cv
  }
  return next
}

export function mergeHistory(local, cloud) {
  const map = new Map()
  const keyOf = e => e.date + '|' + (e.type || 'salida')
  for (const entry of local) map.set(keyOf(entry), entry)
  for (const entry of cloud) {
    const k = keyOf(entry)
    const existing = map.get(k)
    if (!existing || (entry.updatedAt || 0) > (existing.updatedAt || 0)) map.set(k, entry)
  }
  return [...map.values()].sort((a, b) => a.date.localeCompare(b.date))
}

export function mergeProducts(local, cloud) {
  const map = new Map()
  for (const p of local) map.set(p.id, p)
  for (const p of cloud) if (!map.has(p.id)) map.set(p.id, p)
  return [...map.values()]
}
