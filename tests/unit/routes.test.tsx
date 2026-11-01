import assert from 'node:assert/strict'
import test from 'node:test'
import { legacyAppPath, pathForView, safeReturnPath, viewForPath } from '../../src/features/school/portal/routes'

test('section URLs resolve consistently, including role-specific courses', () => {
  assert.equal(pathForView('cases'), '/app/cases')
  assert.equal(viewForPath('/app/cases/', false), 'cases')
  assert.equal(viewForPath('/app/courses', true), 'teaching')
  assert.equal(viewForPath('/app/courses', false), 'learning')
  assert.equal(viewForPath('/app/missing', false), null)
})
test('post-login redirects only accept known local app routes', () => {
  for (const input of [null, '', '//evil.example/app', 'https://evil.example/app', '/login', '/app/missing', '/app/../login', '/\\evil.example/app', '/app\n']) assert.equal(safeReturnPath(input), '/app', String(input))
  assert.equal(safeReturnPath('/app/cases?record=123#details'), '/app/cases?record=123#details')
})
test('legacy links preserve curriculum references and recovery callbacks', () => {
  assert.equal(legacyAppPath('?curriculum_request=123', ''), '/app/academics?curriculum_request=123')
  assert.equal(legacyAppPath('', '#type=recovery'), '/app#type=recovery')
})
