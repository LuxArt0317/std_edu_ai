import { appendFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

// This intentionally targets only the client project. Extend the date and
// re-enable the workflow explicitly to authorize a new activity window.
export const projectRef = 'xiftudmvxphxcjtmfmib'
export const stopAt = '2026-12-09T12:44:38Z'
const endpoint = `https://${projectRef}.supabase.co/rest/v1/knowledge_sources?select=id&limit=1`

export async function checkSupabaseActivity({
  now = new Date(),
  stopNow = false,
  key = process.env.SUPABASE_ACTIVITY_PUBLISHABLE_KEY,
  request = fetch,
} = {}) {
  if (stopNow || now.getTime() >= Date.parse(stopAt)) {
    return { expired: true, queried: false, reason: stopNow ? 'manual_stop' : 'one_month_cutoff' }
  }

  if (!key?.trim()) throw new Error('Supabase activity publishable key is missing')
  const response = await request(endpoint, {
    method: 'GET',
    headers: { apikey: key.trim(), accept: 'application/json' },
    signal: AbortSignal.timeout(15_000),
  })
  if (!response.ok) throw new Error(`Supabase activity query returned HTTP ${response.status}`)
  const rows = await response.json()
  if (!Array.isArray(rows) || rows.length > 1 || rows.some(row => typeof row?.id !== 'string')) {
    throw new Error('Supabase activity query returned an unexpected response')
  }
  return { expired: false, queried: true, rows: rows.length }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const result = await checkSupabaseActivity({ stopNow: process.env.STOP_NOW === 'true' })
    if (process.env.GITHUB_OUTPUT) {
      await appendFile(process.env.GITHUB_OUTPUT, `expired=${result.expired}\n`)
    }
    console.log(JSON.stringify({ projectRef, stopAt, ...result }))
  } catch (error) {
    console.error(`Supabase activity check failed: ${error.message}`)
    process.exitCode = 1
  }
}
