import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readContractSource } from '../../scripts/contract-source.mjs';
import {
calculateOnboardingReadiness,
getOnboardingJourney,
onboardingJourneys,
platformRoles,
} from '../../src/features/school/onboarding.ts';

const expectedRoles = [
  'owner', 'admin', 'president', 'vice_president', 'dean', 'registrar',
  'department_head', 'faculty', 'advisor', 'admissions', 'finance', 'support',
  'librarian', 'student',
]

test('every canonical school role has a complete, role-specific journey', () => {
  assert.deepEqual(platformRoles, expectedRoles)
  assert.deepEqual(Object.keys(onboardingJourneys), expectedRoles)

  for (const role of platformRoles) {
    const journey = getOnboardingJourney(role)
    assert.equal(journey.role, role)
    assert.ok(journey.promise.length > 40)
    assert.equal(journey.steps.length, 6)
    assert.equal(journey.steps.filter((step) => step.actionKey).length, 2)
    assert.equal(journey.steps.filter((step) => step.question).length, 1)
    assert.equal(new Set(journey.steps.map((step) => step.key)).size, journey.steps.length)
    for (const step of journey.steps.filter((item) => item.actionKey)) {
      assert.match(step.target, /^nav-/)
      assert.equal(step.actionKey, `navigate:${step.target.replace('nav-', '')}`)
    }
  }
})

test('readiness requires demonstrated actions and a correct understanding check', () => {
  const journey = getOnboardingJourney('faculty')
  const empty = calculateOnboardingReadiness(journey, { completedStepKeys: [], verifiedActionKeys: [], checkResults: {} })
  assert.deepEqual(empty, { score: 0, status: 'not_started', verified: 0, required: 3 })

  const actions = journey.steps.flatMap((step) => step.actionKey ? [step.actionKey] : [])
  const practiced = calculateOnboardingReadiness(journey, { completedStepKeys: ['welcome'], verifiedActionKeys: actions, checkResults: {} })
  assert.equal(practiced.score, 67)
  assert.equal(practiced.status, 'in_progress')

  const wrong = calculateOnboardingReadiness(journey, { completedStepKeys: ['welcome'], verifiedActionKeys: actions, checkResults: { 'understanding-check': { correct: false, attempts: 1 } } })
  assert.equal(wrong.score, 67)
  assert.equal(wrong.status, 'in_progress')

  const ready = calculateOnboardingReadiness(journey, { completedStepKeys: ['welcome'], verifiedActionKeys: actions, checkResults: { 'understanding-check': { correct: true, attempts: 2 } } })
  assert.deepEqual(ready, { score: 100, status: 'ready', verified: 3, required: 3 })
})

test('onboarding is disconnected from runtime while durable data remains protected', () => {
  const portal = readContractSource('src/features/school/UnifiedPortal.tsx', 'utf8')
  const component = readContractSource('src/features/school/RoleOnboarding.tsx', 'utf8')
  const migration = readContractSource('supabase/migrations/20260717102132_role_onboarding_progress.sql', 'utf8')

  assert.doesNotMatch(portal, /RoleOnboarding/)
  assert.doesNotMatch(portal, /OnboardingActionSignal/)
  assert.doesNotMatch(portal, /signalOnboardingAction/)
  assert.doesNotMatch(portal, /data-onboarding/)
  assert.match(component, /Click the highlighted control/)
  assert.match(component, /Instructions alone do not increase this score/)
  assert.match(component, /Saved to your account/)
  assert.match(migration, /alter table public\.onboarding_progress enable row level security/)
  assert.match(migration, /alter table public\.onboarding_events enable row level security/)
  assert.match(migration, /role = \(select private\.current_role\(\)\)/)
  assert.match(migration, /grant select, insert, update on table public\.onboarding_progress to authenticated/)
  assert.doesNotMatch(migration, /grant[^;]*delete[^;]*on table public\.onboarding_events to authenticated/)
})
