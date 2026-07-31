import { normalize } from '../../src/utils/excelExport.js'
import { CliError } from './format.js'

// Resuelve un argumento de producto tecleado por el usuario (id exacto,
// nombre exacto, o substring de nombre/keyword) a un único producto del
// catálogo. Lanza si es ambiguo o si no encuentra nada, con candidatos en el
// mensaje — mejor eso que adivinar mal y escribir sobre el producto que no era.
export function resolveProduct(query, products) {
  if (!query) return null
  const norm = normalize(query)

  const byId = products.find(p => p.id === query)
  if (byId) return byId

  const byExactName = products.find(p => normalize(p.name) === norm)
  if (byExactName) return byExactName

  const candidates = products.filter(p =>
    normalize(p.name).includes(norm) ||
    norm.includes(normalize(p.name)) ||
    (p.keywords || []).some(k => normalize(k).includes(norm) || norm.includes(normalize(k)))
  )

  if (candidates.length === 1) return candidates[0]
  if (candidates.length > 1) {
    throw new CliError(
      `"${query}" es ambiguo, coincide con varios productos: ` +
      candidates.map(c => `${c.id} (${c.name})`).join(', ')
    )
  }
  throw new CliError(`No se encontró ningún producto que coincida con "${query}".`)
}
