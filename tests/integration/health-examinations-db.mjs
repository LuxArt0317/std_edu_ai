import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import postgres from 'postgres';
import { deploymentEnvironment } from '../../scripts/deployment-env.mjs';
import { dormitoryConductClientTarget, reserveDormitoryConductLease } from './dormitory-conduct-rls-live.mjs';

const [mode, ...extra] = process.argv.slice(2);
assert.ok(['--preflight', '--deployed'].includes(mode) && !extra.length);
const env = deploymentEnvironment(), connection = env.POSTGRES_URL_NON_POOLING || env.POSTGRES_URL;
dormitoryConductClientTarget(connection);
const config = JSON.parse(await readFile('deployment.json', 'utf8'));
const [student, other, unlinked, attached, withheld, missing, old] = Array.from({ length: 7 }, () => randomUUID());
const reportPath = id => student + '/' + id + '.pdf';
let lease;
const pool = postgres(connection, {
  max: 1, connect_timeout: 12, max_lifetime: 0, idle_timeout: 0,
  ssl: { rejectUnauthorized: true, ca: await readFile('supabase/certs/prod-ca-2021.crt', 'utf8') },
  connection: { statement_timeout: 15000 }, onclose: () => lease?.lose(), onnotice: () => {},
});
const state = async sql => (await sql`select
  to_regprocedure('public.affairs_read_health_examinations(integer)') is not null installed,
  to_regprocedure('public.affairs_can_download_health_report(uuid)') is not null download_installed,
  (select count(*)::int from auth.users where id in (${student},${other},${unlinked})) fixtures,
  (select count(*)::int from storage.objects where name in (${reportPath(attached)},${reportPath(withheld)})) files,
  (select count(*)::int from supabase_migrations.schema_migrations) migrations,
  (select md5(to_jsonb(u)::text) from auth.users u where lower(u.email) = lower(${config.supabase.ownerEmail})) owner`)[0];
const read = async (q, offset = 0) => (await q`select public.affairs_read_health_examinations(${offset}) data`)[0].data;
const files = async q => (await q`select name from storage.objects where bucket_id = 'affairs-health-reports' order by name`).map(row => row.name);
const deny = (q, fn, code) => assert.rejects(q.savepoint(fn), error => error.code === code);
async function as(q, id, role = 'authenticated') {
  await q.unsafe('set local role ' + role);
  await q`select set_config('request.jwt.claim.sub',${id},true)`;
}
try {
  lease = await reserveDormitoryConductLease(pool);
  const before = await state(lease.sql);
  assert.ok(before.owner && before.fixtures === 0 && before.files === 0);
  if (mode === '--deployed') assert.ok(before.installed && before.download_installed);
  else assert.equal(before.download_installed, false);
  await lease.rollbackOnly(async q => {
    if (!before.installed) await q.unsafe(await readFile('supabase/migrations/20261115060000_student_health_reports.sql', 'utf8'));
    if (!before.download_installed) await q.unsafe(await readFile('supabase/migrations/20261115061000_student_health_report_downloads.sql', 'utf8'));
    const canDownload = async (id) => (await q`select public.affairs_can_download_health_report(${id}) allowed`)[0].allowed;
    const [bucket] = await q`select public,file_size_limit,allowed_mime_types from storage.buckets where id = 'affairs-health-reports'`;
    assert.deepEqual(bucket, { public: false, file_size_limit: '10485760', allowed_mime_types: ['application/pdf'] });
    for (const id of [student, other, unlinked]) {
      const email = 'health-qa-' + id + '@example.invalid';
      await q`insert into auth.users(instance_id,id,aud,role,email,email_confirmed_at,created_at,updated_at)
        values('00000000-0000-0000-0000-000000000000',${id},'authenticated','authenticated',${email},now(),now(),now())`;
      if (id !== unlinked) await q`insert into auth.identities(provider_id,user_id,identity_data,provider,created_at,updated_at)
        values(${id},${id},${q.json({ sub: id, email, email_verified: true })},'google',now(),now())`;
    }
    await q`insert into public.affairs_health_examinations
      (id,user_id,examination_code,student_number,student_name,class_label,examined_on,report_available)
      values (${attached},${student},'QA attached','TEST-01','QA Student','QA Class',current_date,true),
        (${withheld},${student},'QA withheld','TEST-01','QA Student','QA Class',current_date-1,false),
        (${missing},${student},'QA missing','TEST-01','QA Student','QA Class',current_date-2,true),
        (${old},${student},'QA oldest','TEST-01','QA Student','QA Class',current_date-100,false)`;
    await q`insert into public.affairs_health_examinations (user_id,examination_code,student_number,student_name,class_label,examined_on)
      select ${student},'QA ' || n,'TEST-01','QA Student','QA Class',current_date-3-n from generate_series(1,22) n`;
    await q`insert into storage.objects(bucket_id,name) values
      ('affairs-health-reports',${reportPath(attached)}),('affairs-health-reports',${reportPath(withheld)})`;

    await as(q, '', 'anon');
    await deny(q, read, '42501');
    await deny(q, s => s`select public.affairs_can_download_health_report(${attached})`, '42501');
    await as(q, unlinked);
    assert.equal(await canDownload(attached), false);
    await deny(q, read, '42501');
    assert.deepEqual(await files(q), []);
    await as(q, other);
    assert.equal(await canDownload(attached), false);
    assert.deepEqual(await read(q), { userId: other, total: 0, rows: [] });
    assert.deepEqual(await files(q), []);
    await as(q, student);
    await deny(q, s => s`select * from public.affairs_health_examinations`, '42501');
    await deny(q, s => read(s, 1), '22023');
    const first = await read(q);
    assert.equal(first.total, 26);
    assert.equal(first.rows.length, 25);
    assert.deepEqual(first.rows.slice(0, 3).map(row => [row.id, row.report_available]),
      [[attached, true], [withheld, false], [missing, false]]);
    assert.deepEqual(Object.keys(first.rows[0]).sort(), ['class_label','examination_code','id','report_available','student_name','student_number']);
    assert.equal((await read(q, 25)).rows[0].id, old);
    assert.equal(await canDownload(attached), true);
    assert.equal(await canDownload(withheld), false);
    assert.equal(await canDownload(missing), false);
    for (const operation of ['storage.object.sign', 'storage.object.get_authenticated']) {
      await q`select set_config('storage.operation',${operation},true)`;
      assert.deepEqual(await files(q), []);
    }
    await deny(q, s => s`insert into storage.objects(bucket_id,name) values('affairs-health-reports',${reportPath(missing)})`, '42501');
  });
  assert.deepEqual(await state(lease.sql), before);
  console.log('Health exam account isolation, private PDF policy, publication checks, pagination, and SQL rollback passed.');
} finally {
  try { if (lease && !lease.lost) await lease.release(); } finally { await pool.end({ timeout: 4 }); }
}
