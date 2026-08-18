// Envoltorio de registro de tools — equivalente al catch de cli/bin/bodega.js:
// CliError (uso incorrecto, producto ambiguo, etc.) se devuelve como mensaje
// limpio sin stack trace; cualquier otro error se loguea completo a stderr
// (NUNCA stdout — el servidor MCP usa stdout solo para el framing JSON-RPC)
// y se devuelve un mensaje genérico. Ambos casos marcan isError:true para
// que el modelo sepa que la tool call falló y no asuma que sí escribió.
import { CliError } from '../../cli/lib/format.js'

export function registerTool(server, name, config, handler) {
  server.registerTool(name, config, async (args, extra) => {
    try {
      return await handler(args, extra)
    } catch (err) {
      if (err instanceof CliError) {
        return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true }
      }
      console.error(err)
      return { content: [{ type: 'text', text: `Error inesperado: ${err.message}` }], isError: true }
    }
  })
}
