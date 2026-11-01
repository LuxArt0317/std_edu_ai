import { readFileSync, existsSync } from 'node:fs'
import { parseEnv } from 'node:util'

export function deploymentEnvironment() {
  const values = {}
  for (const file of ['.env', '.env.vercel.local', '.env.local']) {
    if (existsSync(file)) Object.assign(values, parseEnv(readFileSync(file, 'utf8')))
  }
  return { ...values, ...process.env }
}
