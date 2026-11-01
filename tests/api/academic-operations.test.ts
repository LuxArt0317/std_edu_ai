import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'

const root = new URL('../../', import.meta.url)

async function source(path: string) {
  return readFile(new URL(path, root), 'utf8')
}

test('academic operations migration enforces enrollment capacity and schedule conflicts', async () => {
  const sql = await source('supabase/migrations/20260717133008_academic_operations_workflows.sql')
  assert.match(sql, /create or replace function public\.manage_section_enrollment/i)
  assert.match(sql, /for update/i)
  assert.match(sql, /course section is at capacity/i)
  assert.match(sql, /room conflict/i)
  assert.match(sql, /faculty schedule conflict/i)
  assert.match(sql, /student schedule conflict/i)
  assert.match(sql, /grant execute on function public\.manage_section_enrollment/i)
})

test('student provisioning is role-gated and never returns the temporary password', async () => {
  const edgeFunction = await source('supabase/functions/manage-student-account/index.ts')
  assert.match(edgeFunction, /new Set\(\['owner', 'admin', 'registrar'\]\)/)
  assert.match(edgeFunction, /temporary password must contain 24 to 128 characters/)
  assert.match(edgeFunction, /email_confirm: true/)
  assert.match(edgeFunction, /Access-Control-Allow-Headers[^\n]+x-client-info/i)
  assert.doesNotMatch(edgeFunction, /JSON\.stringify\([^)]*password/)
})

test('all browser-invoked account functions allow Supabase client headers and production origins', async () => {
  for (const path of [
    'supabase/functions/manage-student-account/index.ts',
    'supabase/functions/provision-role-account/index.ts',
  ]) {
    const edgeFunction = await source(path)
    assert.match(edgeFunction, /https:\/\/stdeduai\.vercel\.app/)
    assert.doesNotMatch(edgeFunction, /https:\/\/(?:www\.)?stu\.best/)
    assert.match(
      edgeFunction,
      /Access-Control-Allow-Headers[\s\S]{0,120}authorization[^\n]+x-client-info[^\n]+apikey[^\n]+content-type/i,
    )
  }
})

test('the Academic Office exposes complete setup and daily workflows', async () => {
  const ui = await source('src/platform/AcademicOperations.tsx')
  for (const expected of [
    'Add student',
    'Add subject',
    'Open class',
    'Create department',
    'Create program',
    'Create term',
    'Enroll',
    'Add schedule event',
  ])
    assert.match(ui, new RegExp(expected))
  assert.match(ui, /createStudentAccount/)
  assert.match(ui, /manageSectionEnrollment/)
  assert.match(ui, /createScheduleEvent/)
})
