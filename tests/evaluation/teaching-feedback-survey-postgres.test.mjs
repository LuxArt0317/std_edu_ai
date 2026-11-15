import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {isAbsolute} from 'node:path';
import {test} from 'node:test';
import {pathToFileURL} from 'node:url';
import {createAffairsAssistantHandler} from '../../api/affairs-assistant.ts';
import {readTeachingFeedbackEvidence} from '../../server/accountTeachingFeedbackEvidence.js';
import {buildTeachingFeedbackNativeCases,gradeTeachingFeedbackNativeCase,teachingFeedbackNativeFixtureForCase} from './teaching-feedback-native-cases.mjs';

const runtime=process.env.STU_TEACHING_TEST_PGLITE_ENTRY;
const idPrefix='account:teaching-native-';
const ids=['survey-status','course-completion','survey-windows','survey-phases','survey-zh',
  'immediate-status','immediate-comment','without-comment','immediate-times','both-views','history-followup','exclude-survey',
  'review-not-delivery','survey-link','immediate-link','anonymous-responses','manager-results','submit-survey','submit-feedback',
  'foreign-survey','foreign-immediate','foreign-postfix','foreign-zh','read-failure','one-view-failure','markup-comment','empty-survey','empty-immediate','excluded-native'];
const frozen=buildTeachingFeedbackNativeCases();
const cases=ids.map(id=>frozen.find(row=>row.id===idPrefix+id));
const migrations=['20261105010000_school_affairs_workspace.sql','20261105020000_dtm_sample_workspace.sql',
  '20261106010000_affairs_academic_records.sql','20261112100000_course_selection_history.sql',
  '20261114110000_course_withdrawal.sql','20261114140000_teaching_feedback.sql'];
const origin='https://xiftudmvxphxcjtmfmib.supabase.co';
const rpc=origin+'/rest/v1/rpc/affairs_read_teaching_feedback';
const token='isolated-survey-token';
const clock='2026-11-17T12:00:00Z';
const utc=instant=>instant===null?null:instant.replace(/\+00:00$/u,'Z');
const surveyTimes=row=>({...row,opensAt:utc(row.opensAt),closesAt:utc(row.closesAt)});
const feedbackTimes=row=>({...row,submittedAt:utc(row.submittedAt),reviewedAt:utc(row.reviewedAt)});
const normalize=value=>({...value,surveys:value.surveys.map(surveyTimes),feedback:value.feedback.map(feedbackTimes)});

function observeEvidence(result,row,fixture){
  const payload=JSON.parse(result.evidence.content);
  assert.equal(payload.collection,'teachingFeedback');
  assert.deepEqual(payload.selection,{views:row.readExpectation.views,commentRequested:row.readExpectation.comments,course:row.readExpectation.courseFilter});
  assert.equal(payload.complete,row.readExpectation.failed.length===0);
  assert.deepEqual(payload.views.map(value=>value.view),row.readExpectation.views);
  const counts=(returned,matching,nativeLimit)=>({returned,matching,included:matching,omitted:0,total:returned,totalLowerBound:returned,nativeLimit,capReached:false});
  return payload.views.map((value,index)=>{
    const raw=fixture.reads[index].result,golden=fixture.evidence[index];
    const survey=value.view==='survey';
    assert.equal(value.readState,golden.state==='ok'&&row.fixtureKey.endsWith(':empty')?'empty':golden.state);
    assert.equal(value.complete,golden.complete);
    if(value.readState==='unavailable'){
      assert.equal(value.reason,'read_failed');
      assert.deepEqual(survey?value.surveys:[...value.courses,...value.feedback],[]);
      for(const counter of Object.values(value.counts))assert.deepEqual(
        [counter.returned,counter.matching,counter.included,counter.omitted,counter.total,counter.totalLowerBound,counter.capReached],
        [null,null,0,null,null,null,null]);
      return {view:value.view,state:'unavailable',records:[],eligibleCourses:[],nativeCounts:null,
        capReached:false,omitted:{records:0,eligibleCourses:0},complete:false};
    }
    assert.deepEqual(value.counts,survey?{
      surveys:counts(raw.surveys.length,golden.records.length,50),
      courseCompletions:counts(raw.surveys.flatMap(item=>item.courses).length,golden.records.flatMap(item=>item.courses).length,null),
    }:{
      feedback:counts(raw.feedback.length,golden.records.length,100),
      eligibleCourses:counts(raw.courses.length,golden.eligibleCourses.length,200),
    });
    if(survey)assert.equal(result.surveyIdentityUnambiguous,true);
    // The oracle records whether the RPC succeeded. A successful empty SQL result is still an RPC success.
    return {view:value.view,state:value.readState==='empty'?'ok':value.readState,
      records:survey?value.surveys.map(surveyTimes):value.feedback.map(feedbackTimes),eligibleCourses:survey?[]:value.courses,
      nativeCounts:{surveys:survey?value.counts.surveys.returned:0,feedback:survey?0:value.counts.feedback.returned,
        eligibleCourses:survey?0:value.counts.eligibleCourses.returned},
      capReached:Object.values(value.counts).some(counter=>counter.capReached),omitted:{
        records:survey?value.counts.surveys.omitted:value.counts.feedback.omitted,eligibleCourses:survey?0:value.counts.eligibleCourses.omitted},
      complete:value.complete};
  });
}

test('unchanged teaching questions use real PostgreSQL records and the actual assistant handlers', {skip:!runtime}, async t=>{
  assert.ok(isAbsolute(runtime),'Supply an existing absolute PGlite runtime entry. The test never installs it.');
  t.mock.timers.enable({apis:['Date'],now:Date.parse(clock)});
  const {PGlite}=await import(pathToFileURL(runtime).href);
  const db=new PGlite(),originalFetch=globalThis.fetch,providerKey=process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY='isolated-teaching-feedback-review';
  t.after(async()=>{
    globalThis.fetch=originalFetch;
    if(providerKey===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=providerKey;
    await db.close();
  });
  const {owner,foreignOwner,data}=teachingFeedbackNativeFixtureForCase(cases[0],{nativeSurveyOrder:true});
  const [final,midterm]=data.survey.surveys;
  assert.deepEqual([final.phase,midterm.phase],['final','midterm']);
  await db.exec(`create role anon; create role authenticated; create role service_role;
    create schema auth; create schema private;
    create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,raw_user_meta_data jsonb);
    create table auth.identities(provider_id text,user_id uuid references auth.users on delete cascade,identity_data jsonb,provider text);
    create function auth.uid() returns uuid language sql stable as
      $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema public,auth,private to authenticated;
    set timezone='UTC';`);
  for(const name of migrations)await db.exec(await readFile(new URL('../../supabase/migrations/'+name,import.meta.url),'utf8'));
  const assertClock=async()=>{
    const {rows}=await db.query(`select statement_timestamp() = $4::timestamptz and statement_timestamp() >= $1::timestamptz
      and statement_timestamp() < $2::timestamptz and statement_timestamp() < $3::timestamptz as expected`,[midterm.opensAt,midterm.closesAt,final.opensAt,clock]);
    assert.equal(rows[0].expected,true,'Scratch SQL clock must match the independently authored open/scheduled interval.');
  };
  await assertClock();
  const program=(await db.query("select id from public.affairs_programs where code='SAMPLE-GEN'")).rows[0].id;
  await db.query(`insert into public.affairs_terms(id,code,label,starts_on,ends_on)
    values($1,'QA-FROZEN-TEACHING',$2,'2026-09-01','2027-01-31')`,[midterm.termId,midterm.term]);
  for(const userId of [owner,foreignOwner]){
    const email=userId+'@example.invalid';
    await db.query("insert into auth.users values($1,$2,now(),'{}')",[userId,email]);
    await db.query("insert into auth.identities values($1::uuid::text,$1,jsonb_build_object('sub',$1::uuid::text,'email_verified',true),'google')",[userId]);
    await db.query("insert into public.affairs_profiles(user_id,email,display_name) values($1,$2,'PRIVATE STUDENT NAME')",[userId,email]);
    await db.query(`insert into public.affairs_students(user_id,student_number,full_name,program_id,year_level)
      values($1,$2,'PRIVATE STUDENT NAME',$3,3)`,[userId,'PRIVATE STUDENT NUMBER '+userId,program]);
  }
  // Inserting a sample student may provision a course from the migrated demo term.
  // Keep only the authored scratch enrollments for these two fixture callers.
  await db.query(`delete from public.affairs_enrollments e using public.affairs_students s
    where e.student_id=s.id and s.user_id in ($1,$2)`,[owner,foreignOwner]);
  for(const row of midterm.courses){
    const course=(await db.query('insert into public.affairs_courses(code,title,credits,program_id) values($1,$2,3,$3) returning id',
      [row.code,row.course,program])).rows[0].id;
    await db.query(`insert into public.affairs_sections(id,course_id,term_id,section_code,instructor,weekday,starts_at,ends_at,room)
      values($1,$2,$3,$4,'Scratch instructor',2,'10:00','12:00','Scratch classroom')`,[row.id,course,midterm.termId,row.section]);
    await db.query(`insert into public.affairs_enrollments(student_id,section_id)
      select id,$1 from public.affairs_students where user_id=$2 or (user_id=$3 and $4='DB701')`,[row.id,owner,foreignOwner,row.code]);
  }
  for(const row of [midterm,final])await db.query(`insert into public.affairs_teaching_surveys
    (id,term_id,phase,questions,opens_at,closes_at,version,released) values($1,$2,$3,$4,$5,$6,$7,$8)`,
    [row.id,row.termId,row.phase,row.questions,row.opensAt,row.closesAt,row.version,row.released]);
  await db.query(`insert into private.affairs_teaching_survey_completions (user_id,survey_id,section_id,request_id)
    values($1,$2,$4,gen_random_uuid()),($3,$5,$4,gen_random_uuid())`,[owner,midterm.id,foreignOwner,midterm.courses[0].id,final.id]);
  await db.query(`insert into private.affairs_teaching_survey_results(survey_id,section_id,ratings,comment)
    values($1,$2,array[5,4]::smallint[],'ANONYMOUS RESPONSE SECRET')`,[midterm.id,midterm.courses[0].id]);
  for(const row of data.immediate.feedback)await db.query(`insert into public.affairs_teaching_feedback
    (id,user_id,section_id,comment,status,submitted_at,reviewed_at,request_id) values($1,$2,$3,$4,$5,$6,$7,gen_random_uuid())`,
    [row.id,owner,row.sectionId,row.comment,row.status,row.submittedAt,row.reviewedAt]);
  await db.query(`insert into public.affairs_teaching_feedback(user_id,section_id,comment,request_id)
    values($1,$2,'FOREIGN TEACHING COMMENT',gen_random_uuid())`,[foreignOwner,midterm.courses[0].id]);
  const as=(userId,run)=>db.transaction(async transaction=>{
    await transaction.exec('set local role authenticated');
    await transaction.query("select set_config('request.jwt.claim.sub',$1,true)",[userId]);
    return run(transaction);
  });
  const read=(userId,scope)=>as(userId,async sql=>(await sql.query(
    'select public.affairs_read_teaching_feedback($1,null,null,null) as dto',[scope])).rows[0].dto);
  for(const userId of [owner,foreignOwner]){
    await assert.rejects(read(userId,'manage'),{code:'42501'});
    await assert.rejects(as(userId,sql=>sql.query('select * from private.affairs_teaching_survey_completions')),{code:'42501'});
    await assert.rejects(as(userId,sql=>sql.query('select * from private.affairs_teaching_survey_results')),{code:'42501'});
  }
  assert.deepEqual(normalize(await read(owner,'survey')),data.survey);
  assert.deepEqual(normalize(await read(owner,'immediate')),data.immediate);
  assert.deepEqual((await read(foreignOwner,'immediate')).feedback.map(item=>item.comment),['FOREIGN TEACHING COMMENT']);
  const foreign=normalize(await read(foreignOwner,'survey'));
  assert.equal(foreign.userId,foreignOwner);
  assert.deepEqual(foreign.surveys.map(row=>row.courses.map(course=>[course.code,course.completed])),
    [[['DB701',true]],[['DB701',false]]]);
  const fingerprint=async()=>(await db.query(`select
    (select jsonb_agg(to_jsonb(s) order by id) from public.affairs_teaching_surveys s) as surveys,
    (select jsonb_agg(to_jsonb(r) order by user_id,survey_id,section_id) from private.affairs_teaching_survey_completions r) as receipts,
    (select jsonb_agg(to_jsonb(a) order by id) from private.affairs_teaching_survey_results a) as anonymous,
    (select jsonb_agg(to_jsonb(f) order by id) from public.affairs_teaching_feedback f) as feedback,
    (select jsonb_agg(to_jsonb(e) order by id) from public.affairs_enrollments e) as enrollments,
    (select count(*) from public.affairs_agent_audit) as audit`)).rows[0];
  let observation,currentCase,fixture,mode='normal';
  const blocked=[];
  let reviews=[],companionReads=[],hasCompanions=false;
  globalThis.fetch=async(url,init)=>{
    const target=new URL(String(url)),auth=new Headers(init.headers);
    if(hasCompanions&&target.origin===origin&&init.method==='GET'){
      assert.equal(auth.get('authorization'),'Bearer '+token);
      const params=Object.fromEntries(target.searchParams);
      if(target.pathname==='/rest/v1/affairs_students'){
        const year=params.select==='user_id,year_level,source_mode';
        assert.deepEqual(params,{select:year?'user_id,year_level,source_mode':'id,user_id',user_id:'eq.'+owner,limit:year?'1':'2'});
        const rows=await as(owner,async sql=>(await sql.query(
          (year?'select user_id,year_level,source_mode':'select id,user_id')+' from public.affairs_students where user_id=$1',[owner])).rows);
        companionReads.push(year?'year':'linkage');
        assert.equal(rows.length,1);
        if(year){
          assert.equal(auth.get('Prefer'),'count=exact');
          observation.companions.profile={yearLevel:rows[0].year_level,sourceMode:rows[0].source_mode};
        }
        return Response.json(rows,year?{headers:{'content-range':'0-0/1'}}:undefined);
      }
      assert.equal(target.pathname,'/rest/v1/affairs_enrollments');
      assert.equal(auth.get('Prefer'),'count=exact');
      const select=[
        'id','student_id','section_id','status','source_mode','student:affairs_students!affairs_enrollments_student_id_fkey(id,user_id)',
        'section:affairs_sections!affairs_enrollments_section_id_fkey(id,course_id,term_id,weekday,starts_at,ends_at,room,'
          +'course:affairs_courses!affairs_sections_course_id_fkey(id,code,title),term:affairs_terms!affairs_sections_term_id_fkey(id,label,starts_on,ends_on))',
      ].join(',');
      assert.deepEqual(params,{select,student_id:'eq.'+studentId,status:'eq.enrolled',order:'id.asc',limit:'100',offset:'0'});
      const rows=await as(owner,async sql=>(await sql.query(`
        select e.id,e.student_id,e.section_id,e.status,e.source_mode,jsonb_build_object('id',s.id,'user_id',s.user_id) student,
          jsonb_build_object('id',cs.id,'course_id',c.id,'term_id',t.id,'weekday',cs.weekday,'starts_at',cs.starts_at,
            'ends_at',cs.ends_at,'room',cs.room,'course',jsonb_build_object('id',c.id,'code',c.code,'title',c.title),
            'term',jsonb_build_object('id',t.id,'label',t.label,'starts_on',t.starts_on,'ends_on',t.ends_on)) section
        from public.affairs_enrollments e join public.affairs_students s on s.id=e.student_id
        join public.affairs_sections cs on cs.id=e.section_id join public.affairs_courses c on c.id=cs.course_id
        join public.affairs_terms t on t.id=cs.term_id where s.user_id=$1 and s.id=$2 and e.status='enrolled' order by e.id limit 100`,[owner,studentId])).rows);
      companionReads.push('enrollments');
      observation.companions.courses=rows.map(row=>({
        code:row.section.course.code,title:row.section.course.title,term:row.section.term.label,status:row.status,
      })).sort((left,right)=>left.code.localeCompare(right.code));
      return Response.json(rows,{headers:{'content-range':rows.length?'0-'+(rows.length-1)+'/'+rows.length:'*/0'}});
    }
    if(target.href==='https://api.openai.com/v1/responses'&&(currentCase.readExpectation.failed.length||hasCompanions)){
      const request=JSON.parse(init.body),stage=request.text.format.name;
      reviews.push(stage);
      assert.equal(stage,'answer_evidence_review');
      const packet=JSON.parse(request.input[0].content[0].text);
      assert.deepEqual(packet.evidence.map(source=>source.id),hasCompanions?
        ['account-scope','account:profile','account:courses']:['account-scope','account:teachingFeedback']);
      const source=packet.evidence[1];
      const claims=hasCompanions?[
        {claim:'Your saved year level is '+observation.companions.profile.yearLevel+'.',
          evidenceId:source.id,jsonPaths:['/records/student/yearLevel'],quotes:[],supported:true},
        ...JSON.parse(packet.evidence[2].content).records.map((record,index)=>({claim:record.code+' is a current subject.',
          evidenceId:packet.evidence[2].id,jsonPaths:['/records/'+index+'/code'],quotes:[],supported:true})),
      ]:JSON.parse(source.content).views.flatMap((view,index)=>{
        const base='/views/'+index;
        if(view.readState==='unavailable')return [{
          claim:view.view==='survey'?'The teaching evaluation survey could not be read.':'Immediate teaching feedback could not be read.',
          evidenceId:source.id,jsonPaths:[base+'/reason'],quotes:[],supported:true,
        }];
        assert.equal(view.view,'immediate');
        return view.feedback.map((record,row)=>({
          claim:record.code+' saved status: '+record.status+'.',evidenceId:source.id,
          jsonPaths:[base+'/feedback/'+row+'/status'],quotes:[],supported:true,
        }));
      });
      return Response.json({status:'completed',output:[{content:[
        {type:'output_text',text:JSON.stringify({supported:true,answersQuestion:true,claims})},
      ]}]});
    }
    if(String(url)!==rpc){blocked.push(new URL(String(url)).pathname);assert.fail('Unexpected scratch assistant transport.');}
    assert.equal(init.method,'POST');
    assert.equal(new Headers(init.headers).get('authorization'),'Bearer '+token);
    const expected=fixture.reads[observation.reads.length];
    assert.ok(expected,'No unselected native teaching RPC.');
    const view=expected.view;
    assert.deepEqual(JSON.parse(init.body),{p_scope:view,p_term:null,p_survey:null,p_section:null});
    const query={scope:'teaching-feedback',view};
    if(currentCase.readExpectation.failed.includes(view)){
      observation.reads.push({view,query,state:'unavailable',result:null});
      return Response.json({message:'isolated selected transport outage'},{status:503});
    }
    const value=await read(owner,view);
    observation.reads.push({view,query,state:'ok',result:normalize(value)});
    return Response.json(value);
  };
  const studentId=(await db.query('select id from public.affairs_students where user_id=$1',[owner])).rows[0].id;
  const handler=createAffairsAssistantHandler({
    verifyToken:async candidate=>{
      assert.equal(candidate,token);
      return {url:origin,key:'isolated-publishable-key',token,user:{id:owner}};
    },
    loadSnapshot:async()=>{blocked.push('broad account snapshot');assert.fail('Unexpected broad account snapshot.');},
    publicResearch:async()=>{observation.publicRequests.push('public research');assert.fail('Unexpected public research.');},
    readers:{teachingFeedback:async(account,options)=>{
      assert.equal(account.user.id,owner);
      const result=await readTeachingFeedbackEvidence(account,options);
      assert.deepEqual(observation.evidence,[]);
      observation.evidence=observeEvidence(result,currentCase,fixture);
      return result;
    }},
  });
  for(const [index,row] of cases.entries())await t.test(row.id,async()=>{
    // Keep each request outside the prior request's rate window while staying
    // inside the independently checked survey periods.
    t.mock.timers.setTime(Date.parse(clock)+index*65_000);
    fixture=teachingFeedbackNativeFixtureForCase(row,{nativeSurveyOrder:true});
    currentCase=row;
    reviews=[];
    companionReads=[];
    hasCompanions=row.id===idPrefix+'excluded-native';
    if(hasCompanions){
      const companionTerm=(await db.query(`insert into public.affairs_terms(code,label,starts_on,ends_on)
        values('QA-CURRENT-ONLY','QA Current Fall','2026-09-01','2027-01-31') returning id`)).rows[0].id;
      for(const [index,course] of fixture.companions.courses.entries()){
        const saved=(await db.query('insert into public.affairs_courses(code,title,credits,program_id) values($1,$2,3,$3) returning id',
          [course.code,course.title,program])).rows[0].id;
        const section=(await db.query(`insert into public.affairs_sections(course_id,term_id,section_code,instructor,weekday,starts_at,ends_at,room)
          values($1,$2,'A','Scratch instructor',$3,'10:00','12:00','Scratch classroom') returning id`,[saved,companionTerm,index+1])).rows[0].id;
        await db.query('insert into public.affairs_enrollments(student_id,section_id) values($1,$2)',[studentId,section]);
      }
      // Before observing the exclusion request, inspect the scratch fixture.
      // A real companion timetable and the immediate eligible courses agree.
      // This setup probe is deliberately outside the recorded assistant request.
      const eligible=(await read(owner,'immediate')).courses.map(course=>course.code);
      assert.deepEqual(eligible,fixture.companions.courses.map(course=>course.code));
      for(const name of ['mixed-before','mixed-after']){
        const mixed=teachingFeedbackNativeFixtureForCase(frozen.find(item=>item.id===idPrefix+name));
        assert.deepEqual(mixed.companions.courses.map(course=>course.code),eligible);
        assert.notDeepEqual(mixed.reads[0].result.courses.map(course=>course.code),eligible);
      }
    }
    const next=row.fixtureKey.split(':').at(-1);
    if(mode!==next&&next==='markup')
      await db.query('update public.affairs_teaching_feedback set comment=$1 where id=$2',
        [fixture.data.immediate.feedback[0].comment,data.immediate.feedback[0].id]);
    if(mode!==next&&next==='empty'){
      await db.query('delete from public.affairs_teaching_feedback where user_id=$1',[owner]);
      await db.query('delete from private.affairs_teaching_survey_completions where user_id=$1',[owner]);
      await db.query('delete from public.affairs_enrollments where student_id in(select id from public.affairs_students where user_id=$1)',[owner]);
    }
    mode=next;
    const before=await fingerprint();
    observation={callerId:owner,reads:[],evidence:[],companions:{},writeRequests:[],storageRequests:[],publicRequests:[]};
    let body,statusCode=200;
    const response={setHeader(){},status(code){statusCode=code;return this;},json(value){body=value;}};
    await handler({method:'POST',headers:{authorization:'Bearer '+token},
      body:{question:row.question,route:row.route,history:row.history}},response);
    assert.deepEqual(blocked.splice(0),[]);
    const activity=body?.activity??[];
    if(row.readExpectation.views.length){
      assert.deepEqual(body?.verification,{status:'verified',attempts:1},body?.answer);
      const degraded=row.readExpectation.failed.length>0;
      assert.equal(activity.filter(item=>item.kind==='teaching-feedback-evidence-check'&&item.status==='complete').length,degraded?0:1);
      assert.deepEqual(reviews,degraded?['answer_evidence_review']:[]);
    }else {
      assert.deepEqual(observation.reads,[]);
      assert.deepEqual(reviews,hasCompanions?['answer_evidence_review']:[]);
      if(hasCompanions)assert.deepEqual(body?.verification,{status:'verified',attempts:1},JSON.stringify(body));
      assert.deepEqual(companionReads.sort(),hasCompanions?['enrollments','linkage','year']:[]);
    }
    const verdict=gradeTeachingFeedbackNativeCase(row,{statusCode,body,events:activity,execution:'deterministic',fixtureKey:row.fixtureKey},
      {observation,nativeSurveyOrder:true});
    assert.deepEqual(verdict.failures,[],body?.answer+' '+JSON.stringify({
      citations:body?.citations?.map(({chunkId,url})=>({chunkId,url})),views:body?.views?.map(({id,url})=>({id,url})),
    }));
    assert.deepEqual(await fingerprint(),before);
  });
  t.mock.timers.setTime(Date.parse(clock));
  await assertClock();
});
