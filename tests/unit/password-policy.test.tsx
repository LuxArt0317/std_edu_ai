import test from 'node:test'
import assert from 'node:assert/strict'
import { assertNewPassword } from '../../src/features/auth/passwordPolicy'

test('password validation matches the provider limits without truncation, including multibyte text', () => {
  assert.doesNotThrow(() => assertNewPassword('Aa1!' + 'x'.repeat(12)))
  assert.doesNotThrow(() => assertNewPassword('Aa1!' + 'x'.repeat(68)))
  assert.throws(() => assertNewPassword('Aa1!' + 'x'.repeat(11)), /16 and 72/)
  assert.throws(() => assertNewPassword('Aa1!' + 'x'.repeat(69)), /16 and 72/)
  assert.throws(() => assertNewPassword('Aa1!' + '😀'.repeat(18)), /shorter password/)
})
test('all new-password flows require the same server-enforced character classes', () => {
  for (const value of ['a'.repeat(20), 'A'.repeat(20), 'Aa'.repeat(10), 'Aa1'.repeat(8), 'Aa1' + 'x'.repeat(12) + ' ', 'Aa1' + 'x'.repeat(12) + 'Ä']) assert.throws(() => assertNewPassword(value), /uppercase, lowercase, a number and a symbol/)
})
