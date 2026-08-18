import { useEffect, useRef, useCallback } from 'react'
import { supabase, loadFromCloud, saveToCloud } from '../utils/supabase.js'

const POLL_INTERVAL_MS = 5 * 60 * 1000

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

  // Reconcilia con la nube: UNA sola lectura, y si hace falta fusionar, calcula
  // la unión aquí mismo con el valor ya leído en vez de delegar a syncToCloud
  // (que haría una SEGUNDA lectura independiente). Dos SELECT casi simultáneos
  // a la misma fila no tienen garantía de orden — si el segundo llegaba a traer
  // una versión más vieja que el primero, el merge conservaba (y volvía a subir)
  // el valor local viejo, pisando en silencio una escritura ajena recién hecha
  // (p. ej. desde el CLI) segundos después de que llegara. Ver CLAUDE.md, "no
  // repetir la migración de arranque" — misma clase de bug, otro lugar.
  const reconcileFromCloud = useCallback(() => {
    const localSnapshot = localValueRef.current
    loadFromCloud(key).then(cloudValue => {
      if (cloudValue == null) return
      const cloudStr = JSON.stringify(cloudValue)
      if (cloudStr === '{}' || cloudStr === '[]') return
      const localStr = JSON.stringify(localSnapshot)
      if (cloudStr === localStr) return
      if (merge) {
        // Fusiona la nube en lo local (no destructivo) y sube exactamente esa
        // unión — el mismo cálculo que el onCloudUpdate(cloudValue) de abajo
        // termina aplicando vía su propio setState(prev => merge(prev, cloud)).
        const finalValue = merge(localSnapshot, cloudValue)
        onCloudUpdate(cloudValue)
        saving.current = true
        lastSaved.current = JSON.stringify(finalValue)
        saveToCloud(key, finalValue).finally(() => { saving.current = false })
      } else if (localStr === '{}' || localStr === '[]') {
        // Sin merge (stock): solo jala de la nube si lo local está vacío.
        onCloudUpdate(cloudValue)
      }
    })
  }, [key, merge, onCloudUpdate])

  // Carga inicial
  useEffect(() => {
    reconcileFromCloud()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Re-sincroniza al volver a primer plano. Una PWA en el celular que se
  // suspende (sin llegar a un cierre real) no vuelve a montar React ni
  // garantiza que el WebSocket de tiempo real siga vivo — sin esto, un cambio
  // hecho en otro dispositivo mientras estaba en segundo plano puede quedarse
  // pegado indefinidamente. También sirve de respaldo si el realtime de
  // Supabase está caído o no habilitado para la tabla `app_data` (no
  // verificable desde este código, ver CLAUDE.md).
  useEffect(() => {
    const onForeground = () => {
      if (document.visibilityState === 'visible') reconcileFromCloud()
    }
    document.addEventListener('visibilitychange', onForeground)
    window.addEventListener('focus', onForeground)
    window.addEventListener('pageshow', onForeground) // iOS standalone a veces no dispara visibilitychange
    const intervalId = setInterval(onForeground, POLL_INTERVAL_MS)
    return () => {
      document.removeEventListener('visibilitychange', onForeground)
      window.removeEventListener('focus', onForeground)
      window.removeEventListener('pageshow', onForeground)
      clearInterval(intervalId)
    }
  }, [reconcileFromCloud])

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
