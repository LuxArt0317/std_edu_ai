import { createHash } from 'node:crypto'

type ApiRequest = {
  method?: string
  body?: unknown
  headers: Record<string, string | string[] | undefined>
  socket?: { remoteAddress?: string }
}

type ApiResponse = {
  status: (code: number) => ApiResponse
  json: (body: unknown) => void
  setHeader: (name: string, value: string) => void
}

type AssistantRequest = {
  message: string
  mode: 'answer' | 'brief' | 'draft'
  context?: unknown
}

type AssistantPayload = {
  answer: string
  actions: string[]
  citations: string[]
}

const allowedContextFields = [
  'studentRef', 'program', 'yearLevel', 'gpa', 'attendance', 'engagement',
  'hasBalance', 'riskScore', 'riskLevel', 'nextAction',
] as const

const requestWindows = new Map<string, number[]>()
const MAX_REQUESTS_PER_MINUTE = 20
const MAX_MESSAGE_LENGTH = 2_000

function getClientAddress(request: ApiRequest) {
  const forwarded = request.headers['x-forwarded-for']
  const firstForwarded = Array.isArray(forwarded) ? forwarded[0] : forwarded?.split(',')[0]
  return firstForwarded?.trim() || request.socket?.remoteAddress || 'unknown'
}

function isRateLimited(identifier: string) {
  const now = Date.now()
  const start = now - 60_000
  if (requestWindows.size > 10_000) {
    for (const [key, timestamps] of requestWindows) {
      if (!timestamps.some((timestamp) => timestamp > start)) requestWindows.delete(key)
    }
  }
  const active = (requestWindows.get(identifier) ?? []).filter((timestamp) => timestamp > start)
  active.push(now)
  requestWindows.set(identifier, active)
  return active.length > MAX_REQUESTS_PER_MINUTE
}

function sanitizeContext(context: unknown) {
  if (!context || typeof context !== 'object' || Array.isArray(context)) return undefined
  const source = context as Record<string, unknown>
  const safe: Record<string, unknown> = {}
  for (const field of allowedContextFields) {
    const value = source[field]
    if (typeof value === 'string') safe[field] = value.trim().slice(0, 500)
    else if (typeof value === 'number' && Number.isFinite(value)) safe[field] = value
    else if (typeof value === 'boolean') safe[field] = value
  }

  if (Array.isArray(source.signals)) {
    safe.signals = source.signals.slice(0, 12).flatMap((signal) => {
      if (!signal || typeof signal !== 'object' || Array.isArray(signal)) return []
      const item = signal as Record<string, unknown>
      return [{
        label: typeof item.label === 'string' ? item.label.slice(0, 160) : '',
        detail: typeof item.detail === 'string' ? item.detail.slice(0, 500) : '',
        tone: typeof item.tone === 'string' ? item.tone.slice(0, 40) : '',
      }]
    })
  }
  return safe
}

function parseRequestBody(body: unknown): AssistantRequest | null {
  let candidate = body
  if (typeof body === 'string') {
    try {
      candidate = JSON.parse(body) as unknown
    } catch {
      return null
    }
  }
  if (!candidate || typeof candidate !== 'object') return null
  const value = candidate as Record<string, unknown>
  const message = typeof value.message === 'string' ? value.message.trim() : ''
  const mode = value.mode
  if (!message || message.length > MAX_MESSAGE_LENGTH) return null
  if (mode !== 'answer' && mode !== 'brief' && mode !== 'draft') return null
  return { message, mode, context: sanitizeContext(value.context) }
}

function getOutputText(payload: unknown) {
  if (!payload || typeof payload !== 'object') return ''
  const response = payload as { output?: Array<{ content?: Array<{ text?: string }> }> }
  return response.output
    ?.flatMap((item) => item.content ?? [])
    .map((item) => item.text ?? '')
    .join('')
    .trim() ?? ''
}

function validateAssistantPayload(value: unknown): AssistantPayload | null {
  if (!value || typeof value !== 'object') return null
  const payload = value as Record<string, unknown>
  if (typeof payload.answer !== 'string' || !payload.answer.trim()) return null
  if (!Array.isArray(payload.actions) || !payload.actions.every((item) => typeof item === 'string')) return null
  if (!Array.isArray(payload.citations) || !payload.citations.every((item) => typeof item === 'string')) return null
  return {
    answer: payload.answer.trim().slice(0, 5_000),
    actions: payload.actions.slice(0, 5).map((item) => item.slice(0, 500)),
    citations: payload.citations.slice(0, 8).map((item) => item.slice(0, 300)),
  }
}

function parseAssistantPayload(payload: unknown): AssistantPayload | null {
  const outputText = getOutputText(payload)
  if (!outputText) return null
  try {
    return validateAssistantPayload(JSON.parse(outputText) as unknown)
  } catch {
    return null
  }
}

function setResponseHeaders(response: ApiResponse) {
  response.setHeader('Cache-Control', 'no-store, max-age=0')
  response.setHeader('Content-Type', 'application/json; charset=utf-8')
  response.setHeader('X-Content-Type-Options', 'nosniff')
  response.setHeader('Referrer-Policy', 'no-referrer')
}

export default async function handler(request: ApiRequest, response: ApiResponse) {
  setResponseHeaders(response)
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST')
    response.status(405).json({ error: 'Method not allowed' })
    return
  }

  const clientAddress = getClientAddress(request)
  if (isRateLimited(clientAddress)) {
    response.status(429).json({ error: 'Too many requests. Please wait a moment and try again.' })
    return
  }

  const input = parseRequestBody(request.body)
  if (!input) {
    response.status(400).json({ error: 'A valid message and assistant mode are required.' })
    return
  }

  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    response.status(503).json({ error: 'AI service is not configured.' })
    return
  }

  const safetyIdentifier = createHash('sha256')
    .update(`${process.env.SAFETY_HASH_SALT || 'stu-nexus'}:${clientAddress}`)
    .digest('hex')

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 25_000)

  try {
    const openAiResponse = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || 'gpt-5.6-terra',
        instructions: [
          'You are STU Nexus, a staff-facing student-success copilot for Shu-Te University.',
          'Use only the de-identified CRM evidence supplied in the request. Never invent policy, facts, diagnoses, or student details.',
          'Be empathetic, concise, culturally respectful, and action oriented. Staff must review every recommendation before acting.',
          'For high-risk or wellbeing signals, recommend timely human follow-up and escalation through university protocol.',
          'Return JSON that exactly matches the provided schema. Citations must name evidence fields or knowledge items present in the input.',
        ].join(' '),
        input: JSON.stringify({ task: input.message, mode: input.mode, deidentified_context: input.context ?? null }),
        reasoning: { effort: 'low' },
        text: {
          verbosity: 'medium',
          format: {
            type: 'json_schema',
            name: 'student_success_response',
            strict: true,
            schema: {
              type: 'object',
              additionalProperties: false,
              properties: {
                answer: { type: 'string' },
                actions: { type: 'array', minItems: 1, maxItems: 5, items: { type: 'string' } },
                citations: { type: 'array', minItems: 1, maxItems: 8, items: { type: 'string' } },
              },
              required: ['answer', 'actions', 'citations'],
            },
          },
        },
        max_output_tokens: 1_000,
        safety_identifier: safetyIdentifier,
      }),
      signal: controller.signal,
    })

    if (!openAiResponse.ok) {
      response.status(openAiResponse.status === 429 ? 429 : 502).json({ error: 'AI service is temporarily unavailable.' })
      return
    }

    const result = parseAssistantPayload(await openAiResponse.json() as unknown)
    if (!result) {
      response.status(502).json({ error: 'AI service returned an invalid response.' })
      return
    }

    response.status(200).json({ ...result, source: 'openai' })
  } catch (error) {
    const timedOut = error instanceof Error && error.name === 'AbortError'
    response.status(timedOut ? 504 : 502).json({ error: timedOut ? 'AI request timed out.' : 'AI service is temporarily unavailable.' })
  } finally {
    clearTimeout(timeout)
  }
}
