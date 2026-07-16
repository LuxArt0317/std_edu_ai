import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import handler from '../../api/crm-assistant.ts'

type CapturedResponse = {
  statusCode: number
  body: unknown
  headers: Record<string, string>
}

const originalFetch = globalThis.fetch
const originalApiKey = process.env.OPENAI_API_KEY

after(() => {
  globalThis.fetch = originalFetch
  if (originalApiKey === undefined) delete process.env.OPENAI_API_KEY
  else process.env.OPENAI_API_KEY = originalApiKey
})

async function invoke(method: string, body: unknown, address: string) {
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

  await handler({ method, body, headers: { 'x-forwarded-for': address } }, response)
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
  globalThis.fetch = async (_input, init) => {
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
  }, 'test-success')

  assert.equal(response.statusCode, 200)
  assert.deepEqual(response.body, {
    answer: 'Contact the student today with one clear option for support.',
    actions: ['Confirm the immediate blocker', 'Record the outcome'],
    citations: ['riskScore', 'nextAction'],
    source: 'openai',
  })
})

