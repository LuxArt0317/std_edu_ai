import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import {newConversationId} from '../../src/services/assistantConversationId.js';

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

test('the protected protocol limits new IDs to a short UUIDv7 creation window',()=>{
  const now=1794700000123,ids=Array.from({length:8},()=>newConversationId(now));
  for(const id of ids){
    assert.match(id,/^[a-f0-9]{8}-[a-f0-9]{4}-7[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/);
    assert.equal(Number.parseInt(id.replaceAll('-','').slice(0,12),16),now);
  }
  assert.equal(new Set(ids).size,ids.length);
});

test('versioned APIs share an account lock and legacy access cannot affect v7 rows',()=>{
  const migration=readFileSync(new URL('../../supabase/migrations/20261115230000_assistant_conversation_delete_receipts.sql',import.meta.url),'utf8');
  const lock="perform pg_advisory_xact_lock(hashtextextended('affairs-chat:'||v_uid::text,0));";
  assert.equal(migration.split(lock).length-1,2);
  assert.equal(migration.split('and private.affairs_conversation_creation_time(id) is null').length-1,2);
  assert.match(migration,/select private\.affairs_save_conversation\(p_id,p_title,p_messages,p_expected_version,false\)/);
  assert.match(migration,/if not p_protected and v_created is not null/);
  assert.match(migration,/where user_id=v_uid and conversation_id=p_id/);
  assert.match(migration,/delete from public\.affairs_conversations where id=p_id and user_id=v_uid/);
  assert.match(migration,/return jsonb_build_object\('deleted',true,'protection','conversation-delete-v2'\)/);
  assert.match(migration,/revoke all on private\.affairs_conversation_delete_markers from public,anon,authenticated/);
  assert.match(migration,/revoke all on private\.affairs_conversation_creation_floors from public,anon,authenticated/);
});
