import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';

const original = readFileSync(new URL('../../supabase/migrations/20261112120000_assistant_conversations.sql', import.meta.url), 'utf8');
const replacement = readFileSync(new URL('../../supabase/migrations/20261112190000_assistant_conversation_content_limit.sql', import.meta.url), 'utf8');
const oldLimit = "char_length(v_message->>'content')>7000";
const newLimit = "char_length(v_message->>'content')>8000";
const grants = [
  'revoke all on function public.affairs_save_conversation(uuid,text,jsonb,integer) from public,anon;',
  'grant execute on function public.affairs_save_conversation(uuid,text,jsonb,integer) to authenticated;',
];

function extractFunction(sql: string): string {
  // The body contains semicolons; match the dollar-quoted body independently.
  const start = sql.search(/create(?: or replace)? function public\.affairs_save_conversation\(/i);
  assert.ok(start >= 0, 'The migration must declare the conversation RPC');
  const end = sql.indexOf('$$;', start);
  assert.ok(end > start, 'The conversation RPC must have a complete dollar-quoted body');
  return sql.slice(start, end + 3).replace(/\r\n/g, '\n').trim();
}

test('the follow-up changes only CREATE OR REPLACE and the per-message content limit', () => {
  const previous = extractFunction(original);
  const current = extractFunction(replacement);
  assert.equal(previous.split(oldLimit).length - 1, 1, 'The old content guard must be unambiguous');
  assert.equal(current.split(newLimit).length - 1, 1, 'Exactly one content guard must use 8,000 characters');
  assert.equal(current.includes(oldLimit), false);
  assert.equal(current, previous.replace(/^create function/i, 'create or replace function').replace(oldLimit, newLimit));
});

test('the content limit is character-based and all existing payload and security guards remain', () => {
  const current = extractFunction(replacement);
  for (const guard of [
    "language plpgsql security definer set search_path=''",
    'v_uid uuid:=auth.uid()',
    'v_uid is null or not private.affairs_google_identity()',
    'jsonb_array_length(p_messages)>24',
    'octet_length(p_messages::text)>190000',
    "jsonb_typeof(v_message->'content') is distinct from 'string'",
    newLimit,
    "(v_message->'result') ? 'proposedAction'",
    "pg_advisory_xact_lock(hashtextextended('affairs-chat:'||v_uid::text,0))",
    'where id=p_id for update',
    'if v_row.user_id<>v_uid then',
    "if v_row.title=btrim(p_title) and v_row.messages=p_messages then return to_jsonb(v_row)-'user_id'",
    'if v_row.version<>p_expected_version then',
    'if p_expected_version<>0 then',
    'where user_id=v_uid)>=100',
    "return to_jsonb(v_row)-'user_id'",
  ]) assert.ok(current.includes(guard), `Missing original guard: ${guard}`);
});

test('execution grants remain authenticated-only and the migration contains no other DDL', () => {
  for (const grant of grants) {
    assert.ok(original.includes(grant), 'Grant comparison must use the original migration');
    assert.equal(replacement.split(grant).length - 1, 1, `Missing or duplicated original grant: ${grant}`);
  }
  const current = extractFunction(replacement);
  let remaining = replacement.replace(current, '');
  for (const grant of grants) remaining = remaining.replace(grant, '');
  // Only line comments and whitespace may surround the exact replacement/grants.
  assert.equal(remaining.replace(/^\s*--[^\n]*(?:\n|$)/gm, '').trim(), '');
});
