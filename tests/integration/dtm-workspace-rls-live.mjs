import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import postgres from 'postgres';
import { deploymentEnvironment } from '../../scripts/deployment-env.mjs';

const env = deploymentEnvironment();
const connection = env.POSTGRES_URL_NON_POOLING || env.POSTGRES_URL || env.DATABASE_URL;
const project = JSON.parse(await readFile('deployment.json', 'utf8')).supabase.projectRef;
assert.ok(connection && (new URL(connection).hostname.endsWith('.supabase.com') || new URL(connection).hostname === `db.${project}.supabase.co`));
const sql = postgres(connection, { max:1, ssl:{rejectUnauthorized:true,ca:await readFile('supabase/certs/prod-ca-2021.crt','utf8')} });
try {
  const users = await sql`select distinct u.id from auth.users u join auth.identities i on i.user_id=u.id where i.provider='google' and u.email_confirmed_at is not null limit 2`;
  assert.equal(users.length, 2, 'Two verified Google identities are needed for isolation testing');
  try {
    await sql.begin(async tx => {
      await tx.unsafe('set local role authenticated');
      await tx`select set_config('request.jwt.claim.sub',${users[0].id},true)`;
      await tx`select public.affairs_initialize_account()`;
      await tx`select public.dtm_initialize_account()`;
      const first = await tx`select id,user_id from public.dtm_courses where source_mode='sample'`;
      assert.equal(first.length,1); assert.equal(first[0].user_id,users[0].id);
      const firstMaterials = await tx`select id from public.dtm_materials where source_mode='sample'`;
      assert.equal(firstMaterials.length,3);
      await tx`select public.dtm_initialize_account()`;
      const noDuplicates = await tx`select count(*)::int as n from public.dtm_materials where source_mode='sample'`;
      assert.equal(noDuplicates[0].n,3);
      await tx`select set_config('request.jwt.claim.sub',${users[1].id},true)`;
      await tx`select public.affairs_initialize_account()`;
      await tx`select public.dtm_initialize_account()`;
      const second = await tx`select id,user_id from public.dtm_courses where source_mode='sample'`;
      assert.equal(second.length,1); assert.equal(second[0].user_id,users[1].id);
      assert.notEqual(second[0].id,first[0].id);
      const secondMaterials = await tx`select id from public.dtm_materials where source_mode='sample'`;
      assert.equal(secondMaterials.length,3);
      assert.equal(secondMaterials.some(row=>firstMaterials.some(firstRow=>firstRow.id===row.id)),false);
      throw new Error('ROLLBACK_TEST');
    });
  } catch(error) { if (error.message !== 'ROLLBACK_TEST') throw error; }
  const anonymous = await sql`select count(*)::int as n from pg_policies where schemaname='public' and tablename like 'dtm_%' and roles::text like '%anon%'`;
  assert.equal(anonymous[0].n,0);
  console.log(JSON.stringify({status:'ok',accountIsolation:true,materialIsolation:true,idempotentSeed:true,anonymousPolicy:false}));
} finally { await sql.end({timeout:5}); }
