import assert from 'node:assert/strict'
import fs from 'node:fs'
import { test } from 'node:test'

const source = fs.readFileSync('supabase/functions/provision-role-account/index.ts', 'utf8')

test('role provisioning is restricted to the protected owner', () => {
  assert.match(source, /app_metadata\.role !== 'owner'/)
  assert.match(source, /app_metadata\.platform_owner !== true/)
  assert.match(source, /Only the protected platform owner can provision accounts/)
})

test('role provisioning excludes a second owner and validates credentials', () => {
  const allowedRoles = source.slice(source.indexOf('const allowedRoles'), source.indexOf('const allowedOrigins'))
  assert.doesNotMatch(allowedRoles, /['"]owner['"]/)
  assert.match(source, /password\.length < 24/)
  assert.match(source, /email_confirm: true/)
})

test('service credentials remain server-only and passwords are not returned', () => {
  assert.match(source, /Deno\.env\.get\('SUPABASE_SERVICE_ROLE_KEY'\)/)
  const successResponse = source.slice(source.lastIndexOf('return response(request, existing'))
  assert.doesNotMatch(successResponse, /password/)
})
