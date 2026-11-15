import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {lstat,readFile,realpath} from 'node:fs/promises';
import {join} from 'node:path';
import {test} from 'node:test';
import postgres from 'postgres';
import {assertStudentLeaveGradePairSchema,buildStudentLeaveGradePairFixture,deleteDtmGradeOverviewRows,observeDtmGradeOverviewRows,
  readDtmGradeOverviewScopes,seedDtmGradeOverviewRows,verifyDtmGradePreviewAbsent} from './dtm-grade-report-preview.mjs';

const socket=process.env.STU_LEAVE_GRADE_TEST_PG_SOCKET;
const migrations=[
  '20261105010000_school_affairs_workspace.sql','20261105020000_dtm_sample_workspace.sql',
  '20261106010000_affairs_academic_records.sql','20261112010000_student_workspace.sql','20261112150000_dtm_submissions.sql',
  '20261114000000_dtm_grade_reports.sql','20261114010000_dtm_course_content.sql',
];

test('paired Moodle grade rows survive exact readback and deny crossed callers on migrated PostgreSQL',
  {skip:!socket,timeout:20000},async t=>{
    assert.match(socket,/^\/(?:(?:private\/)?var\/tmp|tmp)\/stu100-leave-grade-pg\.[A-Za-z0-9]{6}\/socket$/u);
    const dir=await lstat(socket);
    assert.equal(dir.uid,process.getuid());assert.equal(dir.mode&0o777,0o700);
    assert.equal(await realpath(socket),socket);
    assert.ok((await lstat(join(socket,'.s.PGSQL.5432'))).isSocket());
    const use=database=>postgres({host:socket,user:'postgres',database,max:1,ssl:false,connect_timeout:3,onnotice:()=>{},
      connection:{application_name:'stu-leave-grade-local-test',statement_timeout:5000}});
    const admin=use('postgres'),database='leave_grade_'+randomUUID().replaceAll('-','');
    await admin.unsafe('create database '+database);
    const sql=use(database);
    t.after(async()=>{
      await sql.end();
      try{await admin.unsafe('drop database '+database);assert.equal((await admin`select datname from pg_catalog.pg_database where datname=${database}`).length,0);}
      finally{await admin.end();}
    });
    await sql.unsafe(`do $$begin
      if not exists(select 1 from pg_roles where rolname='anon') then create role anon; end if;
      if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if;
      end$$;
      create schema auth;create schema private;create schema storage;
      create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint);
      create table storage.objects(id uuid primary key,bucket_id text,name text,metadata jsonb);
      alter table storage.objects enable row level security;
      create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,raw_user_meta_data jsonb);
      create table auth.identities(provider_id text,user_id uuid references auth.users on delete cascade,identity_data jsonb,provider text);
      create function auth.uid() returns uuid language sql stable as
        $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      grant usage on schema public,auth,private to authenticated,anon;`);
    for(const file of migrations)await sql.unsafe(await readFile(new URL('../../supabase/migrations/'+file,import.meta.url),'utf8'));
    assert.equal(await assertStudentLeaveGradePairSchema(sql),true);
    const runId=randomUUID(),owner=(email)=>({id:randomUUID(),email,runMarker:runId});
    const owners={A:owner('evaluation.student@example.invalid'),B:owner('evaluation.other.'+runId+'@example.invalid')};
    const fixture=buildStudentLeaveGradePairFixture(runId,owners);
    for(const account of Object.values(owners)){
      await sql`insert into auth.users values(${account.id},${account.email},now(),${sql.json({assistant_evaluation_run:runId})})`;
      await sql`insert into auth.identities values(${account.id},${account.id},${sql.json({sub:account.id,email:account.email,email_verified:true})},'google')`;
    }
    const seeded=await sql.begin(tx=>seedDtmGradeOverviewRows(tx,fixture));
    const users=Object.values(owners).map(account=>({id:account.id,token:'OFFLINE_'+account.id}));
    const overviewOrigin='https://stdedu-1234abcde-v1-d286.vercel.app';
    const calls=[];
    const withCaller=(actor,fn)=>sql.begin(async tx=>{
      await tx.unsafe('set local role authenticated');
      await tx`select set_config('request.jwt.claim.sub',${actor},true)`;
      return fn(tx);
    });
    const readback=()=>readDtmGradeOverviewScopes(fixture,users,{origin:overviewOrigin,async fetchImpl(url,init){
      assert.equal(url.origin,overviewOrigin);assert.equal(url.pathname,'/api/affairs-data');
      assert.equal(init.method,'GET');assert.equal(init.redirect,'error');
      const actor=users.find(user=>init.headers.Authorization==='Bearer '+user.token)?.id;
      assert.ok(actor);calls.push(url.searchParams.get('scope'));
      return withCaller(actor,async tx=>{
        if(url.searchParams.get('scope')==='dtm-grade-report-overview'){
          const [row]=await tx`select public.dtm_grade_report_overview() as result`;
          return Response.json(row.result);
        }
        const courseId=url.searchParams.get('course_id');
        assert.equal(url.searchParams.get('scope'),'dtm-grade-report');
        const [course]=await tx`select user_id from public.dtm_courses where id=${courseId}`;
        const reports=await tx`select id,user_id,course_id,source_mode,version,
          pg_catalog.to_jsonb(created_at)#>>'{}' as "createdAt",pg_catalog.to_jsonb(updated_at)#>>'{}' as "updatedAt",report
          from public.dtm_grade_reports where course_id=${courseId}`;
        if(!course){assert.equal(reports.length,0);return Response.json({error:'This course is not available to your account.'},{status:403});}
        assert.equal(course.user_id,actor);assert.equal(reports.length,1);
        const {user_id,course_id,source_mode,report,...rest}=reports[0];
        return Response.json({report:{...rest,userId:user_id,courseId:course_id,sourceMode:source_mode,...report}});
      });
    },async readResponse(response,_url,_max,status){assert.equal(response.status,status);return response.json();}});
    const first=await readback();
    assert.equal(await readback(),first);
    assert.deepEqual(calls,Array.from({length:4},()=>['dtm-grade-report-overview','dtm-grade-report','dtm-grade-report']).flat());
    assert.equal(await observeDtmGradeOverviewRows(sql,fixture),seeded);
    await sql.begin(tx=>deleteDtmGradeOverviewRows(tx,fixture));
    await sql`delete from auth.users where id in ${sql(users.map(user=>user.id))}`;
    assert.equal(await verifyDtmGradePreviewAbsent(sql,fixture),true);
  });
