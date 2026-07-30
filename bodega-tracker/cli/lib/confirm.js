import readline from 'node:readline/promises'

export async function confirm(promptText) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  try {
    const answer = (await rl.question(`${promptText} [s/N] `)).trim().toLowerCase()
    return answer === 's' || answer === 'si' || answer === 'sí' || answer === 'y' || answer === 'yes'
  } finally {
    rl.close()
  }
}

// Patrón común a todos los comandos de escritura: mostrar `preview` (una
// función que imprime lo que va a cambiar), y luego decidir si se ejecuta.
// - `--dry-run`: solo muestra la vista previa, nunca escribe.
// - `--yes`: se salta la confirmación interactiva.
export async function confirmWrite({ preview, dryRun, yes, actionLabel = 'Aplicar este cambio' }) {
  preview()
  if (dryRun) {
    console.error('\n(vista previa — no se escribió nada, usa sin --dry-run para aplicar)')
    return false
  }
  if (yes) return true
  return confirm(`\n${actionLabel}?`)
}
