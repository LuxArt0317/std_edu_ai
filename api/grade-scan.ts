import { createHash } from 'node:crypto'
import { verifySupabaseRequest } from '../server/apiAuth.js'

type ApiRequest = { method?: string; body?: unknown; headers: Record<string, string | string[] | undefined>; socket?: { remoteAddress?: string } }
type ApiResponse = { status: (code: number) => ApiResponse; json: (body: unknown) => void; setHeader: (name: string, value: string) => void }
type GradeRow = { studentNumber: string; studentName: string; score: number | null; confidence: number; notes: string }

const allowedRoles = new Set(['owner', 'admin', 'president', 'vice_president', 'dean', 'registrar', 'department_head', 'faculty'])
const requestWindows = new Map<string, number[]>()

function setHeaders(response: ApiResponse) {
  response.setHeader('Cache-Control', 'no-store, max-age=0')
  response.setHeader('Content-Type', 'application/json; charset=utf-8')
  response.setHeader('X-Content-Type-Options', 'nosniff')
  response.setHeader('Referrer-Policy', 'no-referrer')
}

function parseBody(body: unknown) {
  let candidate = body
  if (typeof candidate === 'string') { try { candidate = JSON.parse(candidate) as unknown } catch { return null } }
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return null
  const value = candidate as Record<string, unknown>
  const imageDataUrl = typeof value.imageDataUrl === 'string' ? value.imageDataUrl : ''
  if (!/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(imageDataUrl) || imageDataUrl.length > 10_500_000) return null
  const maxScore = typeof value.maxScore === 'number' && Number.isFinite(value.maxScore) && value.maxScore > 0 && value.maxScore <= 10000 ? value.maxScore : null
  const roster = Array.isArray(value.roster) ? value.roster.slice(0, 150).flatMap((entry) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return []
    const item = entry as Record<string, unknown>
    if (typeof item.studentNumber !== 'string' || typeof item.name !== 'string') return []
    return [{ studentNumber: item.studentNumber.slice(0, 80), name: item.name.slice(0, 160) }]
  }) : []
  if (maxScore === null || roster.length === 0) return null
  return { imageDataUrl, maxScore, roster, title: typeof value.title === 'string' ? value.title.slice(0, 200) : 'Grade sheet' }
}

function isRateLimited(userId: string) {
  const cutoff = Date.now() - 60_000
  const recent = (requestWindows.get(userId) ?? []).filter((value) => value > cutoff)
  recent.push(Date.now())
  requestWindows.set(userId, recent)
  return recent.length > 8
}

function outputText(payload: unknown) {
  if (!payload || typeof payload !== 'object') return ''
  const data = payload as { output?: Array<{ content?: Array<{ text?: string }> }> }
  return data.output?.flatMap((item) => item.content ?? []).map((item) => item.text ?? '').join('').trim() ?? ''
}

function parseOutput(payload: unknown, maxScore: number): { rows: GradeRow[]; warnings: string[]; overallConfidence: number } | null {
  try {
    const value = JSON.parse(outputText(payload)) as Record<string, unknown>
    if (!Array.isArray(value.rows) || !Array.isArray(value.warnings) || typeof value.overallConfidence !== 'number') return null
    let invalidScoreCount = 0
    const rows = value.rows.slice(0, 150).flatMap((entry) => {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return []
      const item = entry as Record<string, unknown>
      if (typeof item.studentNumber !== 'string' || typeof item.studentName !== 'string' || typeof item.confidence !== 'number' || typeof item.notes !== 'string') return []
      const score = typeof item.score === 'number' && Number.isFinite(item.score) && item.score >= 0 && item.score <= maxScore ? item.score : null
      if (item.score !== null && score === null) invalidScoreCount += 1
      return [{ studentNumber: item.studentNumber.slice(0, 80), studentName: item.studentName.slice(0, 160), score, confidence: Math.min(1, Math.max(0, item.confidence)), notes: item.notes.slice(0, 500) }]
    })
    const warnings = value.warnings.filter((item) => typeof item === 'string').slice(0, 19).map((item) => item.slice(0, 500))
    if (invalidScoreCount) warnings.push(`${invalidScoreCount} score${invalidScoreCount === 1 ? '' : 's'} fell outside the allowed range and must be reviewed manually.`)
    return { rows, warnings, overallConfidence: Math.min(1, Math.max(0, value.overallConfidence)) }
  } catch { return null }
}

export default async function handler(request: ApiRequest, response: ApiResponse) {
  setHeaders(response)
  if (request.method !== 'POST') { response.setHeader('Allow', 'POST'); response.status(405).json({ error: 'Method not allowed' }); return }
  const input = parseBody(request.body)
  if (!input) { response.status(400).json({ error: 'A supported grade-sheet image, roster, and maximum score are required.' }); return }
  const auth = await verifySupabaseRequest(request)
  if (auth.ok === false) { response.status(auth.status).json({ error: auth.message }); return }
  if (!allowedRoles.has(auth.user.role)) { response.status(403).json({ error: 'Your role cannot scan or review grades.' }); return }
  if (isRateLimited(auth.user.id)) { response.status(429).json({ error: 'Grade scanning is rate limited. Please wait before trying again.' }); return }
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) { response.status(503).json({ error: 'AI service is not configured.' }); return }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 40_000)
  try {
    const provider = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST', headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: process.env.OPENAI_VISION_MODEL || process.env.OPENAI_MODEL || 'gpt-5.6-terra',
        instructions: 'Extract candidate grade rows from the supplied image. Match only against the supplied roster. Never invent a student or score. Use null for unreadable scores. Confidence is 0 to 1. This output is for mandatory teacher review and must never be treated as a published grade.',
        input: [{ role: 'user', content: [
          { type: 'input_text', text: JSON.stringify({ task: input.title, maximum_score: input.maxScore, approved_roster: input.roster }) },
          { type: 'input_image', image_url: input.imageDataUrl, detail: 'high' },
        ] }],
        reasoning: { effort: 'low' },
        text: { format: { type: 'json_schema', name: 'grade_scan_review', strict: true, schema: {
          type: 'object', additionalProperties: false,
          properties: {
            rows: { type: 'array', maxItems: 150, items: { type: 'object', additionalProperties: false, properties: {
              studentNumber: { type: 'string' }, studentName: { type: 'string' }, score: { type: ['number', 'null'] }, confidence: { type: 'number' }, notes: { type: 'string' },
            }, required: ['studentNumber', 'studentName', 'score', 'confidence', 'notes'] } },
            warnings: { type: 'array', maxItems: 20, items: { type: 'string' } },
            overallConfidence: { type: 'number' },
          }, required: ['rows', 'warnings', 'overallConfidence'],
        } } },
        max_output_tokens: 3_000,
        safety_identifier: createHash('sha256').update(`${process.env.SAFETY_HASH_SALT || 'stu-nexus'}:${auth.user.id}`).digest('hex'),
        store: false,
      }), signal: controller.signal,
    })
    if (!provider.ok) { response.status(provider.status === 429 ? 429 : 502).json({ error: 'Grade scanning is temporarily unavailable.' }); return }
    const result = parseOutput(await provider.json() as unknown, input.maxScore)
    if (!result) { response.status(502).json({ error: 'The grade scan could not be validated.' }); return }
    response.status(200).json({ ...result, requiresHumanReview: true, source: 'openai-vision' })
  } catch (error) {
    const timedOut = error instanceof Error && error.name === 'AbortError'
    response.status(timedOut ? 504 : 502).json({ error: timedOut ? 'Grade scanning timed out.' : 'Grade scanning is temporarily unavailable.' })
  } finally { clearTimeout(timeout) }
}
