import assert from 'node:assert/strict';
import {test,type TestContext} from 'node:test';
import {createAffairsAssistantHandler} from '../../api/affairs-assistant.ts';
import {createResearchAssistantHandler} from '../../server/researchAssistantHandler.js';
import {catalogDetailIntent,catalogDetailRoute,catalogDetailGuestRoute} from '../../server/catalogDetailIntent.js';
import {newCourseOffering} from '../../src/features/public/affairs/courseCatalogModel.js';
import {newCourseSyllabus} from '../../src/features/public/affairs/courseSyllabusModel.js';

const id='20000000-0000-4000-8000-000000000099';
const visitor='10000000-0000-4000-8000-000000000099';
const course='/school-affairs/services/12-4?course='+id;
const syllabus='/school-affairs/services/12-4?syllabus='+id;
const host='https://xiftudmvxphxcjtmfmib.supabase.co';
const token='offline-catalog-only';
const record={...newCourseOffering(),id,version:4,published:true,source_mode:'sample',course_code:'CAT301',course_name:'Published Database Design',
  instructor:'Teacher Kaohsiung',credits:0,prerequisite:'',syllabus:{...newCourseSyllabus(),objectives:'Learn [text](https://invalid.example/) safely.',
    grading:[{weight:0,methods:[]},{weight:20,methods:['1']},{weight:null,methods:[]},{weight:null,methods:[]}]}};
const reject=()=>assert.fail('Catalog answer entered unrelated account or public lookup.');
const requestScope={verifyToken:async(value:string)=>{
  assert.equal(value,token);
  return {url:host,key:'fixture',token,user:{id:visitor}};
},loadSnapshot:reject,answerAccount:reject,publicResearch:reject};
const accountHandler=createAffairsAssistantHandler(requestScope);

async function run(handler:typeof accountHandler,route:string,question:string){
  let status=200,body:unknown;
  const res={status(code:number){status=code;return res;},json(value:unknown){body=value;},setHeader(){}};
  await handler({method:'POST',headers:{authorization:'Bearer '+token},body:{question,route}},res);
  assert.equal(status,200);
  return body as {status:string;answer:string;verification?:{status:string;attempts:number};
    citations:{url:string;chunkId:string}[];activity?:{kind:string;status:string}[];proposedAction?:unknown};
}

function scope(t:TestContext,responses:unknown[]){
  let index=0;
  t.mock.method(globalThis,'fetch',async(url:string,input:RequestInit)=>{
    assert.equal(url,host+'/rest/v1/rpc/affairs_syllabus_detail');
    assert.equal(input.method,'POST');
    assert.equal(input.redirect,'error');
    assert.equal(new Headers(input.headers).get('authorization'),'Bearer '+token);
    assert.deepEqual(JSON.parse(String(input.body)),{p_id:id});
    assert.ok(index<responses.length);
    const response=responses[index++];
    return response instanceof Response?response:Response.json(response);
  });
  return ()=>assert.equal(index,responses.length);
}

test('exact sample course and syllabus routes select only requested fields from the real published RPC',async t=>{
  const cases=[
    {route:course, question:'What are the course code, teacher and credits for this offering?',
      expects:['CAT301','Teacher Kaohsiung','Credits: 0'], excludes:['Grading row']},
    {route:course+'&keyword=some+other+term',question:'How many credits is this course?',
      expects:['CAT301','Credits: 0'],excludes:['Teacher Kaohsiung','some other term']},
    {route:syllabus,question:'What are the grading weights in this syllabus?',
      expects:['Grading row 1 (Regular assessment): 0%','Grading row 2 (Midterm assessment): 20%','Grading row 3 (Final assessment): not recorded'],excludes:['Teacher Kaohsiung']},
    {route:syllabus,question:'For published syllabus offering ID '+id+', state its course code and the weight recorded in grading row 3.',
      expects:['CAT301','Grading row 3 (Final assessment): not recorded'],excludes:['Grading row 1','Grading row 2','Grading row 4']},
    {route:course,question:'這門課程有幾個學分？',expects:['CAT301','學分數: 0'],excludes:['Teacher Kaohsiung']},
    {route:course,question:'What is the prerequisite for this course?',expects:['Prerequisite: not recorded'],excludes:['Grading row']},
    {route:syllabus,question:'What are the teaching objectives for this course?',expects:['Learn &#91;text&#93;&#40;https&#58;//invalid.example/&#41; safely.'],excludes:['[text](']},
    {route:course,question:'What course code is listed for published catalog offering ID '+id+', and does that published listing alone prove my personal enrollment?',
      expects:['CAT301','cannot confirm your enrollment'],excludes:['Classes today']},
  ];
  for(const row of cases)await t.test(row.question,async inner=>{
    const done=scope(inner,[{row:record}]);
    const result=await run(accountHandler,row.route,row.question);
    assert.equal(result.status,'answered');
    assert.deepEqual(result.verification,{status:'verified',attempts:1});
    assert.equal(result.citations[0].url,row.route.split('&')[0]);
    assert.equal(result.citations[0].chunkId,'account:courseCatalog');
    assert.equal(result.proposedAction,undefined);
    for(const phrase of row.expects)assert.ok(result.answer.includes(phrase),phrase);
    for(const phrase of row.excludes)assert.ok(!result.answer.includes(phrase),phrase);
    assert.ok(result.activity?.some(step=>step.kind==='account-read:courseCatalog:1'&&step.status==='complete'));
    done();
  });
});

test('a valid empty read, a corrected read and a second failure are reported distinctly',async t=>{
  for(const {label,inputs,status,pattern,attempts}of [
    {label:'empty exact offering',inputs:[{row:null}],status:'verified',pattern:/no published stu.best sample offering/u,attempts:1},
    {label:'conflicting ID recovers',inputs:[{row:{...record,id:visitor}},{row:record}],status:'verified',pattern:/Teacher Kaohsiung/u,attempts:2},
    {label:'reader remains unavailable',inputs:[new Response(null,{status:503}),new Response(null,{status:503})],status:'unverified',pattern:/couldn’t verify this published offering/u,attempts:2},
  ])await t.test(label,async inner=>{
    const done=scope(inner,inputs);
    const result=await run(accountHandler,course,'Who teaches this course?');
    assert.equal(result.verification?.status,status);
    assert.equal(result.verification?.attempts,attempts);
    assert.match(result.answer,pattern);
    assert.equal(result.citations.length,status==='verified'?1:0);
    done();
  });
});

test('guest redirects retain the exact selected ID without doing a record lookup',async t=>{
  t.mock.method(globalThis,'fetch',reject);
  const guest=createResearchAssistantHandler();
  for(const route of [course,syllabus]){
    const login='/school-affairs/login?next='+encodeURIComponent(route);
    const reply=await run(guest,login,'How many credits is this course?');
    assert.equal(reply.status,'handoff');
    assert.equal(reply.citations[0].url,login);
    assert.doesNotMatch(reply.answer,/CAT301|Teacher Kaohsiung/u);
  }
});

test('selector and intent protect mixed personal requests, foreign IDs and unsafe return URLs',()=>{
  assert.equal(catalogDetailRoute(course+'&course='+visitor),null);
  assert.equal(catalogDetailRoute(course+'&token=opaque'),null);
  assert.equal(catalogDetailRoute('https://other.invalid'+course),null);
  assert.equal(catalogDetailGuestRoute('/school-affairs/login?next='+encodeURIComponent(course)),course);
  assert.equal(catalogDetailGuestRoute('/school-affairs/login?next='+encodeURIComponent('https://other.invalid'+course)),'');
  for(const question of ['What is my grade for this course?','Show this course’s credits and my current subjects.',
    'For published catalog offering ID '+visitor+', what course code, teacher and credits are recorded?',
    'Change the credits for this course','What are the credits for this course and my tuition balance?'])
    assert.equal(catalogDetailIntent(question,course),null,question);
});
