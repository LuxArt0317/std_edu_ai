import type { AiCopilotResult, Student } from './types'
import { supabase } from '../../utils/supabase'

type CopilotMode = 'brief' | 'answer' | 'draft'

function fallbackResult(message: string, student?: Student): AiCopilotResult {
  const context = student
    ? `${student.name} currently has a ${student.riskLevel} risk level (${student.riskScore}/100). ${student.nextAction}.`
    : 'The current workspace has two high-priority student interventions and one urgent financial-aid case.'

  return {
    answer: `${context} Based on the available verified CRM signals, prioritize a personal, supportive outreach that confirms the student’s immediate blocker and connects them to the responsible office. The message should avoid assumptions and offer one clear next step.`,
    actions: student
      ? [student.nextAction, 'Document the outcome in the student timeline', 'Schedule a 48-hour follow-up if there is no response']
      : ['Review the critical-risk queue', 'Resolve registration blockers before outreach campaigns', `Use “${message.slice(0, 42)}” as the working brief`],
    citations: student ? ['Student 360 profile', 'Active risk signals', 'Open case history'] : ['Success Radar', 'Case queue', 'Today’s task list'],
    source: 'local-fallback',
  }
}

async function recordAiAudit(mode: CopilotMode, result: AiCopilotResult, startedAt: number, student?: Student) {
  if (!supabase) return
  try {
    const { data } = await supabase.auth.getUser()
    if (!data.user) return
    await supabase.from('ai_audit_logs').insert({
      user_id: data.user.id,
      student_id: student?.id && /^[0-9a-f-]{36}$/i.test(student.id) ? student.id : null,
      use_case: mode,
      model: result.source === 'openai' ? 'openai-responses' : 'local-continuity',
      context_fields: student ? ['program', 'yearLevel', 'gpa', 'attendance', 'engagement', 'hasBalance', 'riskScore', 'riskLevel', 'signals', 'nextAction'] : [],
      output_citations: result.citations,
      outcome: result.source === 'openai' ? 'success' : 'fallback',
      latency_ms: Math.max(0, Date.now() - startedAt),
    })
  } catch {
    // AI assistance remains available if privacy-minimized telemetry is interrupted.
  }
}

export async function askCrmCopilot(message: string, mode: CopilotMode, student?: Student): Promise<AiCopilotResult> {
  const startedAt = Date.now()
  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), 30_000)

  try {
    if (!supabase) throw new Error('Supabase is required for Nexus AI.')
    const { data: sessionData } = await supabase.auth.getSession()
    const accessToken = sessionData.session?.access_token
    if (!accessToken) throw new Error('An authenticated session is required for Nexus AI.')
    const response = await fetch('/api/crm-assistant', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({
        message,
        mode,
        context: student
          ? {
              studentRef: student.initials,
              program: student.program,
              yearLevel: student.yearLevel,
              gpa: student.gpa,
              attendance: student.attendance,
              engagement: student.engagement,
              hasBalance: student.balance > 0,
              riskScore: student.riskScore,
              riskLevel: student.riskLevel,
              signals: student.signals.map(({ label, detail, tone }) => ({ label, detail, tone })),
              nextAction: student.nextAction,
            }
          : undefined,
      }),
      signal: controller.signal,
    })

    if (!response.ok) {
      const fallback = fallbackResult(message, student)
      await recordAiAudit(mode, fallback, startedAt, student)
      return fallback
    }
    const data = await response.json() as AiCopilotResult
    if (!data.answer || !Array.isArray(data.actions)) {
      const fallback = fallbackResult(message, student)
      await recordAiAudit(mode, fallback, startedAt, student)
      return fallback
    }
    const result = { ...data, source: 'openai' as const }
    await recordAiAudit(mode, result, startedAt, student)
    return result
  } catch {
    const fallback = fallbackResult(message, student)
    await recordAiAudit(mode, fallback, startedAt, student)
    return fallback
  } finally {
    window.clearTimeout(timeout)
  }
}
