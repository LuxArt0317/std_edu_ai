import assert from 'node:assert/strict';
import test from 'node:test';
import {createAffairsAssistantHandler} from '../../api/affairs-assistant.ts';
import {createResearchAssistantHandler} from '../../server/researchAssistantHandler.js';
import {campusEntryIntent,privateCampusTransitionPath} from '../../server/campusEntryContract.js';
import {assistantPageRoute} from '../../src/services/assistantPageRoute.js';
import {gradeCase,extractAnswerLinks} from './grading.mjs';
import {campusEntryCases,assertCampusEntryCaseReady,sensitiveCampusMarkers} from './campus-entry-cases.mjs';

const provider='https://xiftudmvxphxcjtmfmib.supabase.co';
const caller='4c9a0000-0000-4000-8000-000000000003';
const token='OFFLINE_CAMPUS_ONLY_TOKEN_4c9a0000';
const key='OFFLINE_CAMPUS_ONLY_PUBLISHABLE';
const forbid=()=>assert.fail('A route guide must not read personal records, a school website, or an AI provider.');
const signed=createAffairsAssistantHandler({loadSnapshot:forbid,answerAccount:forbid,publicResearch:forbid});
const guest=createResearchAssistantHandler();

function authProbe(context,member){
  const envKeys=['VITE_SUPABASE_URL','VITE_SUPABASE_PUBLISHABLE_KEY'];
  const prior=envKeys.map(name=>process.env[name]);
  context.after(()=>envKeys.forEach((name,index)=>{
    if(prior[index]===undefined)delete process.env[name];
    else process.env[name]=prior[index];
  }));
  process.env.VITE_SUPABASE_URL=provider;
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY=key;
  return context.mock.method(globalThis,'fetch',async (url,init)=>{
    assert.equal(member,true);
    assert.equal(url,provider+'/auth/v1/user');
    assert.equal(init.headers.Authorization,'Bearer '+token);
    return Response.json({id:caller,email:'OTHER_ACCOUNT_SENTINEL@fixture.invalid',identities:[{provider:'google'}],
      user_metadata:{student:'PRIVATE_STUDENT_SENTINEL'}});
  });
}

async function ask(row,index){
  const {signedIn,transportRoute}=row.campusEntryOracle;
  let statusCode=200,body;
  const response={status(code){statusCode=code;return response;},setHeader(){},json(value){body=value;}};
  await (signedIn?signed:guest)({method:'POST',headers:{
    'x-forwarded-for':'192.0.2.'+index,...(signedIn?{authorization:'Bearer '+token}:{}),
  },body:{route:transportRoute,question:row.question,history:[{role:'user',content:sensitiveCampusMarkers.join(' ')}],
    userId:'4c9a0000-0000-4000-8000-000000000099',code:'OAUTH_CODE_SENTINEL',state:'OAUTH_STATE_SENTINEL'}},response);
  return {statusCode,body,events:[],execution:'deterministic',fixtureKey:row.fixtureKey};
}

test('frozen cases run the actual public and protected handlers without provider or student-data reads',async t=>{
  for(const [index,row] of campusEntryCases().entries())await t.test(row.id,async context=>{
    assert.throws(()=>assertCampusEntryCaseReady(row),/await deployed route/u);
    const calls=authProbe(context,row.campusEntryOracle.signedIn);
    const answer=await ask(row,index+70);
    const evaluation=gradeCase(row,answer);
    assert.ok(evaluation.passed,JSON.stringify(evaluation.failures));
    assert.deepEqual(extractAnswerLinks(answer.body),row.campusEntryOracle.links);
    assert.equal(calls.mock.callCount(),row.campusEntryOracle.signedIn?1:0);
    assert.doesNotMatch(JSON.stringify(answer.body),/OFFLINE_CAMPUS_ONLY|4c9a0000|SAMLRequest|RelayState|grant_type/u);
  });
});

test('callback, SAML and embedded-parent browser context strips address-bar secrets',()=>{
  const callback='/school-affairs/auth/callback',saml='/auth/realms/stuarm/protocol/saml';
  const page=(pathname,search,origin='https://stu.best')=>({location:{pathname,search,origin}});
  const authQuery='?code=OAUTH_CODE_SENTINEL&state=OAUTH_STATE_SENTINEL';
  const samlQuery='?SAMLRequest=SAML_REQUEST_SENTINEL&RelayState=https%3A%2F%2Foutside.invalid';
  assert.equal(assistantPageRoute(false,page(callback,authQuery)),callback);
  assert.equal(assistantPageRoute(false,page(saml,samlQuery)),saml);
  const embedded={...page('/campus-assistant','?embed=1'),parent:page(callback,authQuery)};
  assert.equal(assistantPageRoute(true,embedded),callback);
  embedded.parent=page('/local-pages','?q=library');
  assert.equal(assistantPageRoute(true,embedded),'/local-pages?q=library');
  assert.equal(privateCampusTransitionPath('https://offsite.invalid'+callback+authQuery),null);
  assert.equal(privateCampusTransitionPath(saml+'?SAMLRequest='+'x'.repeat(9000)),saml);
});

test('scope excludes other school/private data and compound operations outside the redacted transitions',()=>{
  for(const route of ['/local-pages','/campus-directory','/school-affairs/privacy','/ePortal/apMenu.asp']){
    for(const question of ['Show me Alice’s academic schedule.','Send my Google password.',
      'What information does Google share with this site? Delete my account too.']){
      assert.equal(campusEntryIntent(question,route),null,[question,route].join(' '));
    }
  }
  assert.equal(campusEntryIntent('What information does Google share with this site?','/school-affairs/records'),null);
  assert.equal(campusEntryIntent('How do I use the campus directory?','/campus-directory/other'),null);
  assert.equal(campusEntryIntent('Read my official tuition balance.','/school-affairs/auth/callback')?.topic,'callback');
});
