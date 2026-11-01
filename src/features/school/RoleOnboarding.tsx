import { Button } from '@/components/ui/button'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import type { Json } from '../../types/database.generated.ts'
import {
  calculateOnboardingReadiness,
  getOnboardingJourney,
  type OnboardingCheckResult,
  type OnboardingStep,
} from './onboarding'
import {
  appendOnboardingEvent,
  loadOrCreateOnboardingProgress,
  saveOnboardingProgress,
  type OnboardingEventType,
  type OnboardingProgress,
} from './onboardingRepository'
import type { PlatformRole } from './types'

export type OnboardingActionSignal = { key: string; nonce: number } | null

type PendingEvent = { stepKey: string; type: OnboardingEventType; data?: Record<string, Json> }

type RoleOnboardingProps = {
  userId: string
  role: PlatformRole
  actionSignal: OnboardingActionSignal
  onRevealTarget: (target: string) => void
}

type SpotlightRect = { top: number; left: number; right: number; bottom: number; width: number; height: number }

const SPOTLIGHT_PAD = 7

function mergeUnique(values: string[], value: string) {
  return values.includes(value) ? values : [...values, value]
}

function findStepIndex(steps: OnboardingStep[], stepKey: string) {
  const index = steps.findIndex((step) => step.key === stepKey)
  return index >= 0 ? index : 0
}

function readinessLabel(status: OnboardingProgress['status']) {
  if (status === 'ready') return 'Ready'
  if (status === 'in_progress') return 'Practicing'
  return 'Explore'
}

export default function RoleOnboarding({ userId, role, actionSignal, onRevealTarget }: RoleOnboardingProps) {
  const journey = useMemo(() => getOnboardingJourney(role), [role])
  const [progress, setProgress] = useState<OnboardingProgress | null>(null)
  const [loadingError, setLoadingError] = useState('')
  const [syncError, setSyncError] = useState('')
  const [centerOpen, setCenterOpen] = useState(false)
  const [tourOpen, setTourOpen] = useState(false)
  const [spotlight, setSpotlight] = useState<SpotlightRect | null>(null)
  const [answerState, setAnswerState] = useState<{ selected: number; correct: boolean } | null>(null)
  const [busy, setBusy] = useState(false)
  const persistQueue = useRef<Promise<void>>(Promise.resolve())
  const viewedSteps = useRef(new Set<string>())
  const autoStarted = useRef(false)
  const progressRef = useRef<OnboardingProgress | null>(null)

  useEffect(() => { progressRef.current = progress }, [progress])

  const queuePersistence = useCallback((next: OnboardingProgress, events: PendingEvent[] = []) => {
    persistQueue.current = persistQueue.current.then(async () => {
      try {
        const saved = await saveOnboardingProgress(next)
        for (const event of events) {
          await appendOnboardingEvent(saved, event.stepKey, event.type, event.data)
        }
        setSyncError('')
      } catch (error) {
        setSyncError(error instanceof Error ? error.message : 'Progress could not be synchronized.')
      }
    })
  }, [])

  const loadProgress = useCallback(async () => {
    setLoadingError('')
    try {
      const loaded = await loadOrCreateOnboardingProgress(userId, role)
      setProgress(loaded)
    } catch (error) {
      setLoadingError(error instanceof Error ? error.message : 'Your readiness journey could not be loaded.')
    }
  }, [role, userId])

  useEffect(() => {
    setProgress(null)
    setTourOpen(false)
    setCenterOpen(false)
    setAnswerState(null)
    viewedSteps.current.clear()
    autoStarted.current = false
    void loadProgress()
  }, [loadProgress])

  const currentStepIndex = progress ? findStepIndex(journey.steps, progress.currentStepKey) : 0
  const currentStep = journey.steps[currentStepIndex]
  const evidence = progress ? {
    completedStepKeys: progress.completedStepKeys,
    verifiedActionKeys: progress.verifiedActionKeys,
    checkResults: progress.checkResults,
  } : { completedStepKeys: [], verifiedActionKeys: [], checkResults: {} }
  const readiness = calculateOnboardingReadiness(journey, evidence)

  const startTour = useCallback((source: 'auto' | 'center' = 'center') => {
    const current = progressRef.current
    if (!current) return
    const now = new Date().toISOString()
    const firstIncomplete = journey.steps.find((step) => !current.completedStepKeys.includes(step.key)) ?? journey.steps[0]
    const next: OnboardingProgress = {
      ...current,
      currentStepKey: current.status === 'ready' ? journey.steps[0].key : firstIncomplete.key,
      status: current.status === 'not_started' ? 'in_progress' : current.status,
      startedAt: current.startedAt ?? now,
      lastSeenAt: now,
    }
    setProgress(next)
    setCenterOpen(false)
    setAnswerState(null)
    setTourOpen(true)
    queuePersistence(next, [{ stepKey: next.currentStepKey, type: 'journey_started', data: { source } }])
  }, [journey.steps, queuePersistence])

  useEffect(() => {
    if (!progress || progress.status === 'ready' || autoStarted.current) return
    autoStarted.current = true
    const timer = window.setTimeout(() => startTour('auto'), 900)
    return () => window.clearTimeout(timer)
  }, [progress, startTour])

  const completeCurrentStep = useCallback((event?: PendingEvent) => {
    const current = progressRef.current
    if (!current || busy) return
    setBusy(true)
    const index = findStepIndex(journey.steps, current.currentStepKey)
    const step = journey.steps[index]
    const completedStepKeys = mergeUnique(current.completedStepKeys, step.key)
    const verifiedActionKeys = step.actionKey ? mergeUnique(current.verifiedActionKeys, step.actionKey) : current.verifiedActionKeys
    const nextIndex = Math.min(index + 1, journey.steps.length - 1)
    const readinessResult = calculateOnboardingReadiness(journey, {
      completedStepKeys,
      verifiedActionKeys,
      checkResults: current.checkResults,
    })
    const now = new Date().toISOString()
    const next: OnboardingProgress = {
      ...current,
      currentStepKey: journey.steps[nextIndex].key,
      completedStepKeys,
      verifiedActionKeys,
      understandingScore: readinessResult.score,
      status: readinessResult.status === 'not_started' ? 'in_progress' : readinessResult.status,
      completedAt: readinessResult.status === 'ready' ? current.completedAt ?? now : null,
      lastSeenAt: now,
    }
    setProgress(next)
    setAnswerState(null)
    const events: PendingEvent[] = []
    if (event) events.push(event)
    events.push({ stepKey: step.key, type: 'step_completed' })
    queuePersistence(next, events)
    window.setTimeout(() => setBusy(false), 180)
  }, [busy, journey, queuePersistence])

  useEffect(() => {
    if (!tourOpen || !actionSignal || !currentStep?.actionKey || actionSignal.key !== currentStep.actionKey) return
    if (progress?.verifiedActionKeys.includes(currentStep.actionKey)) return
    completeCurrentStep({ stepKey: currentStep.key, type: 'action_verified', data: { actionKey: actionSignal.key } })
  }, [actionSignal, completeCurrentStep, currentStep, progress?.verifiedActionKeys, tourOpen])

  const submitAnswer = (selected: number) => {
    const current = progressRef.current
    const step = currentStep
    if (!current || !step.question || busy) return
    const previous = current.checkResults[step.key]
    const correct = selected === step.question.correctIndex
    const result: OnboardingCheckResult = { correct, attempts: (previous?.attempts ?? 0) + 1 }
    const checkResults = { ...current.checkResults, [step.key]: result }
    const readinessResult = calculateOnboardingReadiness(journey, {
      completedStepKeys: current.completedStepKeys,
      verifiedActionKeys: current.verifiedActionKeys,
      checkResults,
    })
    const now = new Date().toISOString()
    const next: OnboardingProgress = {
      ...current,
      checkResults,
      understandingScore: readinessResult.score,
      status: readinessResult.status === 'not_started' ? 'in_progress' : readinessResult.status,
      completedAt: readinessResult.status === 'ready' ? current.completedAt ?? now : null,
      lastSeenAt: now,
    }
    setProgress(next)
    setAnswerState({ selected, correct })
    queuePersistence(next, [{
      stepKey: step.key,
      type: 'answer_submitted',
      data: { selectedIndex: selected, correct, attempt: result.attempts },
    }])
  }

  const finishTour = () => {
    const current = progressRef.current
    if (!current) return
    const step = currentStep
    const completedStepKeys = mergeUnique(current.completedStepKeys, step.key)
    const now = new Date().toISOString()
    const next: OnboardingProgress = {
      ...current,
      completedStepKeys,
      status: 'ready',
      understandingScore: 100,
      completedAt: current.completedAt ?? now,
      lastSeenAt: now,
    }
    setProgress(next)
    setTourOpen(false)
    setCenterOpen(true)
    queuePersistence(next, [
      { stepKey: step.key, type: 'step_completed' },
      { stepKey: step.key, type: 'journey_completed', data: { score: 100 } },
    ])
  }

  const restartJourney = () => {
    const current = progressRef.current
    if (!current) return
    const now = new Date().toISOString()
    const next: OnboardingProgress = {
      ...current,
      currentStepKey: journey.steps[0].key,
      completedStepKeys: [],
      verifiedActionKeys: [],
      checkResults: {},
      understandingScore: 0,
      status: 'in_progress',
      startedAt: now,
      completedAt: null,
      lastSeenAt: now,
    }
    setProgress(next)
    setCenterOpen(false)
    setAnswerState(null)
    setTourOpen(true)
    queuePersistence(next, [{ stepKey: next.currentStepKey, type: 'journey_restarted' }])
  }

  useEffect(() => {
    if (!tourOpen || !currentStep) return
    onRevealTarget(currentStep.target)
    if (!progress || viewedSteps.current.has(currentStep.key)) return
    viewedSteps.current.add(currentStep.key)
    queuePersistence(progress, [{ stepKey: currentStep.key, type: 'step_viewed', data: { target: currentStep.target } }])
  }, [currentStep, onRevealTarget, progress, queuePersistence, tourOpen])

  useEffect(() => {
    if (!tourOpen || !currentStep) { setSpotlight(null); return }
    let attempts = 0
    let timer = 0
    const update = () => {
      const target = document.querySelector<HTMLElement>(`[data-onboarding="${currentStep.target}"]`)
      if (!target) {
        setSpotlight(null)
        if (attempts < 20) { attempts += 1; timer = window.setTimeout(update, 100) }
        return
      }
      const rect = target.getBoundingClientRect()
      setSpotlight({
        top: Math.max(0, rect.top - SPOTLIGHT_PAD),
        left: Math.max(0, rect.left - SPOTLIGHT_PAD),
        right: Math.min(window.innerWidth, rect.right + SPOTLIGHT_PAD),
        bottom: Math.min(window.innerHeight, rect.bottom + SPOTLIGHT_PAD),
        width: rect.width + SPOTLIGHT_PAD * 2,
        height: rect.height + SPOTLIGHT_PAD * 2,
      })
    }
    const frame = window.requestAnimationFrame(update)
    window.addEventListener('resize', update)
    window.addEventListener('scroll', update, true)
    return () => {
      window.cancelAnimationFrame(frame)
      window.clearTimeout(timer)
      window.removeEventListener('resize', update)
      window.removeEventListener('scroll', update, true)
    }
  }, [currentStep, tourOpen])

  const retrySync = () => {
    const current = progressRef.current
    if (!current) { void loadProgress(); return }
    setSyncError('')
    queuePersistence(current)
  }

  const calloutStyle = useMemo<CSSProperties>(() => {
    if (!spotlight) return { left: '50%', top: '50%', transform: 'translate(-50%, -50%)' }
    const width = Math.min(420, window.innerWidth - 32)
    const left = Math.max(16, Math.min(window.innerWidth - width - 16, spotlight.left + spotlight.width / 2 - width / 2))
    if ((currentStep.placement === 'top' || spotlight.bottom > window.innerHeight * 0.62) && spotlight.top > 250) {
      return { width, left, bottom: window.innerHeight - spotlight.top + 18 }
    }
    return { width, left, top: spotlight.bottom + 18 }
  }, [currentStep?.placement, spotlight])

  const actionAlreadyVerified = Boolean(currentStep?.actionKey && progress?.verifiedActionKeys.includes(currentStep.actionKey))
  const currentCheck = currentStep?.question ? progress?.checkResults[currentStep.key] : null

  return <>
    <Button
      type="button"
      className={`onboarding-trigger ${progress?.status === 'ready' ? 'ready' : ''}`}
      data-onboarding="onboarding-center"
      onClick={() => setCenterOpen(true)}
      aria-label="Open role readiness center"
    >
      <span style={{ '--readiness': `${readiness.score * 3.6}deg` } as CSSProperties}><i>{progress ? readiness.score : '…'}</i></span>
      <b>Readiness<small>{progress ? readinessLabel(progress.status) : 'Loading'}</small></b>
    </Button>

    {centerOpen ? <div className="onboarding-center-layer" role="dialog" aria-modal="true" aria-labelledby="readiness-title">
      <Button type="button" className="onboarding-center-backdrop" aria-label="Close readiness center" onClick={() => setCenterOpen(false)} variant="ghost" />
      <section className="onboarding-center-card">
        <header><div><span>ROLE READINESS CENTER</span><h2 id="readiness-title">{journey.roleName} foundations</h2><p>{journey.promise}</p></div><Button type="button" onClick={() => setCenterOpen(false)}>×</Button></header>
        <div className="onboarding-scoreboard">
          <div className={`onboarding-score ${progress?.status === 'ready' ? 'ready' : ''}`} style={{ '--readiness': `${readiness.score * 3.6}deg` } as CSSProperties}><span><b>{readiness.score}</b><small>/ 100</small></span></div>
          <div><span>{progress?.status === 'ready' ? 'ROLE FOUNDATIONS VERIFIED' : 'YOUR CURRENT READINESS'}</span><h3>{readinessLabel(progress?.status ?? 'not_started')}</h3><p>{readiness.verified} of {readiness.required} demonstrated actions and checks verified. Instructions alone do not increase this score.</p></div>
        </div>
        {loadingError ? <div className="onboarding-sync-warning"><b>Progress is unavailable</b><span>{loadingError}</span><Button type="button" onClick={() => void loadProgress()}>Try again</Button></div> : null}
        {syncError ? <div className="onboarding-sync-warning"><b>Changes are waiting to sync</b><span>{syncError}</span><Button type="button" onClick={retrySync}>Retry now</Button></div> : null}
        <div className="onboarding-step-list">{journey.steps.filter((step) => step.key !== 'complete').map((step, index) => {
          const complete = progress?.completedStepKeys.includes(step.key) || (step.actionKey ? progress?.verifiedActionKeys.includes(step.actionKey) : false) || (step.question ? progress?.checkResults[step.key]?.correct : false)
          return <div key={step.key} className={complete ? 'complete' : progress?.currentStepKey === step.key ? 'current' : ''}><span>{complete ? '✓' : index + 1}</span><p><b>{step.title}</b><small>{step.actionKey ? 'Real interface action' : step.question ? 'Understanding check' : 'Guided instruction'}</small></p><i>{complete ? 'Verified' : progress?.currentStepKey === step.key ? 'Current' : 'Ahead'}</i></div>
        })}</div>
        <footer><div><span className={syncError ? 'syncing' : 'synced'}>{syncError ? '● Sync needed' : '● Saved to your account'}</span><small>Readiness guides use; Supabase RLS controls access.</small></div>{progress?.status === 'ready' ? <><Button type="button" className="onboarding-secondary" onClick={restartJourney}>Restart journey</Button><Button type="button" className="onboarding-primary" onClick={() => startTour('center')}>Review guide</Button></> : <Button type="button" className="onboarding-primary" disabled={!progress} onClick={() => startTour('center')}>{progress?.status === 'in_progress' ? 'Continue guided tour →' : 'Start guided tour →'}</Button>}</footer>
      </section>
    </div> : null}

    {tourOpen && progress && currentStep ? <div className="onboarding-tour" aria-live="polite">
      {spotlight ? <>
        <div className="onboarding-mask top" style={{ height: spotlight.top }} />
        <div className="onboarding-mask left" style={{ top: spotlight.top, width: spotlight.left, height: spotlight.height }} />
        <div className="onboarding-mask right" style={{ top: spotlight.top, left: spotlight.right, height: spotlight.height }} />
        <div className="onboarding-mask bottom" style={{ top: spotlight.bottom }} />
        {!currentStep.actionKey || actionAlreadyVerified ? <div className="onboarding-target-blocker" style={{ top: spotlight.top, left: spotlight.left, width: spotlight.width, height: spotlight.height }} /> : null}
        <div className="onboarding-focus-ring" style={{ top: spotlight.top, left: spotlight.left, width: spotlight.width, height: spotlight.height }} />
      </> : <div className="onboarding-mask full" />}
      <section className="onboarding-callout" style={calloutStyle} role="dialog" aria-modal="true" aria-labelledby="onboarding-step-title">
        <div className="onboarding-callout-progress"><span style={{ width: `${((currentStepIndex + 1) / journey.steps.length) * 100}%` }} /></div>
        <header><span>{currentStep.eyebrow}</span><Button type="button" onClick={() => setTourOpen(false)}>Pause</Button></header>
        <h2 id="onboarding-step-title">{currentStep.title}</h2>
        <p>{currentStep.description}</p>
        {currentStep.actionKey && !actionAlreadyVerified ? <div className="onboarding-action-prompt"><span>↖</span><b>Click the highlighted control</b><small>The guide continues only after it detects that real action.</small></div> : null}
        {currentStep.question ? <div className="onboarding-question"><h3>{currentStep.question.prompt}</h3>{currentStep.question.options.map((option, index) => <Button key={option} type="button" className={answerState?.selected === index ? answerState.correct ? 'correct' : 'incorrect' : ''} onClick={() => submitAnswer(index)} disabled={answerState?.correct}><span>{String.fromCharCode(65 + index)}</span>{option}</Button>)}{answerState ? <div className={answerState.correct ? 'answer-feedback correct' : 'answer-feedback incorrect'}><b>{answerState.correct ? '✓ Correct—well judged.' : 'Try again.'}</b><p>{currentStep.question.explanation}</p></div> : currentCheck?.correct ? <div className="answer-feedback correct"><b>✓ Previously verified</b><p>{currentStep.question.explanation}</p></div> : null}</div> : null}
        <footer><small>Step {currentStepIndex + 1} of {journey.steps.length} · {journey.roleName}</small>{currentStep.key === 'complete' ? <Button type="button" onClick={finishTour}>Finish & view readiness →</Button> : currentStep.question ? <Button type="button" disabled={!(answerState?.correct || currentCheck?.correct)} onClick={() => completeCurrentStep()}>Continue →</Button> : currentStep.actionKey && !actionAlreadyVerified ? null : <Button type="button" onClick={() => completeCurrentStep()}>{actionAlreadyVerified ? 'Continue →' : 'Next →'}</Button>}</footer>
      </section>
    </div> : null}
  </>
}
