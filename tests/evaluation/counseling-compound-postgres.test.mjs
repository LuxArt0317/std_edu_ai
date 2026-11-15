import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {isAbsolute} from 'node:path';
import {test} from 'node:test';
import {pathToFileURL} from 'node:url';
import {createAffairsAssistantHandler} from '../../api/affairs-assistant.ts';
import {buildCounselingCompoundFixture,cleanupCounselingCompoundRows,counselingHostedCases,gradeHostedCounselingCompound,
  observeCounselingFixture,requestCounselingHostedCase,stageCounselingCompoundRows,verifyCounselingFixtureAbsent} from './counseling-appointment-hosted.mjs';
import {observeOwnedChargeCallers,observeOwnedChargeRows,verifyOwnedChargeRowsAbsent} from './internship-charge-fixture.mjs';

const runtime=process.env.STU_COUNSELING_TEST_PGLITE_ENTRY;
const origin='https://xiftudmvxphxcjtmfmib.supabase.co';
const preview='https://stdedu-aaabbb111-v1-d286.vercel.app';
const key='synthetic-counseling-publishable-key';
const prefix='account:counseling-appointments-';
const caseIds=['mixed-tuition','mixed-reversed','negative-counseling'].map(id=>prefix+id);
const chargeFields='id,student_id,label,amount_due,amount_paid,currency,due_on,source_mode,occurrence_on,category,contact_unit,contact_extension,payment_unit';
const foreignLabel='FOREIGN COUNSELING TUITION CONTROL';

function pgliteSql(db){
  return function sql(template,...values){
    if(!template.raw)return {list:template};
    const parameters=[],param=value=>'$'+parameters.push(value);
    const fragment=(value,previous)=>{
      if(!Array.isArray(value?.list))return param(value);
      const rows=value.list;
      if(typeof rows[0]!=='object'){
        if(/select\s+$/u.test(previous)){
          assert.ok(rows.every(column=>/^[a-z_]+$/u.test(column)));
          return rows.join(',');
        }
        return '('+rows.map(param).join(',')+')';
      }
      const columns=Object.keys(rows[0]);
      return '('+columns.join(',')+') values '+rows.map(row=>'('+columns.map(column=>param(row[column])).join(',')+')').join(',');
    };
    const statement=template.reduce((out,part,index)=>out+(index?fragment(values[index-1],template[index-1]):'')+part,'');
    return db.query(statement,parameters).then(result=>result.rows);
  };
}

test('frozen appointment and tuition compounds agree with two migrated caller scopes',
  {skip:!runtime,timeout:30000},async t=>{
    assert.ok(isAbsolute(runtime));
    const {PGlite}=await import(pathToFileURL(runtime).href),db=new PGlite(),sql=pgliteSql(db);
    const previousKey=process.env.OPENAI_API_KEY;
    process.env.OPENAI_API_KEY='SYNTHETIC_COUNSELING_REVIEW';
    t.after(async()=>{
      if(previousKey===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=previousKey;
      await db.close();
    });
    await db.exec(`create role anon; create role authenticated; create role service_role;
      create schema auth; create schema private; create schema extensions;
      create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,raw_user_meta_data jsonb,deleted_at timestamptz,banned_until timestamptz);
      create table auth.identities(user_id uuid references auth.users on delete cascade,provider text);
      create function auth.uid() returns uuid language sql stable as
        $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      grant usage on schema public,auth,private to authenticated; set timezone='UTC';`);
    for(const file of ['20261105010000_school_affairs_workspace.sql','20261105020000_dtm_sample_workspace.sql',
      '20261106010000_affairs_academic_records.sql','20261112080000_pending_fees.sql','20261115000000_counseling_appointments.sql'])
      await db.exec(await readFile(new URL('../../supabase/migrations/'+file,import.meta.url),'utf8'));

    const runId=randomUUID(),owners={A:{id:randomUUID(),email:'counseling-a@example.invalid',runMarker:runId},
      B:{id:randomUUID(),email:'counseling-b@example.invalid',runMarker:runId}};
    const {rows:[program]}=await db.query("select id from public.affairs_programs where code='SAMPLE-GEN'");
    const plan=buildCounselingCompoundFixture({runId,owners,programId:program.id});
    const {appointmentPlan,chargePlan}=plan;
    const users=chargePlan.students.map(student=>({id:student.user_id,studentId:student.id,token:'local-counseling-token-'+student.user_id}));
    const saved=chargePlan.charges[0];
    const as=(owner,read)=>db.transaction(async tx=>{
      await tx.exec('set local role authenticated');
      await tx.query("select set_config('request.jwt.claim.sub',$1,true)",[owner]);
      return read(tx);
    });
    for(const owner of Object.values(owners)){
      await db.query('insert into auth.users values($1,$2,now(),$3,null,null)',[owner.id,owner.email,{assistant_evaluation_run:runId}]);
      await db.query("insert into auth.identities values($1,'google')",[owner.id]);
    }
    await db.transaction(tx=>cleanupCounselingCompoundRows(pgliteSql(tx),plan));
    await db.transaction(tx=>stageCounselingCompoundRows(pgliteSql(tx),plan));

    const readResponse=async(response,url,maxBytes)=>{
      assert.equal(response.status,200,url.pathname);
      const text=await response.text();
      assert.ok(Buffer.byteLength(text)<=maxBytes);
      return JSON.parse(text);
    };
    async function counseling(owner){
      return as(owner,async tx=>(await tx.query("select public.affairs_read_counseling('mine') as value")).rows[0].value);
    }
    const callerFrom=init=>users.find(user=>new Headers(init?.headers).get('authorization')==='Bearer '+user.token);
    async function readCharges(user,target){
      const columns=chargeFields.replace('due_on,','due_on::text,').replace('occurrence_on,','occurrence_on::text,');
      const rows=await as(user.id,async tx=>(await tx.query(`select ${columns} from public.affairs_charges
        where student_id=$1 order by occurrence_on desc nulls last,id asc limit 500`,[target])).rows);
      return rows.map(row=>({...row,amount_due:Number(row.amount_due),amount_paid:Number(row.amount_paid)}));
    }
    const readStudent=(caller,owner)=>as(caller.id,async tx=>(await tx.query(
      'select id,user_id from public.affairs_students where user_id=$1 limit 1',[owner])).rows);
    async function observe(){
      const appointments=await observeCounselingFixture(appointmentPlan,{
        sql,users,origin:preview,readResponse,knownIds:appointmentPlan.recordIds,
        async fetchImpl(url,init){
          assert.equal(url.origin,preview);assert.equal(url.pathname,'/api/affairs-data');
          assert.deepEqual(Object.fromEntries(url.searchParams),{scope:'counseling-appointments',view:'mine'});
          assert.equal(init.method,'GET');const user=callerFrom(init);assert.ok(user);
          return Response.json(await counseling(user.id));
        },
      });
      const charges={rowsDigest:await observeOwnedChargeRows(sql,chargePlan),
        ...await observeOwnedChargeCallers(chargePlan,{callers:users,publishableKey:key,readResponse,
          async fetchImpl(url,init){
            assert.equal(url.origin,origin);assert.equal(init.method,'GET');
            const user=callerFrom(init);assert.ok(user);
            if(url.pathname==='/rest/v1/affairs_students'){
              const owner=users.find(item=>'eq.'+item.id===url.searchParams.get('user_id'));
              assert.ok(owner);
              assert.deepEqual(Object.fromEntries(url.searchParams),{select:'id,user_id',user_id:'eq.'+owner.id,limit:'1'});
              return Response.json(await readStudent(user,owner.id));
            }
            assert.equal(url.pathname,'/rest/v1/affairs_charges');
            const owner=users.find(item=>'eq.'+item.studentId===url.searchParams.get('student_id'));
            assert.ok(owner);
            assert.deepEqual(Object.fromEntries(url.searchParams),{select:chargeFields,student_id:'eq.'+owner.studentId,
              order:'occurrence_on.desc.nullslast,id.asc',limit:'500',offset:'0'});
            return Response.json(await readCharges(user,owner.studentId));
          },
        })};

      return {appointments,charges};
    }
    const initial=await observe();
    assert.deepEqual(initial.appointments.counts,[3,1]);
    let reads=[],reviews=[],errors=[],reviewMode='accept';
    const caller=users[0];
    const account={url:origin,key,token:caller.token,user:{id:caller.id}};
    t.mock.method(globalThis,'fetch',async(input,init)=>{
      try{
        const url=new URL(String(input));
        if(url.href==='https://api.openai.com/v1/responses'){
          const request=JSON.parse(init.body),name=request.text.format.name;
          assert.equal(name,'answer_evidence_review');reviews.push(name);
          if(reviewMode==='quota')return Response.json({error:{code:'insufficient_quota'}},{status:429});
          const packet=JSON.parse(request.input[0].content[0].text);
          const sources=packet.evidence.filter(item=>item.id.startsWith('account:'));
          assert.deepEqual(sources.map(row=>row.id).sort(),reads.includes('appointments')
            ?['account:charges','account:counselingAppointments']:['account:charges']);
          assert.doesNotMatch(JSON.stringify(sources),/FOREIGN COUNSELING TUITION CONTROL|2027-01-(?:19|20)/u);
          const claims=sources.flatMap(source=>{
            const records=JSON.parse(source.content).records;
            if(source.id==='account:charges'){
              assert.equal(records.length,1);assert.equal(records[0].label,saved.label);
              return [{claim:'The named fee has NT$23,000 remaining.',evidenceId:source.id,quotes:[],
                jsonPaths:['/records/0/amountDue','/records/0/amountPaid'],supported:true}];
            }
            return records.map((row,index)=>({claim:row.preferredOn+' is a stored preferred date.',evidenceId:source.id,
              quotes:[],jsonPaths:['/records/'+index+'/preferredOn'],supported:true}));
          });
          return Response.json({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify({
            supported:reviewMode==='accept',answersQuestion:reviewMode==='accept',claims:reviewMode==='accept'?claims:[],
          })}]}]});
        }
        assert.equal(url.origin,origin);assert.equal(callerFrom(init),caller);
        if(url.pathname==='/rest/v1/rpc/affairs_read_counseling'){
          assert.equal(init.method,'POST');assert.deepEqual(JSON.parse(init.body),{p_view:'mine'});
          reads.push('appointments');
          return Response.json(await counseling(caller.id));
        }
        assert.equal(init.method,'GET');
        if(url.pathname==='/rest/v1/affairs_students'){
          assert.deepEqual(Object.fromEntries(url.searchParams),{select:'id,user_id',user_id:'eq.'+caller.id,limit:'1'});
          reads.push('student');
          return Response.json(await readStudent(caller,caller.id));
        }
        assert.equal(url.pathname,'/rest/v1/affairs_charges');
        assert.deepEqual(Object.fromEntries(url.searchParams),{select:chargeFields,student_id:'eq.'+caller.studentId,
          order:'occurrence_on.desc.nullslast,id.asc',limit:'500',offset:'0'});
        reads.push('charges');
        const rows=await readCharges(caller,caller.studentId);
        return Response.json(rows,{headers:{'content-range':'0-'+(rows.length-1)+'/'+rows.length}});
      }catch(error){errors.push(error);throw error;}
    });
    const handler=createAffairsAssistantHandler({
      verifyToken:async token=>{assert.equal(token,caller.token);return account;},
      loadSnapshot:async()=>assert.fail('Scoped inquiries cannot load the broad workspace.'),
      publicResearch:async()=>assert.fail('Private inquiries cannot search the public web.'),
    });
    const rows=counselingHostedCases({compound:true}),correlationIds=new Set();
    assert.deepEqual(rows.map(row=>row.id),caseIds);
    for(reviewMode of ['accept','reject','quota','absent']){
      if(reviewMode==='absent')delete process.env.OPENAI_API_KEY;
      for(const row of rows){
        const before=await observe();
        reads=[];reviews=[];errors=[];
        const {envelope}=await requestCounselingHostedCase({testCase:row,origin:preview,token:caller.token,
          privateMarkers:[foreignLabel,...chargePlan.recordIds,...appointmentPlan.recordIds],correlationIds,
          async fetchImpl(url,init){
            assert.equal(url.href,preview+'/api/affairs-assistant');assert.equal(init.method,'POST');
            const frames=[],headers=new Headers();let status=200;
            const response={status(value){status=value;return response;},setHeader(name,value){headers.set(name,value);},
              write(value){frames.push(value);},end(){},json(){assert.fail('The assistant must stream a terminal result.');}};
            await handler({method:init.method,headers:{authorization:init.headers.Authorization},body:JSON.parse(init.body)},response);
            return new Response(frames.join(''),{status,headers});
          },
        });
        const after=await observe();
        assert.deepEqual(before,initial);assert.deepEqual(after,before);
        const result=gradeHostedCounselingCompound(row,envelope,before,after);
        const name=reviewMode+' '+row.id, excluded=row.id.endsWith('-negative-counseling');
        const attempts=reviewMode==='accept'?1:2;
        assert.deepEqual(errors,[],name);
        assert.equal(result.passed,true,JSON.stringify({name,failures:result.failures}));
        assert.equal(result.attempts,attempts,name);
        const selectedReads=[...(excluded?[]:['appointments']),'charges','student'];
        assert.deepEqual(reads.toSorted(),Array.from({length:attempts},()=>selectedReads).flat().sort(),name);
        assert.deepEqual(reviews,reviewMode==='absent'?[]:['answer_evidence_review'],name);
        if(attempts===2)assert.ok(envelope.events.some(step=>step.status==='complete'&&step.kind===
          (excluded?'fee-balance-evidence-check':'counseling-appointment-evidence-check')),name);
        assert.equal(gradeHostedCounselingCompound(row,envelope,before,{...after,charges:{...after.charges,checks:7}}).passed,false);
        t.diagnostic(name+' passed with stable selected records');
      }
    }
    // Reconcile the same journal after an interrupted setup or cleanup. Unknown
    // charge changes must abort both deletions until independent review.
    await db.query('update public.affairs_charges set amount_paid = $1 where id = $2',[1,saved.id]);
    await assert.rejects(db.transaction(tx=>cleanupCounselingCompoundRows(pgliteSql(tx),plan)),/unrecognized/i);
    assert.deepEqual((await counseling(users[0].id)).rows.length,3);
    await db.query('update public.affairs_charges set amount_paid = $1 where id = $2',[saved.amount_paid,saved.id]);
    await db.transaction(tx=>cleanupCounselingCompoundRows(pgliteSql(tx),plan));
    await db.transaction(tx=>cleanupCounselingCompoundRows(pgliteSql(tx),plan));
    await verifyOwnedChargeRowsAbsent(sql,chargePlan);
    await verifyCounselingFixtureAbsent(sql,appointmentPlan);
    for(const user of users)await db.query('delete from auth.users where id=$1',[user.id]);
    for(const table of ['auth.users','public.affairs_profiles','public.affairs_students','public.affairs_charges','public.affairs_counseling_appointments']){
      const rows=await db.query('select count(*)::integer as count from '+table);
      assert.equal(rows.rows[0].count,0,table);
    }
  });
