import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {isAbsolute} from 'node:path';
import {test} from 'node:test';
import {pathToFileURL} from 'node:url';
import {createAffairsAssistantHandler} from '../../api/affairs-assistant.ts';
import {buildPlannedTutorEvaluationCases,buildTutorEvaluationCases,tutorEvaluationFixtureForCase,tutorEvaluationVisibleChecks} from './tutor-evaluation-cases.mjs';
import {buildTutorEvaluationHostedFixture} from './tutor-evaluation-hosted.mjs';
import {buildTutorChargeFixture,cleanupOwnedChargeRows,observeOwnedChargeCallers,observeOwnedChargeRows,
  verifyOwnedChargeRowsAbsent} from './internship-charge-fixture.mjs';
import {gradeHostedTutorTuition,stageTutorTuitionRows,tutorTuitionHostedCases} from './tutor-tuition-hosted.mjs';
import {gradeCase} from './grading.mjs';
import {readReply} from './run.mjs';

const runtime=process.env.STU_TUTOR_TUITION_TEST_PGLITE_ENTRY;
const origin='https://xiftudmvxphxcjtmfmib.supabase.co';
const publishable='synthetic-tutor-tuition-publishable-key';
const caseIds=['mixed-tuition','mixed-reversed','negative-tutor'].map(suffix=>'account:tutor-evaluation-'+suffix);
const studentProjection='id,user_id';
const chargeProjection='id,student_id,label,amount_due,amount_paid,currency,due_on,source_mode,occurrence_on,category,contact_unit,contact_extension,payment_unit';
const tutorPath='/school-affairs/services/28-1',feePath='/school-affairs/services/39-1';
const digest=rows=>createHash('sha256').update(JSON.stringify(rows)).digest('hex');

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

test('frozen Tutor and named tuition requests verify separate persisted records and both callers on PostgreSQL',
  {skip:!runtime,timeout:30000},async t=>{
    assert.ok(isAbsolute(runtime));
    const {PGlite}=await import(pathToFileURL(runtime).href),db=new PGlite();
    const previousKey=process.env.OPENAI_API_KEY;
    process.env.OPENAI_API_KEY='SYNTHETIC_PROVIDER_MUST_NOT_BE_USED';
    t.after(async()=>{
      if(previousKey===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=previousKey;
      await db.close();
    });
    await db.exec(`create role anon; create role authenticated; create role service_role;
      create schema auth; create schema private;
      create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,raw_user_meta_data jsonb);
      create table auth.identities(user_id uuid references auth.users on delete cascade,provider text);
      create function auth.uid() returns uuid language sql stable as
        $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      grant usage on schema public,auth,private to authenticated; set timezone='UTC';`);
    for(const file of ['20261105010000_school_affairs_workspace.sql','20261105020000_dtm_sample_workspace.sql',
      '20261106010000_affairs_academic_records.sql','20261112080000_pending_fees.sql','20261114050000_tutor_evaluations.sql'])
      await db.exec(await readFile(new URL('../../supabase/migrations/'+file,import.meta.url),'utf8'));
    const cases=buildPlannedTutorEvaluationCases().filter(row=>caseIds.includes(row.id));
    assert.deepEqual(cases.map(row=>row.id),caseIds);
    const canonical=buildTutorEvaluationCases().find(row=>row.id===caseIds[0]);
    const independent=tutorEvaluationFixtureForCase(canonical);
    const runId=randomUUID(),users=['A','B'].map(role=>({role,id:randomUUID(),email:'tutor-fee-'+role.toLowerCase()+'@example.invalid',
      runMarker:runId,token:'synthetic-tutor-fee-'+randomUUID()}));
    const owners=Object.fromEntries(users.map(({role,id,email,runMarker})=>[role,{id,email,runMarker}]));
    const tutorPlan=buildTutorEvaluationHostedFixture({runId,owners,fixtureKey:'tutorEvaluation'});
    const {rows:[program]}=await db.query("select id from public.affairs_programs where code='SAMPLE-GEN'");
    const charges=[independent.charges[0],{label:independent.charges[0].label,amountDue:19500,amountPaid:3000,currency:'TWD',sourceMode:'sample'}];
    const chargePlan=buildTutorChargeFixture({runId,owners:{A:owners.A.id,B:owners.B.id},programId:program.id});
    for(const [index,user] of users.entries()){
      const tutor=tutorPlan.rows.find(row=>row.user_id===user.id);
      user.studentId=chargePlan.students[index].id;
      user.chargeId=chargePlan.charges[index].id;
      await db.query('insert into auth.users values($1,$2,now(),$3)',[user.id,user.email,{assistant_evaluation_run:runId}]);
      await db.query("insert into auth.identities values($1,'google')",[user.id]);
      await db.query(`insert into public.affairs_tutor_evaluations(user_id,questionnaire_version,ratings,comment,request_id,submitted_at)
        values($1,1,$2,$3,$4,$5)`,[user.id,tutor.ratings,tutor.comment,tutor.request_id,tutor.submitted_at]);
    }
    await db.transaction(tx=>stageTutorTuitionRows(pgliteSql(tx),{owners,plan:chargePlan}));
    const as=(user,read)=>db.transaction(async tx=>{
      await tx.exec('set local role authenticated');
      await tx.query("select set_config('request.jwt.claim.sub',$1,true)",[user.id]);
      return read(tx);
    });
    const ownTutor=user=>as(user,async tx=>(await tx.query('select public.affairs_read_tutor_evaluation() as data')).rows[0].data);
    const readStudent=(user,owner)=>as(user,async tx=>(await tx.query(
      'select id,user_id from public.affairs_students where user_id=$1 limit 1',[owner.id])).rows);
    const readFees=(user,owner)=>as(user,async tx=>(await tx.query(`select ${chargeProjection} from public.affairs_charges
      where student_id=$1 order by occurrence_on desc nulls last,id asc limit 500`,[owner.studentId])).rows
      .map(row=>({...row,amount_due:Number(row.amount_due),amount_paid:Number(row.amount_paid)})));
    async function observe(){
      const results=[];
      for(const [index,user] of users.entries()){
        const other=users[1-index],tutor=await ownTutor(user),fees=await readFees(user,user);
        const fixture=tutorPlan.rows.find(row=>row.user_id===user.id);
        assert.equal(tutor.userId,user.id);
        assert.equal(tutor.student,null);
        assert.deepEqual(tutor.evaluation,{ratings:fixture.ratings,comment:fixture.comment,submittedAt:fixture.submitted_at.replace(/Z$/u,'+00:00')});
        assert.deepEqual(await readStudent(user,user),[{id:user.studentId,user_id:user.id}]);
        assert.deepEqual(fees.map(row=>({id:row.id,studentId:row.student_id,label:row.label,amountDue:Number(row.amount_due),
          amountPaid:Number(row.amount_paid),currency:row.currency,sourceMode:row.source_mode})),
        [{id:user.chargeId,studentId:user.studentId,...charges[index]}]);
        assert.deepEqual(await readStudent(user,other),[]);
        assert.deepEqual(await readFees(user,other),[]);
        assert.deepEqual(await as(user,async tx=>(await tx.query('select user_id from public.affairs_tutor_evaluations where user_id=$1',[other.id])).rows),[]);
        results.push({tutor,fees});
      }
      const chargeProof={rowsDigest:await observeOwnedChargeRows(pgliteSql(db),chargePlan),
        ...await observeOwnedChargeCallers(chargePlan,{callers:users,publishableKey:publishable,
          async readResponse(response){assert.equal(response.status,200);return response.json();},
          async fetchImpl(url,init){
            assert.equal(url.origin,origin);
            assert.equal(init.method,'GET');
            const caller=users.find(user=>init.headers.Authorization==='Bearer '+user.token);
            assert.ok(caller);
            if(url.pathname==='/rest/v1/affairs_students'){
              const target=users.find(user=>url.searchParams.get('user_id')==='eq.'+user.id);
              assert.ok(target);
              return Response.json(await readStudent(caller,target));
            }
            assert.equal(url.pathname,'/rest/v1/affairs_charges');
            const target=users.find(user=>url.searchParams.get('student_id')==='eq.'+user.studentId);
            assert.ok(target);
            return Response.json(await readFees(caller,target));
          },
        })};
      const tutorScopes=results.map(({tutor},index)=>({role:users[index].role,visibleRows:1,projectionSha256:digest(tutor.evaluation)}));
      return {results,hosted:{rowsDigest:digest(results.map(row=>row.tutor.evaluation)),callers:tutorScopes,charges:chargeProof}};
    }
    const initial=await observe();
    const calls=[],errors=[];
    let caller=users[0],outage=null;
    t.mock.method(globalThis,'fetch',async(input,init)=>{
      try{
        const url=new URL(String(input)),headers=new Headers(init.headers);
        assert.equal(url.origin,origin,'The native reply must not go through the provider or public search.');
        assert.equal(headers.get('authorization'),'Bearer '+caller.token);
        assert.equal(headers.get('apikey'),publishable);
        assert.equal(init.redirect,'error');
        if(url.pathname==='/rest/v1/rpc/affairs_read_tutor_evaluation'){
          assert.equal(init.method,'POST');
          assert.equal(init.body,'{}');
          assert.equal(url.search,'');
          calls.push('tutorEvaluation');
          return outage==='tutorEvaluation'?Response.json({}, {status:503}):Response.json(await ownTutor(caller));
        }
        assert.equal(init.method,'GET');
        if(url.pathname==='/rest/v1/affairs_students'){
          assert.deepEqual(Object.fromEntries(url.searchParams),{select:studentProjection,user_id:'eq.'+caller.id,limit:'1'});
          calls.push('student');
          return Response.json(await readStudent(caller,caller));
        }
        assert.equal(url.pathname,'/rest/v1/affairs_charges');
        assert.deepEqual(Object.fromEntries(url.searchParams),{select:chargeProjection,student_id:'eq.'+caller.studentId,
          order:'occurrence_on.desc.nullslast,id.asc',limit:'500',offset:'0'});
        calls.push('charges');
        return outage==='charges'?Response.json({}, {status:503}):Response.json(await readFees(caller,caller));
      }catch(error){errors.push(error);throw error;}
    });
    const serve=createAffairsAssistantHandler({
      verifyToken:async token=>{
        assert.equal(token,caller.token);
        return {url:origin,key:publishable,token,user:{id:caller.id}};
      },
      loadSnapshot:async()=>assert.fail('Unexpected broad read'),
      publicResearch:async()=>assert.fail('Unexpected public lookup'),
    });
    async function ask(row){
      calls.length=0;
      const frames=[],headers=new Headers();
      const response={code:200,setHeader(name,value){headers.set(name,value);},status(code){this.code=code;return this;},
        write(value){frames.push(value);},end(){},json(){assert.fail('Expected streamed result');}};
      await serve({method:'POST',headers:{authorization:'Bearer '+caller.token},
        body:{question:row.question,route:row.route,history:row.history??[],stream:true}},response);
      assert.deepEqual(errors,[]);
      assert.equal(response.code,200);
      return readReply(new Response(frames.join(''),{headers,status:response.code}));
    }
    for(const row of cases){
      const before=await observe();
      const envelope=await ask(row),after=await observe();
      assert.deepEqual(after,before);
      const result=gradeCase(row,{...envelope,statusCode:200,execution:'deterministic',fixtureKey:row.fixtureKey,
        fixtureReadback:{verified:true,independentGolden:true},
        stateBefore:{ownedRecordsDigest:digest(before)},stateAfterProposal:{ownedRecordsDigest:digest(after)}});
      assert.equal(result.passed,true,JSON.stringify({caseId:row.id,failures:result.failures}));
      assert.ok(tutorEvaluationVisibleChecks(row,envelope.body).every(check=>check.passed));
      const excluded=row.id===caseIds[2];
      const hosted=tutorTuitionHostedCases().find(item=>item.id===row.id);
      const hostedScore=gradeHostedTutorTuition(hosted,{...envelope,statusCode:200,execution:'deterministic',fixtureKey:hosted.fixtureKey},
        before.hosted,after.hosted);
      assert.equal(hostedScore.passed,true,JSON.stringify(hostedScore.failures));
      assert.deepEqual([...calls].sort(),excluded?['charges','student']:['charges','student','tutorEvaluation']);
      assert.deepEqual(envelope.body.verification,{status:'verified',attempts:1});
      assert.deepEqual(envelope.body.citations.map(row=>row.url).sort(),excluded?[feePath]:[tutorPath,feePath]);
      assert.doesNotMatch(JSON.stringify(envelope.body),/16,500|FOREIGN TUTOR COMMENT/u);
      if(!excluded){
        const balance=envelope.body.answer.indexOf('QA Tutor Tuition instalment');
        const status=envelope.body.answer.indexOf('Your tutor evaluation is saved');
        assert.ok(balance>=0&&status>=0&&(row.id===caseIds[0]?status<balance:balance<status));
      }
      t.diagnostic(row.id+' passed the unchanged rubric');
    }
    for(outage of ['tutorEvaluation','charges']){
      const envelope=await ask(cases[0]);
      assert.deepEqual([...calls].sort(),['charges','student','tutorEvaluation']);
      assert.deepEqual(envelope.body.verification,{status:'verified',attempts:1});
      assert.equal(envelope.body.grounding.degraded,true);
      if(outage==='tutorEvaluation'){
        assert.match(envelope.body.answer,/submission status is unknown/u);
        assert.match(envelope.body.answer,/23,000/u);
        assert.doesNotMatch(envelope.body.answer,/Your tutor evaluation is saved|no saved submission/u);
      }else{
        assert.match(envelope.body.answer,/Your tutor evaluation is saved/u);
        assert.match(envelope.body.answer,/amount due and payments remain unknown/u);
        assert.doesNotMatch(envelope.body.answer,/23,000/u);
      }
    }
    outage=null;caller=users[1];
    const other=await ask(cases[1]);
    assert.deepEqual(other.body.verification,{status:'verified',attempts:1});
    assert.match(other.body.answer,/16,500/u);
    assert.doesNotMatch(other.body.answer,/23,000|FOREIGN TUTOR COMMENT/u);
    assert.deepEqual(await observe(),initial);
    const altered=chargePlan.charges[1];
    await db.query('update public.affairs_charges set amount_paid=20 where id=$1',[altered.id]);
    await assert.rejects(db.transaction(tx=>cleanupOwnedChargeRows(pgliteSql(tx),chargePlan)),/unrecognized charge or student rows/u);
    assert.equal((await readFees(users[0],users[0])).length,1);
    assert.equal((await readFees(users[1],users[1]))[0].amount_paid,20);
    await db.query('update public.affairs_charges set amount_paid=$1 where id=$2',[altered.amount_paid,altered.id]);
    await db.transaction(tx=>cleanupOwnedChargeRows(pgliteSql(tx),chargePlan));
    await verifyOwnedChargeRowsAbsent(pgliteSql(db),chargePlan);
    await db.query('delete from auth.users where id=any($1::uuid[])',[users.map(user=>user.id)]);
    for(const table of ['auth.users','auth.identities','public.affairs_profiles','public.affairs_students','public.affairs_charges','public.affairs_tutor_evaluations'])
      assert.equal((await db.query('select count(*)::integer as count from '+table)).rows[0].count,0,table);
  });
