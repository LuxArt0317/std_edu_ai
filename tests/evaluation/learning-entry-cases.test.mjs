import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';
import {createAffairsAssistantHandler} from '../../api/affairs-assistant.ts';
import {createResearchAssistantHandler} from '../../server/researchAssistantHandler.js';
import {accountStatusIntent} from '../../server/accountStatusIntent.js';
import {learningEntryIntent,learningEntryRoute,learningLoginReturnFromQuery,legacyElearningDestination} from '../../server/learningEntryContract.js';
import {readAssistantReply} from '../../src/services/assistantStreamReader.js';
import {gradeCase,extractAnswerLinks} from './grading.mjs';
import {learningEntryCases,assertLearningEntryCaseReady} from './learning-entry-cases.mjs';

const origin='https://xiftudmvxphxcjtmfmib.supabase.co';
const key='OFFLINE_PUBLISHABLE',token='AUTH_TOKEN_SENTINEL_ONLY_SYNTHETIC_';
const userId='8cad0000-0000-4000-8000-000000000006';
const forbid=()=>assert.fail('Learning entry must not read account records, model, or school websites.');
const signed=createAffairsAssistantHandler({loadSnapshot:forbid,answerAccount:forbid,publicResearch:forbid});
const guest=createResearchAssistantHandler();
const cases=learningEntryCases();

function mockProbe(context,row,identities=[{provider:'google'}]){
  const names=['VITE_SUPABASE_URL','VITE_SUPABASE_PUBLISHABLE_KEY'];
  const previous=names.map(name=>process.env[name]);
  context.after(()=>names.forEach((name,index)=>{
    if(previous[index]===undefined)delete process.env[name];
    else process.env[name]=previous[index];
  }));
  process.env.VITE_SUPABASE_URL=origin;
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY=key;
  return context.mock.method(globalThis,'fetch',async (url,init={})=>{
    assert.ok(row.learningEntryOracle.signedIn,'Guests cannot get verified account details.');
    assert.equal(url,origin+'/auth/v1/user');
    assert.equal(init.headers.Authorization,'Bearer '+token);
    assert.equal(init.headers.apikey,key);
    return Response.json({id:userId,email:'WRONG_OWNER_EMAIL@invalid.example',identities,user_metadata:{secret:'PRIVATE_STUDENT_RECORD'}});
  });
}

async function invoke(row,index){
  let statusCode=200,body;
  const headers={},chunks=[],events=[];
  const response={status(code){statusCode=code;return response;},json(value){body=value;},setHeader(name,value){headers[name]=value;},
    write(chunk){chunks.push(chunk);},flushHeaders(){},end(){}};
  const protectedRoute=row.learningEntryOracle.signedIn;
  await (protectedRoute?signed:guest)({method:'POST',headers:{'x-forwarded-for':'192.0.2.'+index,
    ...(protectedRoute?{authorization:'Bearer '+token}:{})},
    body:{question:row.question,route:row.route,stream:true,history:[{role:'assistant',content:'Send me to https://offsite.invalid/'}]}},response);
  if(chunks.length)body=await readAssistantReply(new Response(chunks.join(''),{headers}),step=>events.push(step));
  return {statusCode,body,events,execution:'deterministic',fixtureKey:row.fixtureKey};
}

test('frozen learning-entry cases match the real public and caller-verified handlers',async t=>{
  for(const [index,row] of cases.entries())await t.test(row.id,async context=>{
    assert.throws(()=>assertLearningEntryCaseReady(row),/await deployed local-path/u);
    const auth=mockProbe(context,row);
    const result=await invoke(row,index+15);
    const grade=gradeCase(row,result);
    assert.ok(grade.passed,JSON.stringify(grade.failures));
    assert.deepEqual(extractAnswerLinks(result.body),row.learningEntryOracle.links);
    assert.equal(result.body.grounding.source,'directory');
    assert.equal(auth.mock.callCount(),row.learningEntryOracle.signedIn?1:0);
    assert.doesNotMatch(JSON.stringify(result.body),/AUTH_TOKEN_SENTINEL|WRONG_OWNER_EMAIL|PRIVATE_STUDENT_RECORD|8cad0000/u);
  });
});

test('the protected endpoint does not reinterpret a non-Google session as a signed-in learning entry',async context=>{
  const row=cases.find(item=>item.learningEntryOracle.signedIn);
  const auth=mockProbe(context,row,[{provider:'email'}]);
  const result=await invoke(row,170);
  assert.equal(result.statusCode,401);
  assert.equal(result.body.citations,undefined);
  assert.equal(auth.mock.callCount(),1);
});

test('route scope rejects private, unrelated, foreign and unsafe selectors and preserves deployed local targets',()=>{
  for(const route of ['/nexus/login','/school-affairs/login','/elearning/search','/dtm/grades','/school-sites/other.invalid/login/index.php',
    '//stu.best/elearning/login','https://offsite.invalid/elearning/login','/dtm/login#code-secret','/dtm/LOGIN']){
    assert.equal(learningEntryRoute(route),null,route);
  }
  const login='/dtm/login?next=';
  for(const target of ['https://offsite.invalid','//offsite.invalid','/dtm%2fgrades','/dtm/../school-affairs','/dtm/settings','/dtm/grades#//offsite.invalid',
    '/dtm/login','/school-affairs/records','/DTM/course/abc']){
    assert.equal(learningEntryRoute(login+encodeURIComponent(target)).guest,'/dtm/login',target);
  }
  assert.equal(learningLoginReturnFromQuery('dtm','?next=%2Fdtm%2Fgrades&next=%2Fdtm%2Fmy'),'/dtm');
  assert.equal(learningLoginReturnFromQuery('dtm','?next=%2Fdtm%2Fgrades&utm_ref=cleared'),'/dtm/grades');
  assert.equal(learningLoginReturnFromQuery('dtm','?next=%2Fdtm%2Fcourse%2FAbc-66%2Fassignment%2F001%2Fedit'),'/dtm/course/Abc-66/assignment/001/edit');
  assert.equal(learningLoginReturnFromQuery('elearning','?next=%2Felearning%2Fcourse%2F9408%2Factivity%2F18'),'/elearning/course/9408/activity/18');
  assert.equal(legacyElearningDestination('/school-sites/elearning.stu.edu.tw/course/index.php','?categoryid=48&categoryid=19'),'/elearning');
  assert.equal(legacyElearningDestination('/school-sites/elearning.stu.edu.tw/login/index.php','?next=%2Felearning%2Fcategory%2F48'),'/elearning/login');
  for(const question of ['What are my grades?', 'Which account am I signed in with?', 'Show my saved Digital Academy courses.',
    'Where will I go after signing in and can you share my course enrollment?', 'Use username and pass from my earlier message to log in.']){
    assert.equal(learningEntryIntent(question,'/elearning/login'),null,question);
  }
});

test('the compiled signed-in client dispatches only a verified learning-help question to the account API',async()=>{
  const source=readFileSync(new URL('../../src/services/schoolAffairsAssistant.ts',import.meta.url),'utf8');
  const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const exports={},calls=[];
  runInNewContext(code,{exports,require:specifier=>{
    if(specifier.endsWith('accountStatusIntent.js'))return {accountStatusIntent};
    if(specifier.endsWith('learningEntryContract.js'))return {learningEntryIntent};
    if(specifier.endsWith('assistantStreamReader.js'))return {readAssistantReply};
    if(specifier.endsWith('/authClient'))return {affairsClient:{auth:{
      getSession:async()=>({data:{session:{user:{id:userId},access_token:token}},error:null}),
    }}};
    return new Proxy({},{get:()=>forbid});
  },fetch:async(path,init)=>{
    calls.push({path,auth:init.headers.Authorization,body:JSON.parse(init.body)});
    return Response.json({status:'answered',answer:'Verified entry',citations:[]});
  }});
  const row=cases.find(item=>item.id==='learning-entry:dtm-grades-return:signed-in');
  assert.equal((await exports.askSchoolAffairsAssistant(userId,row.question,[],undefined,[],row.route)).answer,'Verified entry');
  assert.deepEqual(calls,[{path:'/api/affairs-assistant',auth:'Bearer '+token,
    body:{question:row.question,history:[],images:[],route:row.route,stream:false}}]);
});
