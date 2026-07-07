import { useEffect, useRef, useCallback } from 'react'
import { supabase, loadFromCloud, saveToCloud } from '../utils/supabase.js'

export function useSync(key, localValue, onCloudUpdate) {
  const saving = useRef(false)
  const lastSaved = useRef(null)
  const localValueRef = useRef(localValue)
  localValueRef.current = localValue

  useEffect(() => {
    loadFromCloud(key).then(cloudValue => {
      if (cloudValue == null) return
      const cloudStr = JSON.stringify(cloudValue)
      const localStr = JSON.stringify(localValueRef.current)
      if (cloudStr === localStr) return
      if (cloudStr === '{}' || cloudStr === '[]') return
      if (localStr === '{}' || localStr === '[]') {
        onCloudUpdate(cloudValue)
      }
    })
  }, [])

  useEffect(() => {
    const channel = supabase
      .channel(`app_data_${key}`)
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'app_data', filter: `key=eq.${key}` },
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

  const syncToCloud = useCallback((value) => {
    const str = JSON.stringify(value)
    if (str === '{}' || str === '[]') return
    if (str === lastSaved.current) return
    lastSaved.current = str
    saving.current = true
    saveToCloud(key, value).finally(() => { saving.current = false })
  }, [key])

  return syncToCloud
}
