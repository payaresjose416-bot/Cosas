import { parseArgs } from 'node:util'
import { loadNotes, saveNotes } from '../lib/store.js'
import { applyAddNote } from '../../src/core/notes.js'
import { confirmWrite } from '../lib/confirm.js'
import { printJSON, die } from '../lib/format.js'

export async function run(args) {
  const { values, positionals } = parseArgs({
    args,
    options: {
      de: { type: 'string' },
      yes: { type: 'boolean', default: false },
      'dry-run': { type: 'boolean', default: false },
      json: { type: 'boolean', default: false },
    },
    allowPositionals: true,
  })

  const text = positionals.join(' ').trim()
  if (!text) die('Uso: bodega queja "<texto>" [--de "<autor>"]')

  const preview = () => {
    console.error('Dejar en el buzón:')
    console.error(`  "${text}"${values.de ? ` — ${values.de}` : ''}`)
  }

  const proceed = await confirmWrite({
    preview, dryRun: values['dry-run'], yes: values.yes,
    actionLabel: 'Guardar en el buzón',
  })
  if (!proceed) return

  const notes = await loadNotes()
  const next = applyAddNote(notes, { text, author: values.de })
  await saveNotes(next)

  if (values.json) printJSON({ ok: true, text, author: values.de || null })
  else console.log('Guardado en el buzón.')
}
