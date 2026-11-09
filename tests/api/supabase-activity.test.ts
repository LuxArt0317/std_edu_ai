import assert from 'node:assert/strict'
import { test } from 'node:test'
import deployment from '../../deployment.json' with { type: 'json' }
import { checkSupabaseActivity, projectRef, stopAt } from '../../scripts/supabase-activity.mjs'

test('activity check is pinned to the client project and performs one public read', async () => {
  assert.equal(projectRef, deployment.supabase.projectRef)
  let requests = 0
  const result = await checkSupabaseActivity({
    now: new Date(Date.parse(stopAt) - 1),
    key: 'test-publishable-key',
    request: async (url: string, init: RequestInit) => {
      requests++
      assert.equal(url, `https://${projectRef}.supabase.co/rest/v1/knowledge_sources?select=id&limit=1`)
      assert.equal(init.method, 'GET')
      assert.equal((init.headers as Record<string, string>).apikey, 'test-publishable-key')
      return new Response(JSON.stringify([{ id: 'source-id' }]), { status: 200 })
    },
  })
  assert.deepEqual(result, { expired: false, queried: true, rows: 1 })
  assert.equal(requests, 1)
})

test('cutoff and manual stop never contact Supabase, even without a key', async () => {
  const forbidden = async () => { throw new Error('Unexpected database request') }
  const expired = await checkSupabaseActivity({ now: new Date(stopAt), key: '', request: forbidden })
  const stopped = await checkSupabaseActivity({ now: new Date(Date.parse(stopAt) - 1), stopNow: true, key: '', request: forbidden })
  assert.deepEqual(expired, { expired: true, queried: false, reason: 'one_month_cutoff' })
  assert.deepEqual(stopped, { expired: true, queried: false, reason: 'manual_stop' })
})

test('missing credentials and provider errors fail visibly', async () => {
  const now = new Date(Date.parse(stopAt) - 1)
  await assert.rejects(checkSupabaseActivity({ now, key: '' }), /publishable key is missing/)
  await assert.rejects(checkSupabaseActivity({ now, key: 'test', request: async () => new Response('unavailable', { status: 503 }) }), /HTTP 503/)
  await assert.rejects(checkSupabaseActivity({ now, key: 'test', request: async () => new Response('{}', { status: 200 }) }), /unexpected response/)
})
