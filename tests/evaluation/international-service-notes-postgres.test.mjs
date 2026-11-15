import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {lstat,readFile,realpath} from 'node:fs/promises';
import {join} from 'node:path';
import {test} from 'node:test';
import postgres from 'postgres';
import {createAffairsAssistantHandler} from '../../api/affairs-assistant.ts';
import {internationalServiceNoteCasePrefix,serviceNoteCaseManifest} from './service-note-cases.mjs';
import {buildServiceNotePlan,changeServiceNoteRows,observeServiceNoteRows,readCallerServiceNotes} from './service-note-live-fixture.mjs';
import {gradeLiveServiceNoteCase,serviceNoteRunnerCases} from './service-note-runner.mjs';
import {readReply} from './run.mjs';

const socket=process.env.STU_INTERNATIONAL_NOTES_TEST_PG_SOCKET;
const project='xiftudmvxphxcjtmfmib',origin='https://'+project+'.supabase.co';
const key='synthetic-international-notes-publishable-key';
const columns='id,user_id,service_key,record_type,title,notes,status,updated_at';
const allKeys=serviceNoteCaseManifest.services.map(service=>service.id);

test('the ten work permit and campus service cases verify both disposable callers through migrated Postgres',
  {skip:!socket,timeout:30000},async t=>{
    assert.match(socket,/^\/(?:(?:private\/)?var\/tmp|tmp)\/stu100-international-note-pg\.[A-Za-z0-9]{6}\/(?:socket)$/u);
    const directory=await lstat(socket);
    assert.equal(directory.uid,process.getuid());
    assert.equal(directory.mode&0o777,0o700);
    assert.equal(await realpath(socket),socket);
    assert.ok((await lstat(join(socket,'.s.PGSQL.5432'))).isSocket());
    const connect=database=>postgres({host:socket,user:'postgres',database,max:1,ssl:false,connect_timeout:3,
      onnotice:()=>{},connection:{application_name:'stu-international-note-local-test',statement_timeout:5000}});
    const admin=connect('postgres'),database='intl_notes_'+randomUUID().replaceAll('-','');
    await admin.unsafe('create database '+database);
    const pool=connect(database),reader=connect(database),sql=await pool.reserve();
    t.after(async()=>{
      sql.release();
      await Promise.all([pool.end(),reader.end()]);
      try{
        await admin.unsafe('drop database '+database);
        assert.equal((await admin`select datname from pg_catalog.pg_database where datname=${database}`).length,0);
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
      grant usage on schema public,auth,private to authenticated; set timezone='UTC';`);
    for(const file of ['20261105010000_school_affairs_workspace.sql','20261105020000_dtm_sample_workspace.sql',
      '20261106010000_affairs_academic_records.sql','20261112010000_student_workspace.sql','20261112020000_leave_application_fields.sql'])
      await sql.unsafe(await readFile(new URL('../../supabase/migrations/'+file,import.meta.url),'utf8'));
    const owners=[randomUUID(),randomUUID()],runId=randomUUID();
    const identities=owners.map((id,index)=>({id,email:'international-note-'+index+'@example.invalid',runId,state:'created'}));
    const users=owners.map(id=>({id,token:'synthetic-international-'+id}));
    for(const {id,email} of identities){
      await sql`insert into auth.users values(${id},${email},now(),${sql.json({assistant_evaluation_run:runId})})`;
      await sql`insert into auth.identities values(${id},'google')`;
      await sql`insert into public.affairs_profiles(user_id,email,display_name,role) values(${id},${email},'Fixture student','student')`;
    }
    const [lease]=await sql`select pg_try_advisory_lock(23101314,115100) as held`;
    assert.equal(lease.held,true);
    const as=(id,work)=>reader.begin(async tx=>{
      await tx.unsafe('set local role authenticated');
      await tx`select set_config('request.jwt.claim.sub',${id},true)`;
      return work(tx);
    });
    const scope={runId,owners,identities};
    async function switchRows(previous,next,recovering=false){
      await sql.unsafe('begin');
      try{
        await changeServiceNoteRows(sql,{...scope,previous,next,recovering});
        await sql.unsafe('commit');
      }catch(error){
        await sql.unsafe('rollback');
        throw error;
      }
    }
    async function readNotes(user,owner,keys){
      return as(user.id,tx=>tx`select ${tx(columns.split(','))} from public.affairs_service_records
        where user_id=${owner} and record_type='note' and service_key in ${tx(keys)} order by id limit 16`);
    }
    function notesResponse(rows){
      return Response.json(rows,{headers:{'content-range':rows.length?'0-'+(rows.length-1)+'/'+rows.length:'*/0'}});
    }
    const caller=init=>users.find(user=>new Headers(init?.headers).get('authorization')==='Bearer '+user.token);
    const params=(input,init)=>{
      const url=new URL(String(input)),headers=new Headers(init?.headers);
      assert.equal(url.origin+url.pathname,origin+'/rest/v1/affairs_service_records');assert.equal(init.method,'GET');
      assert.equal(headers.get('apikey'),key);assert.equal(headers.get('prefer'),'count=exact');assert.equal(init.redirect,'error');
      assert.equal(url.searchParams.get('select'),columns);assert.equal(url.searchParams.get('record_type'),'eq.note');
      return url.searchParams;
    };
    const observe=plan=>observeServiceNoteRows({...scope,sql,plan,users,publishable:key,
      read:(user,owner,options)=>readCallerServiceNotes(user,owner,{...options,async fetchImpl(url,init){
        const query=params(url,init);
        assert.equal(caller(init),user);
        assert.deepEqual(Object.fromEntries(query),{select:columns,user_id:'eq.'+owner,record_type:'eq.note',
          service_key:'in.('+allKeys.join(',')+')',order:'id.asc',limit:'16'});
        return notesResponse(await readNotes(user,owner,allKeys));
      }}),
    });

    let current=null,reads=0;
    const unexpected=[];
    t.mock.method(globalThis,'fetch',async (url,init)=>{
      try{
        const query=params(url,init);
        assert.equal(caller(init),users[0]);assert.equal(query.get('user_id'),'eq.'+owners[0]);
        assert.equal(current.serviceBoundary.kind,'tracking');
        const target=current.serviceBoundary.serviceId;
        assert.equal(query.get('service_key'),'eq.'+target);
        reads++;
        return notesResponse(await readNotes(users[0],owners[0],[target]));
      }catch(error){unexpected.push(error);throw error;}
    });
    const handler=createAffairsAssistantHandler({
      verifyToken:async token=>{
        assert.equal(token,users[0].token);
        return {url:origin,key,token,user:{id:owners[0]}};
      },
      loadSnapshot:async()=>assert.fail('This service request must not initialize or load the workspace.'),
      publicResearch:async()=>assert.fail('The owned tracking-note boundary must not search publicly.'),
    });
    const cases=serviceNoteRunnerCases().filter(row=>row.id.startsWith(internationalServiceNoteCasePrefix));
    assert.equal(cases.length,10);
    assert.equal(new Set(cases.map(row=>row.id)).size,10);
    let plan=null;
    for(const row of cases){
      current=row;
      const next=buildServiceNotePlan(row,owners);
      await switchRows(plan,next);
      plan=next;
      assert.equal(plan.rows.length,14);
      const before=await observe(plan),checkpoint=reads;
      const headers=new Headers(),frames=[];
      const response={setHeader(name,value){headers.set(name,value);},status(code){this.code=code;return this;},
        write(chunk){frames.push(chunk);},end(){},json(){assert.fail('The assistant must stream a terminal result.');}};
      await handler({method:'POST',headers:{authorization:'Bearer '+users[0].token},body:{question:row.question,route:row.route,stream:true}},response);
      assert.deepEqual(unexpected,[],row.id);
      const reply=await readReply(new Response(frames.join(''),{headers})),after=await observe(plan);
      assert.equal(after,before,row.id);
      const result=gradeLiveServiceNoteCase(row,{...reply,execution:row.executionContract,fixtureKey:row.fixtureKey,statusCode:response.code,
        stateBefore:{ownedRecordsDigest:before},stateAfterProposal:{ownedRecordsDigest:after},
        fixtureReadback:{projectRef:project,verified:true,independentGolden:true,serviceNotes:{
          caseId:row.id,twoOwnersVerified:true,method:'caller RLS and persisted notes',
        }}});
      assert.equal(result.passed,true,JSON.stringify({caseId:row.id,failures:result.failures}));
      assert.equal(reads-checkpoint,row.serviceBoundary.kind==='tracking'?1:0,row.id);
      t.diagnostic(row.id+' passed with owned and crossed readbacks');
    }
    assert.equal(reads,2);
    await switchRows(plan,null,true);
    for(const user of users){
      assert.equal((await readNotes(user,user.id,allKeys)).length,0);
      await sql`delete from auth.users where id=${user.id}`;
    }
    for(const table of ['auth.users','auth.identities','public.affairs_profiles','public.affairs_service_records']){
      const [row]=await sql`select count(*)::integer as count from ${sql(table)}`;
      assert.equal(row.count,0,table);
    }
    const [released]=await sql`select pg_advisory_unlock(23101314,115100) as released`;
    assert.equal(released.released,true);
  });
