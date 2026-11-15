import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createAffairsAssistantHandler} from '../../api/affairs-assistant.ts';
import {academicGradeReadSources,academicGradesQuery,selectAcademicGradeCourses,standaloneAcademicGradeView} from '../../server/academicGrades.js';
import {academicGradesPreviewCases} from './academic-grades-preview.mjs';
import {fixtureForCase} from './fixtures.mjs';
import {gradeCase} from './grading.mjs';

const cases=academicGradesPreviewCases();
const rawRow=row=>Object.fromEntries(Object.entries(row).map(([key,value])=>[key.replace(/[A-Z]/g,l=>`_${l.toLowerCase()}`),value]));
const ownerMarker='TERM SCOPE DISTRACTOR';

async function send(handler,question,route){
  const captured={statusCode:0,body:null,events:[]};
  const response={
    status(status){captured.statusCode=status;return this;},json(body){captured.body=body;},setHeader(){},
    write(chunk){const frame=/^event: (.+)\ndata: (.+)\n\n$/u.exec(chunk);assert.ok(frame);
      const event=JSON.parse(frame[2]);if(['result','error'].includes(frame[1]))captured.body=event;else captured.events.push(event);
    },end(){},
  };
  await handler({method:'POST',headers:{authorization:'Bearer OFFLINE_ACADEMIC_TOKEN'},body:{question,route,stream:true}},response);
  return captured;
}

test('the actual academic grade handler passes the frozen grade questions with exact owned source fields',async t=>{
  assert.equal(cases.length,11);
  const key=process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY='OFFLINE_ACADEMIC_MODEL';
  t.after(()=>{if(key===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=key;});
  let outboundErrors=[],tables,owner,reads;
  t.mock.method(globalThis,'fetch',async(input,init)=>{
    try{
      const url=new URL(input);
      if(url.origin==='https://xiftudmvxphxcjtmfmib.supabase.co'){
        assert.equal(init.method,'GET');
        assert.equal(new Headers(init.headers).get('Authorization'),'Bearer OFFLINE_ACADEMIC_TOKEN');
        assert.equal(url.searchParams.get('user_id'),'eq.'+owner);
        const table=url.pathname.slice('/rest/v1/'.length);
        assert.ok(tables.has(table));reads.push(table);
        return Response.json(tables.get(table).filter(row=>row.user_id===owner));
      }
      assert.fail('The selected grade cases require no external provider request.');
    }catch(error){outboundErrors.push(error);throw error;}
  });
  for(const testCase of cases){
    outboundErrors=[];
    const fixture=fixtureForCase(testCase);owner=fixture.profile.userId;
    const data=fixture.academicGrades;
    const anotherTerm={academicYear:114,semester:1};
    data.records.push({...data.records[0],...anotherTerm,id:'38000000-0000-4000-8000-000000000001',gradeText:ownerMarker});
    data.records.push({...data.records[1],...anotherTerm,id:'38000000-0000-4000-8000-000000000005',gradeText:ownerMarker});
    data.termSummaries.push({...data.termSummaries[0],...anotherTerm,id:'38000000-0000-4000-8000-000000000002',averageGradeText:ownerMarker});
    data.rankings.push({...data.rankings[0],...anotherTerm,id:'38000000-0000-4000-8000-000000000003',departmentRankingText:ownerMarker});
    if(['account:transcript-grade','account:academic-null-zero'].includes(testCase.id))
      data.records.push({...data.records[0],id:'38000000-0000-4000-8000-000000000004',courseTitle:'OTHER COURSE UNASKED'});
    if(testCase.id==='account:warning-grades')
      data.records.push({...data.records[1],id:'38000000-0000-4000-8000-000000000006',courseTitle:'OTHER COURSE UNASKED'});
    tables=new Map(academicGradeReadSources.map(({key,table})=>[table,data[key].map(rawRow)]));
    reads=[];
    const handler=createAffairsAssistantHandler({
      verifyToken:async()=>({url:'https://xiftudmvxphxcjtmfmib.supabase.co',key:'OFFLINE_PUBLISHABLE',token:'OFFLINE_ACADEMIC_TOKEN',user:{id:owner}}),
      publicResearch:async()=>assert.fail('Private academic questions do not use public research.'),
      loadSnapshot:async()=>assert.fail('Standalone academic grades must not initialize or load an unrelated workspace.'),
    });
    const envelope=await send(handler,testCase.question,testCase.route);
    if(outboundErrors.length)throw outboundErrors[0];
    const view=standaloneAcademicGradeView(testCase.question,testCase.route);
    const keys={transcript:['records','termSummaries'],warning:['records','termSummaries'],ranking:['rankings'],english:['metadata']}[view]??[];
    assert.deepEqual([...reads].sort(),academicGradeReadSources.filter(source=>keys.includes(source.key)).map(source=>source.table).sort(),testCase.id);
    assert.equal(envelope.events.filter(event=>event.kind==='academic-grades-evidence-check'&&event.status==='complete').length,1,testCase.id);
    assert.deepEqual(envelope.body.verification,{status:'verified',attempts:1},testCase.id);
    assert.doesNotMatch(JSON.stringify(envelope.body),/FOREIGN PRIVATE SENTINEL|TERM SCOPE DISTRACTOR|OTHER COURSE UNASKED/u,testCase.id);
    const graded=gradeCase(testCase,{...envelope,fixtureKey:testCase.fixtureKey,execution:'deterministic'});
    assert.deepEqual(graded.failures,[],testCase.id);
  }
});

test('compact grade terms reject competing years and do not treat course-code digits as an academic year',()=>{
  const route='/school-affairs/services/13-1/transcript';
  const selection=academicGradesQuery('What is my transcript grade in115semester1 or 114semester1?',route);
  assert.equal(selection.multipleScopes,true);
  const code=academicGradesQuery('What is the grade for IN301 semester1?',route);
  assert.equal(code.academicYear,undefined);
  assert.equal(code.semester,1);
  assert.equal(academicGradesQuery('What is my transcript grade for 0000semester1?',route).invalid,true);
  assert.equal(academicGradesQuery('What is my transcript grade for115semester4?',route).invalid,true);
  const history=[{role:'user',content:'Show my transcript in115semester1 or 114semester1.'}];
  assert.equal(academicGradesQuery('What else?',route,history).academicYear,undefined);
});

test('course selection uses transcript clauses and leaves term-wide requests intact',()=>{
  const transcript=[{courseTitle:'Database Design'},{courseTitle:'Research Writing'}];
  assert.deepEqual(selectAcademicGradeCourses('Show my Database Design transcript grade and my Moodle grade for Research Writing.',transcript),[transcript[0]]);
  assert.deepEqual(selectAcademicGradeCourses('Show my transcript grades for115semester1.',transcript),transcript);
});

test('mixed requests and contextual follow-ups do not use the standalone academic reader',()=>{
  const route='/school-affairs/services/13-1/transcript';
  for(const question of ['My transcript', 'Show my transcript grades for115semester1 and my tuition balance.',
    'Show my transcript grades for115semester1. Where is the bookstore?', 'Show my transcript grades in115semester1 and my tasks.'])
    assert.equal(standaloneAcademicGradeView(question,route),null,question);
});

test('exact academic verification distinguishes an empty scope from ambiguous, partial, or untrusted data',async t=>{
  const fixture=fixtureForCase(cases[0]),owner=fixture.profile.userId;
  const row=rawRow(fixture.academicGrades.records[0]);
  const savedKey=process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY='OFFLINE_ACADEMIC_MODEL';
  t.after(()=>{if(savedKey===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=savedKey;});
  const scenarios={empty:[],ambiguous:[row,{...row,id:'39000000-0000-4000-8000-000000000002',grade_text:'41'}],
    markup:[{...row,grade_text:'[redirect](https://example.invalid)'}],
    partial:Array.from({length:25},(_,index)=>({...row,id:'39000000-0000-4000-8000-'+String(index+3).padStart(12,'0'),course_title:'Course '+index})),
    foreign:[{...row,user_id:'39000000-0000-4000-8000-000000000099'}]};
  let scenario='empty',modelCalls=0;
  t.mock.method(globalThis,'fetch',async(input,init)=>{
    const target=new URL(input);
    if(target.hostname==='api.openai.com'){
      modelCalls++;
      return Response.json({error:{code:'insufficient_quota',type:'insufficient_quota'}},{status:429});
    }
    assert.equal(target.origin,'https://xiftudmvxphxcjtmfmib.supabase.co');
    assert.equal(init.method,'GET');
    return Response.json(target.pathname.endsWith('/affairs_academic_grade_records')?scenarios[scenario]:[]);
  });
  const handler=createAffairsAssistantHandler({
    verifyToken:async()=>({url:'https://xiftudmvxphxcjtmfmib.supabase.co',token:'OFFLINE_ACADEMIC_TOKEN',key:'OFFLINE_PUBLISHABLE',user:{id:owner}}),
    loadSnapshot:async()=>assert.fail('No broader workspace read.'),
  });
  for(scenario of Object.keys(scenarios)){
    const before=modelCalls;
    const result=await send(handler,'Show my transcript grades for115semester1.','/school-affairs/services/13-1/transcript');
    const native=result.events.some(event=>event.kind==='academic-grades-evidence-check');
    if(scenario==='empty'){
      assert.equal(native,true);
      assert.match(result.body.answer,/No academic grade records match these filters/u);
      assert.equal(modelCalls,before);
    }else{
      assert.equal(native,false,scenario);
      assert.notEqual(result.body.verification?.status,'verified',scenario);
      if(scenario==='foreign'){assert.match(result.body.error,/School Affairs records could not be checked/u);assert.equal(modelCalls,before);}
      else assert.ok(modelCalls>before,scenario);
      assert.doesNotMatch(result.body.answer??'',/https:\/\/example\.invalid/u);
    }
  }
});
