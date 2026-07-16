import type { AiCopilotResult, Student } from './types'

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

export async function askCrmCopilot(message: string, mode: CopilotMode, student?: Student): Promise<AiCopilotResult> {
  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), 30_000)

  try {
    const response = await fetch('/api/crm-assistant', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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

    if (!response.ok) return fallbackResult(message, student)
    const data = await response.json() as AiCopilotResult
    if (!data.answer || !Array.isArray(data.actions)) return fallbackResult(message, student)
    return { ...data, source: 'openai' }
  } catch {
    return fallbackResult(message, student)
  } finally {
    window.clearTimeout(timeout)
  }
}
