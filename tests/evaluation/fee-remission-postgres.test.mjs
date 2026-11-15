import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {lstat,readFile,realpath} from 'node:fs/promises';
import {join} from 'node:path';
import test from 'node:test';
import postgres from 'postgres';
import {buildFeeRemissionFixturePlan,feeRemissionLivePlanManifest} from './fee-remission-live-plan.mjs';
import {createFeeRemissionFixtureLifecycle} from './fee-remission-fixture-lifecycle.mjs';
import {deleteRows,insertRows,readRows} from './fee-remission-fixture-sql.mjs';

const socket=process.env.STU_FEE_TEST_PG_SOCKET;
const migrations=[
  '20261105010000_school_affairs_workspace.sql',
  '20261112080000_pending_fees.sql',
  '20261114030000_fee_remission.sql',
  '20261116000000_charge_payment_history.sql',
];

test('the real fee fixture stages and replaces both owned tables with PostgreSQL JSON recordsets',
  {skip:!socket,timeout:30000},async t=>{
    assert.match(socket,/^\/(?:(?:private\/)?var\/tmp|tmp)\/stu100-fee-pg\.[A-Za-z0-9]{6,12}\/socket$/u);
    const dir=await lstat(socket);
    assert.equal(dir.uid,process.getuid());
    assert.equal(dir.mode&0o777,0o700);
    assert.equal(await realpath(socket),socket);
    assert.ok((await lstat(join(socket,'.s.PGSQL.5432'))).isSocket());
    const connect=database=>postgres({host:socket,user:'postgres',database,max:1,ssl:false,connect_timeout:3,
      onnotice:()=>{},connection:{application_name:'stu-fee-local-test',statement_timeout:5000}});
    const admin=connect('postgres'),database='fee_'+randomUUID().replaceAll('-','');
    await admin.unsafe('create database '+database);
    const pool=connect(database),reader=connect(database),sql=await pool.reserve();
    t.after(async()=>{
      sql.release();
      await Promise.all([pool.end(),reader.end()]);
      try{
        await admin.unsafe('drop database '+database);
        assert.equal((await admin.unsafe('select datname from pg_catalog.pg_database where datname=$1',[database])).length,0);
      }finally{await admin.end();}
    });
    await sql.unsafe(`do $$begin
      if not exists(select 1 from pg_roles where rolname='anon') then create role anon; end if;
      if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if;
      if not exists(select 1 from pg_roles where rolname='service_role') then create role service_role; end if;
      end$$;
      create schema auth; create schema private;
      create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,raw_user_meta_data jsonb);
      create table auth.identities(user_id uuid references auth.users on delete cascade,provider text);
      create function auth.uid() returns uuid language sql stable as
        $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      grant usage on schema public,auth,private to authenticated;`);
    for(const migration of migrations)
      await sql.unsafe(await readFile(new URL('../../supabase/migrations/'+migration,import.meta.url),'utf8'));

    const runId=randomUUID(),roles=['A','B'];
    const owners=Object.fromEntries(roles.map(role=>[role,{id:randomUUID(),email:'scratch-fee-'+role.toLowerCase()+'@example.invalid',runMarker:runId}]));
    const students=Object.fromEntries(roles.map(role=>[role,{id:randomUUID(),user_id:owners[role].id}]));
    for(const {id,email} of Object.values(owners)){
      await sql.unsafe("insert into auth.users values($1,$2,now(),jsonb_build_object('assistant_evaluation_run',$3::text))",[id,email,runId]);
      await sql.unsafe("insert into auth.identities values($1,'google')",[id]);
      await sql.unsafe("insert into public.affairs_profiles(user_id,email,display_name) values($1,$2,'Scratch Student')",[id,email]);
    }
    for(const {id,user_id} of Object.values(students))
      await sql.unsafe("insert into public.affairs_students(id,user_id,student_number,full_name,program_id,year_level) select $1,$2,$3,'Scratch Student',id,1 from public.affairs_programs where code='SAMPLE-GEN'",
        [id,user_id,'SCRATCH-'+id]);
    const identities=await sql.unsafe("select id,email,raw_user_meta_data->>'assistant_evaluation_run' as \"runMarker\" from auth.users order by id");
    const linked=await sql.unsafe('select id,user_id from public.affairs_students order by id');

    const queryErrors=[];
    const transport={async unsafe(text,parameters){
      try{return await sql.unsafe(text,parameters);}
      catch(error){queryErrors.push(error.code);throw error;}
    }};
    const read=input=>readRows(transport,input);
    const tx={readRows:read,insertRows:input=>insertRows(transport,input),deleteRows:input=>deleteRows(transport,input)};
    const journals=[],nativeViews=[];
    const life=createFeeRemissionFixtureLifecycle({
      assertLease:async binding=>binding.runId===runId&&binding.projectRef===feeRemissionLivePlanManifest.projectRef,
      readIdentities:async()=>({identities,students:linked}),readRows:read,
      transaction:async work=>{
        await sql.unsafe('begin');
        try{await work(tx);await sql.unsafe('commit');}
        catch(error){await sql.unsafe('rollback');throw error;}
      },
      writeJournal:async value=>{journals.push(value);return true;},
      readNative:async({role,view})=>reader.begin(async caller=>{
        await caller.unsafe('set local role authenticated');
        const userId=owners[role].id,other=roles.find(item=>item!==role);
        await caller.unsafe("select set_config('request.jwt.claim.sub',$1,true)",[userId]);
        nativeViews.push({role,view});
        if(view==='feeRemission'){
          assert.equal((await caller.unsafe('select id from public.affairs_fee_remission where user_id=$1',[owners[other].id])).length,0);
          const [{value}]=await caller.unsafe('select public.affairs_read_fee_remission() as value');
          return value;
        }
        assert.equal((await caller.unsafe('select id from public.affairs_charges where student_id=$1',[students[other].id])).length,0);
        const charges=await caller.unsafe('select id,label,amount_due::float8 as "amountDue",amount_paid::float8 as "amountPaid",currency,'+
          'due_on::text as "dueOn",source_mode as "sourceMode",occurrence_on::text as "occurrenceOn",category,'+
          'contact_unit as "contactUnit",contact_extension as "contactExtension",payment_unit as "paymentUnit" '+
          'from public.affairs_charges where student_id=$1',[students[role].id]);
        return {checkedAt:new Date().toISOString(),profile:{userId},studentRecordFound:true,charges:[...charges]};
      }),
      readCleanupProof:async input=>{
        const rows=await read(input);
        assert.ok(Object.values(rows).every(items=>items.length===0));
        return {identities,students:linked,
          remainingByTable:Object.fromEntries(feeRemissionLivePlanManifest.tables.map(table=>[table,
            Object.values(owners).map(owner=>({userId:owner.id,count:0}))])),
          reservedByTable:{affairs_fee_remission:0,affairs_charges:0}};
      },
    });

    for(const fixtureKey of feeRemissionLivePlanManifest.families){
      const plan=buildFeeRemissionFixturePlan({runId,owners,students,fixtureKey});
      let staged;
      try{staged=await life.transition(plan);}
      catch(error){assert.fail(error.message+' SQLSTATEs: '+queryErrors.join(', '));}
      assert.equal(staged.verified,true);
      assert.deepEqual(await life.verifyUnchanged(),staged);
      assert.equal(journals.at(-1).phase,'ready');
    }
    assert.equal(nativeViews.length,24);
    assert.deepEqual(await life.cleanup(),{cleaned:true,nativeReads:0});
    assert.equal(journals.at(-1).phase,'cleaned');
    assert.deepEqual(queryErrors,[]);
  });
