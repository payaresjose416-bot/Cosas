#!/usr/bin/env node
import { CliError } from '../lib/format.js'

const COMMANDS = {
  stock: () => import('../commands/stock.js'),
  estado: () => import('../commands/estado.js'),
  producto: () => import('../commands/producto.js'),
  historial: () => import('../commands/historial.js'),
  registrar: () => import('../commands/registrar.js'),
  'borrar-dia': () => import('../commands/borrarDia.js'),
  'set-stock': () => import('../commands/setStock.js'),
  umbral: () => import('../commands/umbral.js'),
  'producto-nuevo': () => import('../commands/productoNuevo.js'),
  excel: () => import('../commands/excel.js'),
}

const HELP = `bodega — CLI del inventario de cafetería y aseo (Inversa-Coosalud)

Uso: bodega <comando> [opciones]

Lectura:
  stock [--categoria cafeteria|aseo] [--estado critico|bajo|ok] [--json]
  estado [--json]
  producto <id|nombre> [--json]
  historial [--desde F] [--hasta F] [--limite N] [--json]

Escritura (vista previa + confirmación; --yes la salta, --dry-run nunca escribe):
  registrar "<texto libre>" [--fecha YYYY-MM-DD] [--tipo salida|entrada]
  registrar --item <id>=<qty> [--item ...] [--fecha F] [--tipo T]
  borrar-dia <fecha> [--tipo salida|entrada]
  set-stock <producto> <cantidad>
  umbral <producto> --critico N --bajo N   |   umbral <producto> --quitar
  producto-nuevo <nombre> [--stock N]

Excel:
  excel exportar <archivo.xlsx> [-o salida.xlsx]
  excel sync-stock <archivo.xlsx>
  excel detectar <archivo.xlsx>

Todos los comandos de escritura aceptan --yes y --dry-run.
Todos los comandos de lectura y escritura aceptan --json para salida estructurada.
`

async function main() {
  const [cmd, ...rest] = process.argv.slice(2)

  if (!cmd || cmd === '--help' || cmd === '-h') {
    console.log(HELP)
    return
  }
  if (cmd === '--version') {
    console.log('bodega 0.1.0')
    return
  }

  const load = COMMANDS[cmd]
  if (!load) {
    console.error(`Comando desconocido: "${cmd}"\n`)
    console.log(HELP)
    process.exitCode = 1
    return
  }

  const mod = await load()
  await mod.run(rest)
}

main().catch(err => {
  if (err instanceof CliError) {
    console.error(`Error: ${err.message}`)
    process.exitCode = 1
    return
  }
  console.error(err)
  process.exitCode = 1
})
