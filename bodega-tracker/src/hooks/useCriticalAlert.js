import { useEffect } from 'react'

const NOTIFY_KEY = 'bodega_notify'
const LAST_SIGNATURE_KEY = 'bodega_notify_last'

export function notificationsEnabled() {
  return localStorage.getItem(NOTIFY_KEY) === 'on'
    && typeof Notification !== 'undefined'
    && Notification.permission === 'granted'
}

export async function enableNotifications() {
  if (typeof Notification === 'undefined') return false
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return false
  localStorage.setItem(NOTIFY_KEY, 'on')
  return true
}

export function disableNotifications() {
  localStorage.setItem(NOTIFY_KEY, 'off')
}

export function useCriticalAlert(products, getStatus) {
  useEffect(() => {
    // Espera al sync inicial antes de evaluar el stock
    const timer = setTimeout(async () => {
      if (!notificationsEnabled()) return

      const critical = products.filter(p => getStatus(p.id) === 'critical')
      if (critical.length === 0) return

      // No repetir el mismo aviso el mismo día
      const today = new Date().toISOString().slice(0, 10)
      const signature = today + ':' + critical.map(p => p.id).sort().join(',')
      if (localStorage.getItem(LAST_SIGNATURE_KEY) === signature) return

      try {
        // showNotification vía SW: obligatorio en Android Chrome
        const reg = await navigator.serviceWorker?.ready
        if (!reg) return
        const names = critical.slice(0, 5).map(p => p.name).join(', ')
        const extra = critical.length > 5 ? ` y ${critical.length - 5} más` : ''
        await reg.showNotification('Stock crítico en bodega', {
          body: `${critical.length} producto(s) en crítico: ${names}${extra}`,
          icon: '/pwa-192.png',
          badge: '/pwa-192.png',
          tag: 'bodega-critical',
        })
        localStorage.setItem(LAST_SIGNATURE_KEY, signature)
      } catch {}
    }, 2500)

    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [products, getStatus])
}
