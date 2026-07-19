type AssistantResponse = {
  answer: string
  status: 'answered' | 'clarification' | 'abstained' | 'handoff'
  citations: Array<{
    chunkId: string
    claim: string
    title: string
    sourceName: string
    url: string
    locator: string | null
    effectiveAt: string | null
    reviewedAt: string | null
  }>
  suggestedQuestions: string[]
}

export async function askCampusAssistant(question: string): Promise<AssistantResponse> {
  const normalizedQuestion = question.trim()
  if (!normalizedQuestion) {
    throw new Error('Please enter a question before sending it to the assistant.')
  }
  const response = await fetch('/api/research-assistant', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question: normalizedQuestion, consentedResearchUse: false }),
  })
  const payload = await response.json().catch(() => null) as (Partial<AssistantResponse> & { error?: string }) | null
  if (!response.ok) throw new Error(payload?.error || 'AI 助理目前暫時無法回應。')
  if (!payload || typeof payload.answer !== 'string' || !['answered', 'clarification', 'abstained', 'handoff'].includes(String(payload.status)) || !Array.isArray(payload.citations)) {
    throw new Error('AI 助理收到無效的回應，請稍後再試。')
  }
  return payload as AssistantResponse
}
