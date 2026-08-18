// Token de un solo uso para el patrón preview/confirmar de las tools de
// escritura. Vive en memoria del proceso (se pierde al reiniciar el
// servidor — falla seguro, obliga a repetir el preview). Ver
// mcp/tools/write.js y mcp/tools/excel.js para cómo se usa.
import { randomUUID, createHash } from 'node:crypto'
import { CliError } from '../../cli/lib/format.js'

const TTL_MS = 15 * 60 * 1000
const tokens = new Map()

function hashPayload(payload) {
  return createHash('sha256').update(canonicalJSON(payload)).digest('hex')
}

// JSON.stringify con claves ordenadas, para que el hash no dependa del
// orden en que el llamador construyó el objeto.
function canonicalJSON(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJSON).join(',')}]`
  if (value && typeof value === 'object') {
    const keys = Object.keys(value).sort()
    return `{${keys.map(k => `${JSON.stringify(k)}:${canonicalJSON(value[k])}`).join(',')}}`
  }
  return JSON.stringify(value)
}

export function issueToken(toolName, payload) {
  const token = randomUUID()
  tokens.set(token, { toolName, payloadHash: hashPayload(payload), expiresAt: Date.now() + TTL_MS })
  return token
}

// Lanza CliError (mensaje limpio, sin stack) si el token no existe, expiró,
// es de otra tool, o el payload que se quiere aplicar no es exactamente el
// que se mostró en el preview. Consumo de un solo uso: se borra al validar,
// se haya aplicado el cambio o no, para que un mismo token nunca sirva dos
// veces.
export function consumeToken(toolName, token, payload) {
  const entry = tokens.get(token)
  tokens.delete(token)

  if (!entry) {
    throw new CliError('No encontré una vista previa vigente con ese token. Vuelve a correr la tool "_preview" primero.')
  }
  if (entry.expiresAt < Date.now()) {
    throw new CliError('La vista previa expiró (15 min). Vuelve a correr la tool "_preview" primero.')
  }
  if (entry.toolName !== toolName) {
    throw new CliError('Este token pertenece a otra operación. Vuelve a correr la tool "_preview" correcta.')
  }
  if (entry.payloadHash !== hashPayload(payload)) {
    throw new CliError('El contenido que quieres aplicar no coincide con el que se mostró en la vista previa. Vuelve a correr la tool "_preview" con los datos correctos.')
  }
}
