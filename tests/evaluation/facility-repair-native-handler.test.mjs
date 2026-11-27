import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createAffairsAssistantHandler} from '../../api/affairs-assistant.ts';
import {AffairsWorkspaceError} from '../../server/affairsWorkspace.js';
import {buildFacilityRepairCases,facilityRepairCaseManifest as manifest,facilityRepairFixtureForCase} from './facility-repair-cases.mjs';
import {gradeCase} from './grading.mjs';

const bank=buildFacilityRepairCases();
const origin='https://xiftudmvxphxcjtmfmib.supabase.co';
const token='isolated-facility-fixture-token';
const student='21000000-0000-4000-8000-000000000009';

function restEnrollments(fixture){
  return fixture.courses.filter(course=>course.status==='enrolled').map((course,index)=>{
    const related=n=>'22000000-0000-4000-8000-'+String(10*index+n).padStart(12,'0');
    return {id:course.enrollmentId,student_id:student,section_id:related(1),status:'enrolled',source_mode:course.sourceMode,
      student:{id:student,user_id:fixture.owner},
      section:{id:related(1),course_id:related(2),term_id:related(3),weekday:course.weekday,starts_at:course.startsAt,ends_at:course.endsAt,room:course.room,
        course:{id:related(2),code:course.code,title:course.title},
        term:{id:related(3),label:course.term,starts_on:course.termStartsOn,ends_on:course.termEndsOn}}};
  });
}

test('actual Facility Repair handler satisfies frozen read cases with the reviewer unavailable',async t=>{
  t.mock.timers.enable({apis:['Date'],now:Date.parse(manifest.now)});
  const originalFetch=globalThis.fetch,key=process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY='isolated-quota-exhausted-provider';
  t.after(()=>{
    globalThis.fetch=originalFetch;
    if(key===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=key;
  });
  const compound=bank.find(row=>row.id.endsWith('-compound-next-class'));
  const observations=[
    ...bank.map(row=>({row,label:row.id})),
    {row:compound,label:'failed timetable preserves the verified repair status',failed:'timetable'},
    {row:compound,label:'failed repair preserves the independently verified next class',failed:'repair'},
  ];
  for(const [index,{row,label,failed}] of observations.entries())await t.test(label,async()=>{
    t.mock.timers.setTime(Date.parse(manifest.now)+index*65_000);
    const fixture=structuredClone(facilityRepairFixtureForCase(row));fixture.courses=fixture.courses.map(course=>({...course,sourceMode:'verified'}));const before=structuredClone(fixture);
    const calls=[],transportErrors=[],providerCalls=[];
    globalThis.fetch=async(input,init)=>{
      const url=new URL(String(input));
      if(url.origin==='https://api.openai.com'){
        providerCalls.push(url.pathname);
        return Response.json({error:{code:'insufficient_quota',type:'insufficient_quota',message:'Isolated fixture quota exhausted.'}},{status:429});
      }
      try{
        assert.equal(url.origin,origin);
        assert.equal(new Headers(init?.headers).get('authorization'),'Bearer '+token);
        if(url.pathname==='/rest/v1/rpc/affairs_read_facility_repairs'){
          assert.equal(init.method,'POST');
          const expected=row.nativeExpectation.calls[calls.filter(value=>typeof value!=='string').length];
          assert.ok(expected,'Unexpected facility read');
          const query=JSON.parse(init.body);
          assert.deepEqual(query,{p_manage:false,p_id:expected.id??null,p_page:Number(expected.page??0),p_status:expected.status??''});
          calls.push(expected);
          if(fixture.error||failed==='repair')return Response.json({message:'Isolated fixture read error.'},{status:fixture.error?.status??503});
          return Response.json(query.p_id?fixture.detail:fixture.list);
        }
        assert.ok(row.timeFixture,'Timetable read was independently requested');
        assert.equal(init.method,'GET');
        if(url.pathname==='/rest/v1/affairs_students'){
          assert.deepEqual(Object.fromEntries(url.searchParams),{select:'id,user_id',user_id:'eq.'+fixture.owner,limit:'2'});
          calls.push('own student linkage');
          return failed==='timetable'?Response.json({message:'Isolated timetable outage.'},{status:503})
            :Response.json([{id:student,user_id:fixture.owner}]);
        }
        assert.equal(url.pathname,'/rest/v1/affairs_enrollments');
        const {select,...params}=Object.fromEntries(url.searchParams);
        assert.match(select,/^id,student_id,section_id,status,source_mode,student:/u);
        assert.deepEqual(params,{student_id:'eq.'+student,status:'eq.enrolled',order:'id.asc',limit:'100',offset:'0'});
        assert.equal(new Headers(init.headers).get('Prefer'),'count=exact');
        calls.push('own enrolled timetable');
        const rows=restEnrollments(fixture);
        return Response.json(rows,{headers:{'content-range':rows.length?'0-'+(rows.length-1)+'/'+rows.length:'*/0'}});
      }catch(error){transportErrors.push(error);throw error;}
    };
    const reject=operation=>async()=>{const error=new Error('Unexpected '+operation);transportErrors.push(error);throw error;};
    const handler=createAffairsAssistantHandler({
      verifyToken:async candidate=>{
        assert.equal(candidate,row.fixtureKey==='anonymous'?'':token);
        if(!candidate)throw new AffairsWorkspaceError('Sign in first.',401);
        return {url:origin,key:'isolated-publishable-key',token,user:{id:fixture.owner}};
      },
      loadSnapshot:reject('broad account snapshot'),publicResearch:reject('public research'),
    });
    let body,statusCode=200;
    const response={setHeader(){},status(code){statusCode=code;return this;},json(value){body=value;}};
    await handler({method:'POST',headers:row.fixtureKey==='anonymous'?{}:{authorization:'Bearer '+token},
      body:{question:row.question,route:row.route}},response);
    assert.deepEqual(transportErrors,[]);
    assert.deepEqual(providerCalls,[]);
    assert.deepEqual(calls.filter(value=>typeof value!=='string'),row.nativeExpectation.calls);
    assert.deepEqual(calls.filter(value=>typeof value==='string'),row.timeFixture?
      ['own student linkage',...(failed==='timetable'?[]:['own enrolled timetable'])]:[]);
    assert.deepEqual(fixture,before);
    if(failed){
      assert.equal(body.verification?.status,'verified',body.answer);
      assert.equal(body.grounding?.degraded,true);
      if(failed==='timetable'){
        assert.match(body.answer,/Saved status: ` resolved `/u);
        assert.match(body.answer,/saved timetable could not be read/u);
        assert.doesNotMatch(body.answer,/QA Timetable Workshop/u);
      }else{
        assert.match(body.answer,/repair record query is unavailable/u);
        assert.match(body.answer,/QA Timetable Workshop/u);
        assert.doesNotMatch(body.answer,/Saved status:|No saved repair records/u);
      }
      return;
    }
    const grade=gradeCase(row,{statusCode,body,events:body?.activity??[],execution:'deterministic',fixtureKey:row.fixtureKey});
    assert.deepEqual(grade.failures,[],body?.answer);
    if(!['foreign-account','anonymous'].some(suffix=>row.id.endsWith(suffix))){
      assert.deepEqual(body.verification,{status:'verified',attempts:1});
      assert.ok(body.activity.some(step=>step.kind==='facility-repair-evidence-check'&&step.status==='complete'));
    }
    if(row.timeFixture){
      const timetable=body.views.find(view=>view.id==='courses');
      assert.match(JSON.stringify(timetable),/QA Timetable Workshop/u);
      assert.doesNotMatch(JSON.stringify(body),/Withdrawn QA Lecture|FOREIGN EARLIER CLASS|PRIVATE CONTACT SENTINEL/u);
    }
  });
});
