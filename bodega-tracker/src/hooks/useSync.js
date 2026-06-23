import { useEffect, useRef, useCallback } from 'react'
import { supabase, loadFromCloud, saveToCloud } from '../utils/supabase.js'

export function useSync(key, localValue, onCloudUpdate) {
  const saving = useRef(false)
  const lastSaved = useRef(null)

  useEffect(() => {
    loadFromCloud(key).then(cloudValue => {
      if (cloudValue == null) return
      const cloudStr = JSON.stringify(cloudValue)
      const localStr = JSON.stringify(localValue)
      if (cloudStr !== localStr && cloudStr !== '{}' && cloudStr !== '[]') {
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
          const localStr = JSON.stringify(localValue)
          if (JSON.stringify(cloudValue) !== localStr) {
            onCloudUpdate(cloudValue)
          }
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [key, onCloudUpdate])

  const syncToCloud = useCallback((value) => {
    const str = JSON.stringify(value)
    if (str === lastSaved.current) return
    lastSaved.current = str
    saving.current = true
    saveToCloud(key, value).finally(() => { saving.current = false })
  }, [key])

  return syncToCloud
}
