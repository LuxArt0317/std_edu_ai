import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import postgres from 'postgres';
import {deploymentEnvironment} from '../../scripts/deployment-env.mjs';
import {dormitoryConductClientTarget, reserveDormitoryConductLease} from './dormitory-conduct-rls-live.mjs';

assert.deepEqual(process.argv.slice(2), ['--rollback-preflight']);
const config = JSON.parse(await readFile('deployment.json', 'utf8'));
assert.equal(config.repository, 'LuxArt0317/std_edu_ai');
assert.equal(config.supabase.projectRef, 'xiftudmvxphxcjtmfmib');
const env = deploymentEnvironment();
const connection = env.POSTGRES_URL_NON_POOLING || env.POSTGRES_URL || env.DATABASE_URL;
dormitoryConductClientTarget(connection);
const pool = postgres(connection, {
  max: 1, connect_timeout: 12, max_lifetime: 0, idle_timeout: 0,
  ssl: {rejectUnauthorized: true, ca: await readFile('supabase/certs/prod-ca-2021.crt', 'utf8')},
  connection: {statement_timeout: 15000}, onclose: () => lease?.lose(), onnotice: () => {},
});
const ddl = await readFile('supabase/migrations/20261114030000_fee_remission.sql', 'utf8');
const own = randomUUID(), other = randomUUID(), nonGoogle = randomUUID(), rowId = randomUUID();
const ids = [own, other, nonGoogle];
const payload = {
  id: rowId, user_id: own, request_id: randomUUID(), expected_version: 0,
  academic_year_text: '001', semester_text: '', student_number: null, category_text: '測試',
  amount_text: '0', check_status_text: null, notes_text: ' 保留原文 😀 ', row_order: 0,
};
const cases = [];
let lease;
let stage = 'connect';
async function fingerprint(sql) {
  const [row] = await sql`select
    (select count(*)::int from supabase_migrations.schema_migrations) as migrations,
    (select md5(jsonb_agg(to_jsonb(m) order by version)::text) from supabase_migrations.schema_migrations m) as history,
    (select count(*)::int from pg_class join pg_namespace n on n.oid=relnamespace where n.nspname='public' and relkind='r' and relrowsecurity) as rls,
    (select md5(to_jsonb(u)::text) from auth.users u where lower(email)=lower(${config.supabase.ownerEmail})) as owner_hash,
    (select count(*)::int from auth.users where id=any(${ids}::uuid[])) as fixtures,
    (select count(*)::int from public.affairs_agent_audit where target_id=${rowId}) as audit,
    to_regclass('public.affairs_fee_remission') is null and to_regclass('private.affairs_fee_remission_operations') is null
      and to_regprocedure('public.affairs_read_fee_remission(uuid)') is null
      and to_regprocedure('public.affairs_manage_fee_remission(text,jsonb)') is null as draft_absent`;
  return row;
}
async function as(q, id, role = 'authenticated') {
  await q.unsafe(role === 'anon' ? 'set local role anon' : 'set local role authenticated');
  await q`select set_config('request.jwt.claim.sub',${id},true)`;
}
const read = async (q, userId = null) => (await q`select public.affairs_read_fee_remission(${userId}::uuid) as value`)[0].value;
const change = async (q, kind, value) => (await q`select public.affairs_manage_fee_remission(${kind},${q.json(value)}) as value`)[0].value;
const deny = (q, task, code) => assert.rejects(q.savepoint(task), error => error.code === code);
try {
  lease = await reserveDormitoryConductLease(pool);
  const {sql} = lease;
  const before = await fingerprint(sql);
  assert.equal(before.migrations, 136);
  assert.equal(before.rls, 152);
  assert.ok(before.draft_absent && before.owner_hash && before.fixtures === 0 && before.audit === 0);
  const [owner] = await sql`select p.user_id from public.affairs_profiles p join auth.users u on u.id=p.user_id
    where lower(u.email)=lower(${config.supabase.ownerEmail}) and p.role='admin' and u.email_confirmed_at is not null
      and exists (select 1 from auth.identities i where i.user_id=u.id and i.provider='google')`;
  assert.ok(owner && !ids.includes(owner.user_id));
  let failure;
  try {
    await lease.rollbackOnly(async q => {
      stage = 'fixture setup and migration';
      await q.unsafe("set local lock_timeout = '8s'");
      await q.unsafe("set local idle_in_transaction_session_timeout = '30s'");
      for (const id of ids) {
        const email = `fee-remission-qa-${id}@example.invalid`;
        await q`insert into auth.users(instance_id,id,aud,role,email,email_confirmed_at,created_at,updated_at)
          values ('00000000-0000-0000-0000-000000000000',${id},'authenticated','authenticated',${email},now(),now(),now())`;
        await q`insert into public.affairs_profiles(user_id,email,display_name,role) values (${id},${email},'Fee Remission QA','student')`;
        if (id !== nonGoogle) await q`insert into auth.identities(provider_id,user_id,identity_data,provider,created_at,updated_at)
          values (${id},${id},${q.json({sub:id,email,email_verified:true})},'google',now(),now())`;
      }
      await q.unsafe(ddl);
      stage = 'administrator create and replay';
      await as(q, owner.user_id);
      const created = await change(q, 'save_fee_remission', payload);
      assert.deepEqual(created, {id:rowId, kind:'save_fee_remission', version:1});
      assert.deepEqual(await change(q, 'save_fee_remission', payload), created);
      await deny(q, s => change(s, 'save_fee_remission', {...payload, amount_text:'50'}), 'PT409');
      await deny(q, s => change(s, 'save_fee_remission', {...payload, request_id:randomUUID(), amount_text:50}), '22023');
      await deny(q, s => change(s, 'save_fee_remission', {...payload, request_id:randomUUID(), id:randomUUID(), category_text:'A'.repeat(161)}), '22023');
      const result = await read(q, own);
      const {user_id:_user, request_id:_request, expected_version:_version, ...record} = payload;
      assert.deepEqual(result, {userId:own, records:[{...record,version:1}]});
      cases.push('admin-save-replay-literal-null-blank-zero-and-invalid-payload');
      stage = 'isolation and permissions';
      await as(q, own);
      assert.deepEqual(await read(q), result);
      await deny(q, s => read(s, other), '42501');
      await deny(q, s => change(s, 'save_fee_remission', payload), '42501');
      await deny(q, s => s`update public.affairs_fee_remission set amount_text='unauthorized' where id=${rowId}`, '42501');
      await as(q, other);
      assert.deepEqual(await read(q), {userId:other,records:[]});
      assert.equal((await q`select id from public.affairs_fee_remission where id=${rowId}`).length, 0);
      await as(q, nonGoogle);
      await deny(q, s => read(s), '42501');
      await as(q, '', 'anon');
      await deny(q, s => read(s), '42501');
      cases.push('owner-read-cross-account-student-write-non-google-and-anonymous');
      stage = 'versioned edit and deletion';
      await as(q, owner.user_id);
      const update = {...payload, request_id:randomUUID(), expected_version:1, amount_text:' 001,000 '};
      assert.equal((await change(q, 'save_fee_remission', update)).version, 2);
      assert.equal((await read(q, own)).records[0].amount_text, ' 001,000 ');
      await deny(q, s => change(s, 'save_fee_remission', {...update, request_id:randomUUID()}), 'PT409');
      await deny(q, s => change(s, 'save_fee_remission', {...update, request_id:randomUUID(), expected_version:2, user_id:other}), '42501');
      const deletion = {id:rowId, user_id:own, request_id:randomUUID(), expected_version:2};
      assert.equal((await change(q, 'delete_fee_remission', deletion)).version, 3);
      assert.deepEqual(await read(q, own), {userId:own, records:[]});
      await deny(q, s => change(s, 'save_fee_remission', {...payload, request_id:randomUUID()}), 'PT409');
      await q.unsafe('reset role');
      assert.equal((await q`select count(*)::int as n from public.affairs_agent_audit where target_id=${rowId}`)[0].n, 3);
      assert.equal((await q`select count(*)::int as n from private.affairs_fee_remission_operations where user_id=${own}`)[0].n, 3);
      cases.push('version-conflict-owner-immutability-soft-delete-and-exact-audit');
    });
  } catch (error) { failure = error; }
  assert.deepEqual(await fingerprint(sql), before);
  if (failure) throw failure;
  console.log(JSON.stringify({status:'passed', baseline:{migrations:136,rls:152}, cases, exactRollback:true}));
} catch (error) {
  console.error(JSON.stringify({status:'failed', stage, code:error.code ?? error.name, line:error.stack?.match(/fee-remission-rls-live\.mjs:(\d+)/)?.[1]}));
  process.exitCode = 1;
} finally {
  try { await lease?.release(); } finally { await pool.end({timeout:5}); }
}
