const STATUS_LABEL = { critical: 'CRÍTICO', low: 'BAJO', ok: 'OK' }

export function statusLabel(status) {
  return STATUS_LABEL[status] || status
}

// Tabla de ancho fijo por columna, sin dependencias externas.
export function printTable(headers, rows) {
  const widths = headers.map((h, i) =>
    Math.max(String(h).length, ...rows.map(r => String(r[i] ?? '').length))
  )
  const line = cells => cells.map((c, i) => String(c ?? '').padEnd(widths[i])).join('  ')
  console.log(line(headers))
  console.log(widths.map(w => '-'.repeat(w)).join('  '))
  for (const row of rows) console.log(line(row))
}

export function printJSON(data) {
  console.log(JSON.stringify(data, null, 2))
}

// Error "esperado" (uso incorrecto, producto no encontrado, etc.) — el
// dispatcher en cli/bin/bodega.js lo atrapa e imprime solo el mensaje, sin
// stack trace, y sale con código 1. Usar throw (no process.exit) para que el
// control siempre vuelva al await del dispatcher, sin dejar código async a
// medio correr.
export class CliError extends Error {}

export function die(message) {
  throw new CliError(message)
}
