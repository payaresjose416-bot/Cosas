import { useState, useCallback } from 'react'
import { PRODUCTS } from '../utils/products.js'

export function useAI() {
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)

  const analyze = useCallback(async ({ stock, history, getDaysRemaining }) => {
    setLoading(true)
    setError(null)
    setResult(null)

    const apiKey = import.meta.env.VITE_ANTHROPIC_KEY
    if (!apiKey) {
      setError('Agrega VITE_ANTHROPIC_KEY en el archivo .env y reinicia el servidor')
      setLoading(false)
      return
    }

    const inventorySummary = PRODUCTS.map(p => ({
      nombre: p.name,
      unidad: p.unit,
      stock: +(stock[p.id] ?? p.initialStock).toFixed(2),
      diasRestantes: +getDaysRemaining(p.id).toFixed(1),
    }))

    const recentHistory = history.slice(-7).map(h => ({
      fecha: h.date,
      items: h.items.map(i => ({
        producto: PRODUCTS.find(p => p.id === i.id)?.name ?? i.id,
        cantidad: i.qty,
      })),
    }))

    const prompt = `Eres un asistente de gestión de inventario para Inversiones en Salud - Coosalud Inversa S.A. (Colombia).

Inventario actual:
${JSON.stringify(inventorySummary, null, 2)}

Consumo últimos 7 días:
${JSON.stringify(recentHistory, null, 2)}

Por favor proporciona:
1. Alertas de compra urgente (menos de 3 días de stock)
2. Alertas de compra próxima (3-7 días de stock)
3. Tendencias de consumo inusuales
4. Recomendaciones de cantidades a comprar para 30 días
5. Observaciones relevantes

Responde en español, de forma clara y concisa, usando listas con viñetas.`

    try {
      const response = await fetch('/api/anthropic/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 1024,
          messages: [{ role: 'user', content: prompt }],
        }),
      })

      if (!response.ok) {
        const err = await response.json().catch(() => ({}))
        throw new Error(err.error?.message ?? `Error HTTP ${response.status}`)
      }

      const data = await response.json()
      setResult(data.content[0].text)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  return { loading, result, error, analyze }
}
