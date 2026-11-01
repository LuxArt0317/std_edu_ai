import assert from 'node:assert/strict'
import { after,test } from 'node:test'
import handler from '../../api/crm-assistant.ts'

type CapturedResponse = {
  statusCode: number
  body: unknown
  headers: Record<string, string>
}

const originalFetch = globalThis.fetch
const originalApiKey = process.env.OPENAI_API_KEY
const originalSupabaseUrl = process.env.VITE_SUPABASE_URL
const originalSupabaseKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY

after(() => {
  globalThis.fetch = originalFetch
  if (originalApiKey === undefined) delete process.env.OPENAI_API_KEY
  else process.env.OPENAI_API_KEY = originalApiKey
  if (originalSupabaseUrl === undefined) delete process.env.VITE_SUPABASE_URL
  else process.env.VITE_SUPABASE_URL = originalSupabaseUrl
  if (originalSupabaseKey === undefined) delete process.env.VITE_SUPABASE_PUBLISHABLE_KEY
  else process.env.VITE_SUPABASE_PUBLISHABLE_KEY = originalSupabaseKey
})

async function invoke(method: string, body: unknown, address: string, authenticated = false) {
  const captured: CapturedResponse = { statusCode: 200, body: null, headers: {} }
  const response = {
    status(code: number) {
      captured.statusCode = code
      return response
    },
    json(value: unknown) {
      captured.body = value
    },
    setHeader(name: string, value: string) {
      captured.headers[name] = value
    },
  }

  await handler({ method, body, headers: { 'x-forwarded-for': address, ...(authenticated ? { authorization: 'Bearer test-session-token-with-sufficient-length' } : {}) } }, response)
  return captured
}

test('rejects non-POST requests', async () => {
  const response = await invoke('GET', null, 'test-method')
  assert.equal(response.statusCode, 405)
  assert.equal(response.headers.Allow, 'POST')
})

test('validates assistant input before contacting OpenAI', async () => {
  const response = await invoke('POST', { mode: 'brief', message: '' }, 'test-validation')
  assert.equal(response.statusCode, 400)
})

test('returns validated structured OpenAI output', async () => {
  process.env.OPENAI_API_KEY = 'test-key-never-sent-to-a-real-service'
  process.env.VITE_SUPABASE_URL = 'https://test.supabase.co'
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_test'
  globalThis.fetch = async (input, init) => {
    if (String(input).includes('/auth/v1/user')) {
      return new Response(JSON.stringify({ id: 'user-1', email: 'owner@example.test', app_metadata: { role: 'owner', platform_owner: true } }), { status: 200 })
    }
    assert.equal(init?.method, 'POST')
    const headers = init?.headers as Record<string, string> | undefined
    assert.match(String(headers?.Authorization), /^Bearer test-key/)
    const providerBody = JSON.parse(String(init?.body)) as { input: string }
    assert.doesNotMatch(providerBody.input, /student@example\.com/)
    return new Response(JSON.stringify({
      output: [{ content: [{ text: JSON.stringify({
        answer: 'Contact the student today with one clear option for support.',
        actions: ['Confirm the immediate blocker', 'Record the outcome'],
        citations: ['riskScore', 'nextAction'],
      }) }] }],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })
  }

  const response = await invoke('POST', {
    mode: 'brief',
    message: 'Create a staff action brief',
    context: { studentRef: 'AB', riskScore: 72, email: 'student@example.com' },
  }, 'test-success', true)

  assert.equal(response.statusCode, 200)
  assert.deepEqual(response.body, {
    answer: 'Contact the student today with one clear option for support.',
    actions: ['Confirm the immediate blocker', 'Record the outcome'],
    citations: ['riskScore', 'nextAction'],
    source: 'openai',
  })
})
