import assert from 'node:assert/strict';
import {test} from 'node:test';
import {options,readReply,sourceIdentity,validateFixtureAdapter,deploymentIdentity,evaluationSuite} from './run.mjs';
import {buildPublicCases} from './public-cases.mjs';
import {discoverSurfaces,readRouteLiteral} from './surface-inventory.mjs';

const event=(name,data,newline='\n')=>`event: ${name}${newline}data: ${JSON.stringify(data)}${newline}${newline}`;
const stream=text=>new Response(text,{headers:{'Content-Type':'text/event-stream; charset=utf-8'}});
const result={status:'answered',answer:'Synthetic reply',citations:[]};

async function mockedFetch(implementation,operation){
  const original=globalThis.fetch;
  globalThis.fetch=implementation;
  try{return await operation();}finally{globalThis.fetch=original;}
}

test('CLI rejects unknown modes, malformed limits, missing values and invalid dates',()=>{
  assert.equal(options([]).mode,'inventory');
  assert.equal(options(['--mode','live','--max-cases','3']).maxCases,3);
  for(const args of [['--unsafe','yes'],['--mode'],['--mode','--only','x'],['--mode','pretend'],['--max-cases','0'],['--max-cases','2.5'],['--max-cases','Infinity'],['--now','not-a-date']])assert.throws(()=>options(args),Error);
});

test('JSON success and HTTP-denial bodies are preserved for independent grading',async()=>{
  assert.deepEqual(await readReply(new Response(JSON.stringify(result),{headers:{'Content-Type':'application/json'}})),{body:result,events:[]});
  const denied={error:'Authentication is required.'};
  assert.deepEqual(await readReply(new Response(JSON.stringify(denied),{status:401,headers:{'Content-Type':'application/json'}})),{body:denied,events:[]});
});

test('SSE preserves ordered observable progress and the terminal response for CRLF/LF',async()=>{
  for(const newline of ['\n','\r\n']){
    const first={kind:'account',status:'running',label:'Loading owned records'},second={kind:'account',status:'complete',label:'Loaded owned records'};
    const reply=await readReply(stream(': heartbeat'+newline+newline+event('progress',first,newline)+event('progress',second,newline)+event('result',result,newline)));
    assert.deepEqual(reply,{body:result,events:[first,second]});
  }
});

test('an SSE error cannot be overwritten by a later success or result replay',async()=>{
  const error=event('error',{error:'Evidence lookup failed'});
  const badStreams=[error+event('result',result),event('result',result)+event('result',result),event('result',result)+event('progress',{kind:'late',status:'complete'})];
  for(const value of badStreams)await assert.rejects(readReply(stream(value)),/terminal/i);
  const reply=await readReply(stream(error));assert.equal(reply.body.error,'Evidence lookup failed');assert.equal(reply.body.answer,undefined);
});

test('truncated, malformed and excessive streams fail closed',async()=>{
  await assert.rejects(readReply(stream(event('progress',{kind:'account',status:'running'}))),/without a result/);
  await assert.rejects(readReply(stream('event: result\ndata: {broken}\n\n')),SyntaxError);
  await assert.rejects(readReply(stream(event('result',null))),/without a result/);
  await assert.rejects(readReply(stream(Array.from({length:101},()=>event('progress',{kind:'spam',status:'running'})).join('')+event('result',result))),/too many progress/);
  await assert.rejects(readReply(new Response('x'.repeat(2_000_001))),/exceeds/);
});

test('fixture lifecycle validation happens without invoking adapter mutations',()=>{
  let touched=false;
  const prepare=async()=>{touched=true;},forCase=async()=>({token:'synthetic-not-a-secret'}),cleanup=async()=>({verified:true});
  assert.throws(()=>validateFixtureAdapter({prepare,forCase}),/cleanup/);
  assert.throws(()=>validateFixtureAdapter({prepare,cleanup}),/forCase/);
  assert.throws(()=>validateFixtureAdapter(null),/adapter/);
  validateFixtureAdapter({prepare,forCase,cleanup});assert.equal(touched,false);
});

test('live deployment identity comes from the exact client manifest, never local HEAD',async()=>{
  const sha='a'.repeat(40),signal=new AbortController().signal;
  await mockedFetch(async(url,init)=>{
    assert.equal(String(url),'https://stu.best/release.json');assert.equal(init.redirect,'error');
    assert.equal(init.cache,'no-store');assert.ok(init.signal instanceof AbortSignal);
    return new Response(JSON.stringify({version:1,revision:sha,environment:'production',source:'vercel-git',builtAt:'2026-11-13T02:00:00.000Z'}),{headers:{'content-type':'application/json'}});
  },async()=>assert.deepEqual(await deploymentIdentity('https://stu.best',signal),{verified:true,sourceRevision:sha}));
});

test('missing, legacy, unverified and malformed deployment identities remain unverified',async()=>{
  const signal=new AbortController().signal;
  for(const reply of [
    ()=>new Response('Not Found',{status:404}),
    ()=>new Response('<html>SPA fallback</html>',{headers:{'content-type':'text/html'}}),
    ()=>new Response(JSON.stringify({repository:'someone-else/project',commitSha:'a'.repeat(40)}),{headers:{'content-type':'application/json'}}),
    ()=>new Response(JSON.stringify({repository:'LuxArt0317/std_edu_ai',commitSha:'short'}),{headers:{'content-type':'application/json'}}),
    ...[
      {version:1,revision:'a'.repeat(40),environment:'preview',source:'vercel-git',builtAt:'2026-11-13T02:00:00.000Z'},
      {version:1,revision:'a'.repeat(40),environment:'production',source:'local-git',builtAt:'2026-11-13T02:00:00.000Z'},
      {version:1,revision:null,environment:'local',source:'unverified',builtAt:'2026-11-13T02:00:00.000Z'},
      {version:1,revision:'a'.repeat(40),environment:'production',source:'vercel-git',builtAt:'2026-02-31T02:00:00.000Z'},
    ].map(value=>()=>new Response(JSON.stringify(value),{headers:{'content-type':'application/json'}})),
    ()=>new Response('x'.repeat(4097),{headers:{'content-type':'application/json'}}),
    ()=>new Response('not-json',{headers:{'content-type':'application/json'}}),
    ()=>{throw new Error('Offline');},
  ])await mockedFetch(reply,async()=>assert.deepEqual(await deploymentIdentity('https://stu.best',signal),{verified:false,sourceRevision:'unknown'}));
});

test('an unapproved origin is rejected before a provenance request',async()=>{
  await mockedFetch(()=>{assert.fail('No request to an unapproved project');},async()=>{
    for(const origin of ['https://other.example','https://stu.best.evil.example','https://name:password@stu.best','https://stu.best/path'])assert.deepEqual(await deploymentIdentity(origin,new AbortController().signal),{verified:false,sourceRevision:'unknown'});
  });
});

test('source identity declares commit, content fingerprint and dirty state independently',async()=>{
  const identity=await sourceIdentity();
  assert.match(identity.sourceRevision,/^[a-f0-9]{40}$/);assert.match(identity.workingTreeHash,/^[a-f0-9]{64}$/);
  assert.equal(typeof identity.dirty,'boolean');
});

test('public authentication cases assert HTTP denial rather than a fabricated answer',async()=>{
  const inventory=await discoverSurfaces(),cases=buildPublicCases(inventory),privacy=cases.filter(row=>row.id.startsWith('anonymous-records-'));
  assert.equal(privacy.length,inventory.tools.length);
  assert.ok(privacy.every(row=>row.fixtureKey==='anonymous'&&row.endpoint==='/api/affairs-assistant'&&row.expected.expectedStatusCode===401&&row.expected.behavior==='denial'));
});

test('full bank includes every source page and catalog entry without duplicate case IDs',async()=>{
  const suite=await evaluationSuite('2026-11-13T02:00:00Z');
  assert.equal(new Set(suite.cases.map(row=>row.id)).size,suite.cases.length);
  for(const page of suite.inventory.publicPages)assert.ok(suite.cases.some(row=>row.domain==='public-page-context'&&row.route===page.route),page.route);
  for(const service of suite.inventory.services)assert.equal(suite.cases.filter(row=>row.serviceId===service.id).length,4,service.id);
  assert.ok(suite.cases.filter(row=>row.domain==='public-page-context').every(row=>row.coveragePurpose?.includes('not proof')),'Metadata questions must not claim complete content QA.');
});


test('route discovery reads literal descriptors without executing arbitrary source',()=>{
  assert.deepEqual(readRouteLiteral("export const routes = [{id:'sao',views:[['all','All']]}] as const;",'routes'),[{id:'sao',views:[['all','All']]}]);
  assert.equal(readRouteLiteral("export const callback = '/school-affairs/auth/callback';",'callback'),'/school-affairs/auth/callback');
  for(const source of ["const routes = external();","const routes = [...other];","const different = [];","const routes = {get id(){return 'x';}};"])assert.throws(()=>readRouteLiteral(source,'routes'),Error);
});

test('surface inventory distinguishes protected subpages, query details and auth transitions',async()=>{
  const inventory=await discoverSurfaces(),routes=new Set(inventory.routeFamilies.flatMap(row=>row.routes));
  for(const route of ['/school-affairs/services/leave/edit/:id','/school-affairs/services/leave/archive','/school-affairs/services/leave/periods','/school-affairs/services/internship/self_assessment','/school-affairs/services/12-4?course=:id','/school-affairs/services/12-4?syllabus=:id','/dtm/course/:courseId/assignment/:assignmentId/edit','/school-affairs/auth/callback'])assert.ok(routes.has(route),route);
  assert.equal(routes.has('/school-affairs/auth'),false,'A nonexistent shortened callback cannot stand in for the real callback.');
  const menus=inventory.routeFamilies.find(row=>row.id==='school-menus');
  assert.ok(menus.routes.includes('/school-affairs/menu/menu/custom'));assert.ok(menus.routes.includes('/school-affairs/menu/infoSystem/library'));
  const protectedFamily=inventory.routeFamilies.find(row=>row.id==='student-leave');
  assert.equal(protectedFamily.auth,'signed-in');assert.ok(protectedFamily.browserChecks.includes('sessionVerified'));
  const transition=inventory.routeFamilies.find(row=>row.id==='authentication-transitions');
  assert.deepEqual(transition.browserChecks,['sessionVerified']);assert.ok(transition.browserScenario.includes('resulting'));
  assert.ok(inventory.coverageLimits.some(value=>value.includes('not browser acceptance')));
});
