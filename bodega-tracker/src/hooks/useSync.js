import { useEffect, useRef, useCallback } from 'react'
import { supabase, loadFromCloud, saveToCloud } from '../utils/supabase.js'

// merge: función opcional (local, cloud) => union. Cuando se provee, la sincronización
// es NO DESTRUCTIVA: la nube nunca pierde datos y la carga inicial fusiona en vez de
// reemplazar. Sin merge (ej. stock), se mantiene el comportamiento local-first.
export function useSync(key, localValue, onCloudUpdate, merge) {
  const saving = useRef(false)
  const lastSaved = useRef(null)
  const localValueRef = useRef(localValue)
  localValueRef.current = localValue

  const syncToCloud = useCallback(async (value) => {
    const str = JSON.stringify(value)
    if (str === '{}' || str === '[]') return
    if (str === lastSaved.current) return
    saving.current = true
    try {
      if (merge) {
        // read-merge-write: la nube nunca se encoge, aunque este dispositivo
        // tenga menos datos que otro.
        const cloudValue = await loadFromCloud(key)
        const finalValue = (cloudValue != null) ? merge(value, cloudValue) : value
        lastSaved.current = JSON.stringify(finalValue)
        await saveToCloud(key, finalValue)
      } else {
        lastSaved.current = str
        await saveToCloud(key, value)
      }
    } finally {
      saving.current = false
    }
  }, [key, merge])

  // Carga inicial
  useEffect(() => {
    loadFromCloud(key).then(cloudValue => {
      if (cloudValue == null) return
      const cloudStr = JSON.stringify(cloudValue)
      if (cloudStr === '{}' || cloudStr === '[]') return
      const localStr = JSON.stringify(localValueRef.current)
      if (cloudStr === localStr) return
      if (merge) {
        // Fusiona la nube en lo local (no destructivo) y sube la unión,
        // para que la nube quede con todo lo de este dispositivo también.
        onCloudUpdate(cloudValue)
        syncToCloud(localValueRef.current)
      } else if (localStr === '{}' || localStr === '[]') {
        // Sin merge (stock): solo jala de la nube si lo local está vacío.
        onCloudUpdate(cloudValue)
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Tiempo real
  useEffect(() => {
    const channel = supabase
      .channel(`app_data_${key}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'app_data', filter: `key=eq.${key}` },
        (payload) => {
          if (saving.current) return
          const cloudValue = payload.new.value
          if (cloudValue == null) return
          const cloudStr = JSON.stringify(cloudValue)
          if (cloudStr === '{}' || cloudStr === '[]') return
          const localStr = JSON.stringify(localValueRef.current)
          if (cloudStr !== localStr) {
            onCloudUpdate(cloudValue)
          }
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [key, onCloudUpdate])

  return syncToCloud
}
