import assert from 'node:assert/strict'
import { test } from 'node:test'
import { verifySupabaseRequest } from '../../server/apiAuth.js'

test('Marketplace publishable configuration verifies a session through the intended Auth service', async () => {
  const names = ['VITE_SUPABASE_URL', 'VITE_SUPABASE_PUBLISHABLE_KEY', 'SUPABASE_URL', 'SUPABASE_PUBLISHABLE_KEY', 'SUPABASE_ANON_KEY', 'NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY']
  const previous = Object.fromEntries(names.map(name => [name, process.env[name]]))
  const fetchBefore = globalThis.fetch
  try {
    for (const name of names) delete process.env[name]
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://client-project.supabase.co'
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'browser-safe-test-key'
    globalThis.fetch = async (input, init) => {
      assert.equal(input, 'https://client-project.supabase.co/auth/v1/user')
      assert.equal(new Headers(init?.headers).get('apikey'), 'browser-safe-test-key')
      return new Response(JSON.stringify({ id: 'verified-user', email: 'owner@example.test', app_metadata: { role: 'owner', platform_owner: true } }))
    }
    const result = await verifySupabaseRequest({ headers: { authorization: `Bearer ${'a'.repeat(48)}` } })
    assert.equal(result.ok, true)
    if (result.ok) assert.equal(result.user.isOwner, true)
  } finally {
    globalThis.fetch = fetchBefore
    for (const name of names) {
      if (previous[name] === undefined) delete process.env[name]
      else process.env[name] = previous[name]
    }
  }
})
