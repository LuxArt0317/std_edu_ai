import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createAffairsAssistantHandler} from '../../api/affairs-assistant.ts';
import {academicGradeReadSources,academicGradesQuery,selectAcademicGradeCourses} from '../../server/academicGrades.js';
import {loadNativeAcademicRecords} from '../../server/nativeAcademicWorkspace.js';
import {buildAccountCases} from './account-cases.mjs';
import {fixtureForCase} from './fixtures.mjs';
import {gradeCase} from './grading.mjs';

const claimsByCase={
  'transcript-grade':['/records/records/0/courseTitle','/records/records/0/gradeText'],
  'transcript-summary':['/records/termSummaries/0/earnedCredits','/records/termSummaries/0/averageGradeText'],
  'warning-grades':['/records/records/0/courseTitle','/records/records/0/gradeText','/records/records/0/remarkText'],
  'academic-rankings':['/records/rankings/0/departmentRankingText','/records/rankings/0/classRankingText'],
  'academic-english':['/records/metadata/0/englishRequirementText'],
  'academic-gpa-gap':['/rules'],
  'academic-current-gap':['/rules'],
  'academic-transfer-gap':['/rules'],
  'academic-cycle-gap':['/rules'],
  'academic-null-zero':['/records/records/0/courseTitle','/records/records/0/gradeText','/records/termSummaries/0/earnedCredits'],
  'academic-other-account':['/records/records/0/courseTitle','/records/records/0/gradeText'],
};
const cases=buildAccountCases().filter(row=>Object.hasOwn(claimsByCase,row.id.slice('account:'.length)));
const rawRow=row=>Object.fromEntries(Object.entries(row).map(([key,value])=>[key.replace(/[A-Z]/g,l=>`_${l.toLowerCase()}`),value]));
const sourceId='account:academicGrades';
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
  assert.equal(cases.length,Object.keys(claimsByCase).length);
  const key=process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY='OFFLINE_ACADEMIC_MODEL';
  t.after(()=>{if(key===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=key;});
  let current=null,payloads=[],operations=[],outboundErrors=[];
  t.mock.method(globalThis,'fetch',async(input,init)=>{
    try{
      assert.equal(String(input),'https://api.openai.com/v1/responses');
      const request=JSON.parse(String(init.body)),operation=request.text.format.name;
      operations.push(operation);
      let result;
      if(operation==='account_lookup_plan')result={tools:['academicGrades'],publicTopics:[],catalogQuery:null,action:null};
      else {
        assert.equal(operation,'answer_evidence_review','The runtime draft should answer directly from its selected scope.');
        const review=JSON.parse(request.input[0].content[0].text);
        assert.deepEqual(review.evidence.map(row=>row.id),['account-scope',sourceId]);
        const content=JSON.parse(review.evidence[1].content);
        payloads.push(content);
        assert.doesNotMatch(JSON.stringify(content),/FOREIGN PRIVATE SENTINEL|TERM SCOPE DISTRACTOR|OTHER COURSE UNASKED/u);
        result={supported:true,answersQuestion:true,claims:[{
          claim:'The draft matches the selected saved academic fields or explicitly unsupported view.',
          supported:true,evidenceId:sourceId,quotes:[],jsonPaths:claimsByCase[current.id.slice('account:'.length)],
        }]};
      }
      return Response.json({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify(result)}]}]});
    }catch(error){outboundErrors.push(error);throw error;}
  });
  for(const testCase of cases){
    current=testCase;payloads=[];operations=[];outboundErrors=[];
    const fixture=fixtureForCase(testCase),owner=fixture.profile.userId;
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
    const tables=new Map(academicGradeReadSources.map(({key,table})=>[table,data[key].map(rawRow)]));
    let reads=0;
    const handler=createAffairsAssistantHandler({
      verifyToken:async()=>({url:'https://xiftudmvxphxcjtmfmib.supabase.co',key:'OFFLINE_PUBLISHABLE',token:'OFFLINE_ACADEMIC_TOKEN',user:{id:owner}}),
      publicResearch:async()=>assert.fail('Private academic questions do not use public research.'),
      loadSnapshot:async()=>{
        reads++;
        const snapshot=await loadNativeAcademicRecords(owner,false,async(table,query)=>{
          assert.equal(query.user_id,'eq.'+owner);
          return (tables.get(table)??[]).filter(row=>row.user_id===owner);
        });
        return {...fixture,...snapshot.own};
      },
    });
    const envelope=await send(handler,testCase.question,testCase.route);
    if(outboundErrors.length)throw outboundErrors[0];
    assert.equal(reads,1,testCase.id);
    assert.equal(payloads.length,1,testCase.id);
    assert.ok(operations.every(name=>['account_lookup_plan','answer_evidence_review'].includes(name)),testCase.id);
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
