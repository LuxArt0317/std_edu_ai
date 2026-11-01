import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'

function readEnv(path) {
  if (!fs.existsSync(path)) return {}
  return Object.fromEntries(fs.readFileSync(path, 'utf8').split(/\r?\n/).filter((line) => line && !line.startsWith('#') && line.includes('=')).map((line) => {
    const at = line.indexOf('=')
    return [line.slice(0, at), line.slice(at + 1)]
  }))
}

function required(result, label) {
  if (result.error) throw new Error(`${label}: ${result.error.message}`)
  if (!result.data) throw new Error(`${label}: no data`)
  return result.data
}

Object.assign(process.env, readEnv('.env'), readEnv('.env.local'))
const email = 'winsonbaring10@gmail.com'
const secret = spawnSync('/usr/bin/security', ['find-internet-password', '-w', '-s', 'www.stu.best', '-a', email], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
if (secret.status !== 0 || !secret.stdout.trim()) throw new Error('Missing protected owner credential.')

const db = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
const auth = await db.auth.signInWithPassword({ email, password: secret.stdout.trim() })
if (auth.error || !auth.data.session || !auth.data.user) throw auth.error || new Error('Owner sign-in failed.')

const suffix = Date.now().toString(36).toUpperCase()
const marker = `Production endpoint telemetry marker ${suffix}`
const canonicalUrl = `https://www.stu.edu.tw/ingestion/api-${suffix.toLowerCase()}`
let sourceId = ''
let workflowError = null

try {
  sourceId = required(await db.from('knowledge_sources').insert({
    name: `Ingestion verification API ${suffix}`,
    source_type: 'website',
    canonical_url: canonicalUrl,
    official_domain: true,
    authority_level: 'primary_official',
    owner_profile_id: auth.data.user.id,
    default_audience_scope: 'public',
    default_language: 'en',
    crawl_policy: 'manual',
    robots_reviewed_at: new Date().toISOString(),
    terms_reviewed_at: new Date().toISOString(),
    active: true,
  }).select('id').single(), 'create source').id

  const body = {
    sourceId,
    title: `Endpoint verification ${suffix}`,
    logicalKey: `endpoint-verification-${suffix.toLowerCase()}`,
    sourceUrl: canonicalUrl,
    domain: 'academic_rules',
    documentType: 'text',
    language: 'en',
    audienceScope: 'public',
    sensitivity: 'public',
    content: `${marker}. This official synthetic fixture validates the complete governed ingestion API, deterministic indexing, retry telemetry, and duplicate protection.`,
  }
  const call = async () => {
    const response = await fetch(`${process.env.INGESTION_API_ORIGIN || 'https://stdeduai.vercel.app'}/api/knowledge-ingest`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${auth.data.session.access_token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(60_000),
    })
    const payload = await response.json()
    return { response, payload }
  }

  const first = await call()
  if (first.response.status !== 201 || first.payload.status !== 'awaiting_review' || !first.payload.ingestionRunId || first.payload.chunks < 1) {
    throw new Error(`First production ingestion failed: ${first.response.status} ${JSON.stringify(first.payload)}`)
  }
  const second = await call()
  if (second.response.status !== 200 || second.payload.status !== 'deduplicated' || second.payload.documentId !== first.payload.documentId) {
    throw new Error(`Idempotent retry failed: ${second.response.status} ${JSON.stringify(second.payload)}`)
  }

  const run = required(await db.from('knowledge_ingestion_runs').select('*').eq('id', first.payload.ingestionRunId).single(), 'load terminal run')
  const attempts = required(await db.from('knowledge_ingestion_attempts').select('*').eq('run_id', run.id).order('attempt_number'), 'load attempts')
  const documents = required(await db.from('knowledge_documents').select('id').eq('source_id', sourceId), 'load documents')
  const chunks = required(await db.from('knowledge_chunks').select('id').eq('document_id', first.payload.documentId), 'load chunks')
  if (run.status !== 'awaiting_review' || run.attempt_count !== 1 || run.max_attempts !== 3 || run.finished_at === null || run.duration_ms === null || run.duration_ms < 0) throw new Error('The ingestion run did not reach a complete terminal telemetry state.')
  if (run.input_token_count < 1 || run.chunk_count !== chunks.length || run.estimated_cost_usd === null || !['configured', 'unconfigured'].includes(run.cost_estimation_status)) throw new Error('Token, chunk, or cost telemetry is incomplete.')
  if (attempts.length !== 1 || attempts[0].state !== 'succeeded' || attempts[0].finished_at === null || attempts[0].embedding_ms === null || attempts[0].input_token_count < 1) throw new Error('Attempt telemetry is incomplete.')
  if (documents.length !== 1 || chunks.length !== first.payload.chunks) throw new Error('Duplicate ingestion created extra documents or an inconsistent index.')
  if (JSON.stringify({ run, attempts }).includes(marker)) throw new Error('Raw document content leaked into operational telemetry.')

  const cleanup = required(await db.rpc('purge_knowledge_verification_fixture', { p_source_id: sourceId }), 'cleanup')
  sourceId = ''
  const residualRuns = required(await db.from('knowledge_ingestion_runs').select('id').eq('id', run.id), 'verify run cleanup')
  const residualDocuments = required(await db.from('knowledge_documents').select('id').eq('id', first.payload.documentId), 'verify document cleanup')
  if (residualRuns.length || residualDocuments.length || cleanup.purged !== true) throw new Error('Production ingestion fixtures were not completely removed.')

  console.log(JSON.stringify({
    endpointStatus: 201,
    terminalStatus: run.status,
    attempts: attempts.length,
    maxAttempts: run.max_attempts,
    chunks: chunks.length,
    inputTokens: run.input_token_count,
    durationRecorded: true,
    costRecorded: true,
    duplicateDocuments: 0,
    duplicateChunks: 0,
    contentFieldsInTelemetry: 0,
    residualFixtures: 0,
  }))
} catch (error) {
  workflowError = error
} finally {
  if (sourceId) await db.rpc('purge_knowledge_verification_fixture', { p_source_id: sourceId })
  await db.auth.signOut()
}

if (workflowError) throw workflowError
