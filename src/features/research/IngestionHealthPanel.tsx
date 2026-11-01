import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { useCallback, useEffect, useState } from 'react'
import type { CrmUser } from '../crm/authService'
import { supabase } from '../../utils/supabase'

type Summary = {
  runCount: number
  attemptCount: number
  successCount: number
  failureCount: number
  retriedRuns: number
  deadLetterCount: number
  totalInputTokens: number
  estimatedCostUsd: number
  durationP50Ms: number
  durationP95Ms: number
  oldestBacklogSeconds: number
  failureClasses: Record<string, number>
  caveat: string
}

const permittedRoles = new Set(['owner', 'admin', 'librarian'])

export function IngestionHealthPanel({
  currentUser,
  onMessage,
}: {
  currentUser?: CrmUser
  onMessage: (message: string) => void
}) {
  const [data, setData] = useState<Summary | null>(null)
  const [busy, setBusy] = useState(false)
  const allowed = Boolean(currentUser && permittedRoles.has(currentUser.role))

  const load = useCallback(async () => {
    if (!supabase) return
    const result = await supabase.rpc('knowledge_ingestion_operational_summary', {})
    if (result.error) throw result.error
    setData(result.data as unknown as Summary)
  }, [])

  useEffect(() => {
    if (!allowed) return
    void (async () => {
      try {
        await load()
      } catch (error) {
        onMessage(error instanceof Error ? error.message : 'Ingestion health could not be loaded.')
      }
    })()
  }, [allowed, load, onMessage])

  async function refresh() {
    setBusy(true)
    try {
      await load()
    } catch (error) {
      onMessage(error instanceof Error ? error.message : 'Ingestion health could not be loaded.')
    } finally {
      setBusy(false)
    }
  }

  async function recoverStaleRuns() {
    if (!supabase) return
    setBusy(true)
    try {
      const result = await supabase.rpc('recover_stale_ingestion_runs', {})
      if (result.error) throw result.error
      onMessage(`${result.data} stale ingestion run(s) quarantined for review.`)
      await load()
    } catch (error) {
      onMessage(error instanceof Error ? error.message : 'Recovery failed.')
    } finally {
      setBusy(false)
    }
  }

  if (!allowed) return null

  return (
    <section className="ingestion-health">
      <header>
        <div>
          <span>GOVERNED INGESTION</span>
          <h3>Pipeline operations</h3>
          <p>Content-free telemetry for the last 30 days. Source text, prompts, credentials, and provider payloads are never included.</p>
        </div>
        <Button type="button" disabled={busy} onClick={() => void refresh()}>{busy ? 'Refreshing…' : 'Refresh'}</Button>
      </header>
      {data ? (
        <>
          <div className="ingestion-health-grid">
            {[
              ['Runs', data.runCount],
              ['Succeeded', data.successCount],
              ['Failed', data.failureCount],
              ['Retried', data.retriedRuns],
              ['Dead letter', data.deadLetterCount],
              ['p95 duration', `${Math.round(data.durationP95Ms)} ms`],
              ['Input tokens', data.totalInputTokens],
              ['Estimated cost', `$${Number(data.estimatedCostUsd).toFixed(4)}`],
            ].map(([label, value]) => <Card key={label}><span>{label}</span><strong>{value}</strong></Card>)}
          </div>
          <details>
            <summary>Failure classes and backlog</summary>
            <p>Oldest unfinished run: {data.oldestBacklogSeconds}s</p>
            <ul>{Object.entries(data.failureClasses).map(([name, count]) => <li key={name}>{name.replaceAll('_', ' ')}: {count}</li>)}</ul>
            <small>{data.caveat}</small>
          </details>
          {data.oldestBacklogSeconds > 900 ? (
            <Button type="button" disabled={busy} onClick={() => void recoverStaleRuns()}>Quarantine stale runs</Button>
          ) : null}
        </>
      ) : (
        <div className="measurement-state">
          <strong>No telemetry yet</strong>
          <p>The first governed import will populate measured pipeline health.</p>
        </div>
      )}
    </section>
  )
}
