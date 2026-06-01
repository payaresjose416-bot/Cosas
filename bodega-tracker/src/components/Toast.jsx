import { useEffect } from 'react'

const COLORS = {
  success: 'border-accent-green text-accent-green bg-surface',
  warn:    'border-accent-warn text-accent-warn bg-surface',
  error:   'border-accent-danger text-accent-danger bg-surface',
  info:    'border-accent-blue text-accent-blue bg-surface',
}

export default function Toast({ message, type = 'success', onDismiss }) {
  useEffect(() => {
    const t = setTimeout(onDismiss, 3000)
    return () => clearTimeout(t)
  }, [onDismiss])

  return (
    <div
      role="alert"
      onClick={onDismiss}
      className={`fixed bottom-28 left-1/2 z-50 w-max max-w-xs
        flex items-center gap-2 px-4 py-3 rounded-2xl border shadow-xl
        text-sm font-ui font-semibold cursor-pointer
        animate-bounce-in
        ${COLORS[type] || COLORS.info}`}
    >
      {message}
    </div>
  )
}
