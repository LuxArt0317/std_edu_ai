import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import schoolHandler from '../../api/school-assistant.ts'
import gradeScanHandler from '../../api/grade-scan.ts'

type Captured = { statusCode: number; body: unknown; headers: Record<string, string> }
const originalFetch = globalThis.fetch
const originalEnvironment = {
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  VITE_SUPABASE_URL: process.env.VITE_SUPABASE_URL,
  VITE_SUPABASE_PUBLISHABLE_KEY: process.env.VITE_SUPABASE_PUBLISHABLE_KEY,
}

after(() => {
  globalThis.fetch = originalFetch
  for (const [key, value] of Object.entries(originalEnvironment)) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
})

function responseCapture() {
  const captured: Captured = { statusCode: 200, body: null, headers: {} }
  const response = {
    status(code: number) { captured.statusCode = code; return response },
    json(body: unknown) { captured.body = body },
    setHeader(name: string, value: string) { captured.headers[name] = value },
  }
  return { captured, response }
}

function configure() {
  process.env.OPENAI_API_KEY = 'test-openai-key'
  process.env.VITE_SUPABASE_URL = 'https://test.supabase.co'
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_test'
}

test('school assistant rejects unauthenticated requests', async () => {
  configure()
  const { captured, response } = responseCapture()
  await schoolHandler({ method: 'POST', body: { message: 'Help me plan today' }, headers: {}, socket: {} }, response)
  assert.equal(captured.statusCode, 401)
})

test('school assistant uses the trusted Supabase role and returns structured output', async () => {
  configure()
  globalThis.fetch = async (input, init) => {
    if (String(input).includes('/auth/v1/user')) return new Response(JSON.stringify({ id: 'student-1', email: 'student@example.test', app_metadata: { role: 'student' } }), { status: 200 })
    const body = JSON.parse(String(init?.body)) as { instructions: string }
    assert.match(body.instructions, /Do not complete graded work/)
    return new Response(JSON.stringify({ output: [{ content: [{ text: JSON.stringify({ answer: 'Start with the published topic, then try the quiz.', suggestedActions: ['Open IM101'], citations: ['IM101'] }) }] }] }), { status: 200 })
  }
  const { captured, response } = responseCapture()
  await schoolHandler({ method: 'POST', body: { message: 'What should I study?', history: [], context: { courseCodes: ['IM101'] } }, headers: { authorization: 'Bearer authenticated-test-session-token' }, socket: {} }, response)
  assert.equal(captured.statusCode, 200)
  assert.deepEqual(captured.body, { answer: 'Start with the published topic, then try the quiz.', suggestedActions: ['Open IM101'], citations: ['IM101'], source: 'openai' })
})

test('grade scan refuses student roles before contacting OpenAI vision', async () => {
  configure()
  globalThis.fetch = async (input) => {
    assert.match(String(input), /auth\/v1\/user/)
    return new Response(JSON.stringify({ id: 'student-1', app_metadata: { role: 'student' } }), { status: 200 })
  }
  const { captured, response } = responseCapture()
  await gradeScanHandler({ method: 'POST', body: { imageDataUrl: 'data:image/png;base64,QUJD', maxScore: 100, roster: [{ studentNumber: 'S1', name: 'Student' }] }, headers: { authorization: 'Bearer authenticated-test-session-token' }, socket: {} }, response)
  assert.equal(captured.statusCode, 403)
})

test('grade scan returns review-only structured candidates for faculty', async () => {
  configure()
  globalThis.fetch = async (input) => {
    if (String(input).includes('/auth/v1/user')) return new Response(JSON.stringify({ id: 'teacher-1', app_metadata: { role: 'faculty' } }), { status: 200 })
    return new Response(JSON.stringify({ output: [{ content: [{ text: JSON.stringify({ rows: [{ studentNumber: 'S1', studentName: 'Student', score: 88, confidence: .96, notes: 'Clearly visible' }], warnings: [], overallConfidence: .96 }) }] }] }), { status: 200 })
  }
  const { captured, response } = responseCapture()
  await gradeScanHandler({ method: 'POST', body: { imageDataUrl: 'data:image/png;base64,QUJD', title: 'Quiz', maxScore: 100, roster: [{ studentNumber: 'S1', name: 'Student' }] }, headers: { authorization: 'Bearer authenticated-faculty-session' }, socket: {} }, response)
  assert.equal(captured.statusCode, 200)
  assert.deepEqual(captured.body, { rows: [{ studentNumber: 'S1', studentName: 'Student', score: 88, confidence: .96, notes: 'Clearly visible' }], warnings: [], overallConfidence: .96, requiresHumanReview: true, source: 'openai-vision' })
})

test('grade scan quarantines scores outside the grade item range', async () => {
  configure()
  globalThis.fetch = async (input) => {
    if (String(input).includes('/auth/v1/user')) return new Response(JSON.stringify({ id: 'teacher-1', app_metadata: { role: 'faculty' } }), { status: 200 })
    return new Response(JSON.stringify({ output: [{ content: [{ text: JSON.stringify({ rows: [{ studentNumber: 'S1', studentName: 'Student', score: 120, confidence: .99, notes: 'OCR result' }], warnings: [], overallConfidence: .99 }) }] }] }), { status: 200 })
  }
  const { captured, response } = responseCapture()
  await gradeScanHandler({ method: 'POST', body: { imageDataUrl: 'data:image/png;base64,QUJD', title: 'Quiz', maxScore: 100, roster: [{ studentNumber: 'S1', name: 'Student' }] }, headers: { authorization: 'Bearer authenticated-faculty-session' }, socket: {} }, response)
  assert.equal(captured.statusCode, 200)
  const body = captured.body as { rows: Array<{ score: number | null }>; warnings: string[] }
  assert.equal(body.rows[0]?.score, null)
  assert.match(body.warnings[0] ?? '', /outside the allowed range/)
})
