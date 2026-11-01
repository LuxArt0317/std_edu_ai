import type { Json, Tables } from '../../types/database.generated.ts'
import { withTimeout } from '../../utils/async'
import { supabase } from '../../utils/supabase'
import {
  ONBOARDING_JOURNEY_KEY,
  ONBOARDING_JOURNEY_VERSION,
  type OnboardingCheckResult,
} from './onboarding'
import type { PlatformRole } from './types'

type ProgressRow = Tables<'onboarding_progress'>

export type OnboardingEventType =
  | 'journey_started'
  | 'step_viewed'
  | 'action_verified'
  | 'answer_submitted'
  | 'step_completed'
  | 'journey_completed'
  | 'journey_restarted'

export type OnboardingProgress = {
  id: string
  userId: string
  role: PlatformRole
  currentStepKey: string
  completedStepKeys: string[]
  verifiedActionKeys: string[]
  checkResults: Record<string, OnboardingCheckResult>
  understandingScore: number
  status: 'not_started' | 'in_progress' | 'ready'
  startedAt: string | null
  completedAt: string | null
  lastSeenAt: string
  updatedAt: string
}

function requireClient() {
  if (!supabase) throw new Error('Supabase is not configured.')
  return supabase
}

function parseCheckResults(value: Json): Record<string, OnboardingCheckResult> {
  if (!value || Array.isArray(value) || typeof value !== 'object') return {}
  return Object.fromEntries(Object.entries(value).flatMap(([key, result]) => {
    if (!result || Array.isArray(result) || typeof result !== 'object') return []
    const correct = result.correct
    const attempts = result.attempts
    if (typeof correct !== 'boolean' || typeof attempts !== 'number') return []
    return [[key, { correct, attempts: Math.max(0, Math.floor(attempts)) }]]
  }))
}

function mapProgress(row: ProgressRow): OnboardingProgress {
  return {
    id: row.id,
    userId: row.user_id,
    role: row.role as PlatformRole,
    currentStepKey: row.current_step_key,
    completedStepKeys: row.completed_step_keys,
    verifiedActionKeys: row.verified_action_keys,
    checkResults: parseCheckResults(row.check_results),
    understandingScore: row.understanding_score,
    status: row.status as OnboardingProgress['status'],
    startedAt: row.started_at,
    completedAt: row.completed_at,
    lastSeenAt: row.last_seen_at,
    updatedAt: row.updated_at,
  }
}

async function findProgress(userId: string, role: PlatformRole) {
  const client = requireClient()
  return client.from('onboarding_progress').select('*')
    .eq('user_id', userId)
    .eq('role', role)
    .eq('journey_key', ONBOARDING_JOURNEY_KEY)
    .eq('journey_version', ONBOARDING_JOURNEY_VERSION)
    .maybeSingle()
}

export async function loadOrCreateOnboardingProgress(userId: string, role: PlatformRole): Promise<OnboardingProgress> {
  const client = requireClient()
  const existing = await withTimeout(findProgress(userId, role), 10_000, 'Onboarding progress took too long to load.')
  if (existing.error) throw new Error(`Onboarding progress: ${existing.error.message}`)
  if (existing.data) return mapProgress(existing.data)

  const now = new Date().toISOString()
  const created = await withTimeout(
    client.from('onboarding_progress').insert({
      user_id: userId,
      role,
      journey_key: ONBOARDING_JOURNEY_KEY,
      journey_version: ONBOARDING_JOURNEY_VERSION,
      current_step_key: 'welcome',
      last_seen_at: now,
    }).select('*').single(),
    10_000,
    'Onboarding progress took too long to start.',
  )

  if (!created.error && created.data) return mapProgress(created.data)
  if (created.error?.code === '23505') {
    const raced = await findProgress(userId, role)
    if (!raced.error && raced.data) return mapProgress(raced.data)
  }
  throw new Error(`Onboarding progress: ${created.error?.message || 'The journey could not be created.'}`)
}

export async function saveOnboardingProgress(progress: OnboardingProgress): Promise<OnboardingProgress> {
  const client = requireClient()
  const result = await withTimeout(
    client.from('onboarding_progress').update({
      current_step_key: progress.currentStepKey,
      completed_step_keys: [...new Set(progress.completedStepKeys)],
      verified_action_keys: [...new Set(progress.verifiedActionKeys)],
      check_results: progress.checkResults as unknown as Json,
      understanding_score: progress.understandingScore,
      status: progress.status,
      started_at: progress.startedAt,
      completed_at: progress.completedAt,
      last_seen_at: new Date().toISOString(),
    }).eq('id', progress.id).select('*').single(),
    10_000,
    'Onboarding progress took too long to save.',
  )
  if (result.error || !result.data) throw new Error(`Onboarding progress: ${result.error?.message || 'The update was not confirmed.'}`)
  return mapProgress(result.data)
}

export async function appendOnboardingEvent(
  progress: OnboardingProgress,
  stepKey: string,
  eventType: OnboardingEventType,
  eventData: Record<string, Json> = {},
) {
  const client = requireClient()
  const result = await withTimeout(
    client.from('onboarding_events').insert({
      progress_id: progress.id,
      user_id: progress.userId,
      role: progress.role,
      step_key: stepKey,
      event_type: eventType,
      event_data: eventData,
    }),
    10_000,
    'Onboarding evidence took too long to save.',
  )
  if (result.error) throw new Error(`Onboarding evidence: ${result.error.message}`)
}
