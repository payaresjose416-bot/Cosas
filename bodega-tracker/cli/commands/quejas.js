import { parseArgs } from 'node:util'
import { loadNotes } from '../lib/store.js'
import { printJSON } from '../lib/format.js'

export async function run(args) {
  const { values } = parseArgs({
    args,
    options: {
      json: { type: 'boolean', default: false },
    },
  })

  const notes = await loadNotes()
  const rows = notes.filter(n => !n.deleted).sort((a, b) => b.createdAt - a.createdAt)

  if (values.json) { printJSON(rows); return }

  if (rows.length === 0) {
    console.log('(buzón vacío)')
    return
  }

  for (const n of rows) {
    const fecha = new Date(n.createdAt).toISOString().slice(0, 16).replace('T', ' ')
    console.log(`${fecha}${n.author ? `  ${n.author}` : ''}`)
    console.log(`  ${n.text}`)
    console.log()
  }
}
