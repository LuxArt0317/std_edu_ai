import { readFileSync, readdirSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

// Source contracts follow the real module boundary after extracting portal views.
export function readContractSource(file, options) {
  const name = file instanceof URL ? fileURLToPath(file) : String(file)
  if (!name.replaceAll('\\', '/').endsWith('src/features/school/UnifiedPortal.tsx')) return readFileSync(file, options)
  const directory = path.join(path.dirname(name), 'portal')
  const text = [readFileSync(name, 'utf8'), ...readdirSync(directory).filter(f => f.endsWith('.tsx')).sort().map(f => readFileSync(path.join(directory, f), 'utf8'))].join('\n')
  return options ? text : Buffer.from(text)
}
export async function readContractSourceAsync(file, options) {
  const name = file instanceof URL ? fileURLToPath(file) : String(file)
  return name.endsWith('UnifiedPortal.tsx') ? readContractSource(file, options) : readFile(file, options)
}
