import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createHash} from 'node:crypto';
import {options,main,evaluationSuite,feeRemissionRunnerCases,validateFeeRemissionRunnerCases,validateFixtureAdapter} from './run.mjs';
import {buildPlannedFeeRemissionCases} from './fee-remission-cases.mjs';
import {feeRemissionLivePlanManifest,feeRemissionLiveFamilyForCase} from './fee-remission-live-plan.mjs';

const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const revision='a'.repeat(40),digest='b'.repeat(64),now='2026-11-16T08:00:00.000Z';
const familyArgs=['--case-family','fee-remission'];
const preview='https://fee-remission-offline-v1-d286.vercel.app';
const baseLiveArgs=['--mode','live',...familyArgs,'--fixture-module','tests/evaluation/offline-only-adapter.mjs','--now',now];
const liveArgs=[...baseLiveArgs,'--origin',preview,'--approved-preview-origin',preview];
const inventory={hash:'c'.repeat(64),services:[],tools:[],routeFamilies:[],publicPages:[]};
const clone=value=>structuredClone(value);
const suite=()=>{const cases=feeRemissionRunnerCases();return {cases,inventory:clone(inventory),suiteHash:hash(cases)};};
const proof=envelope=>{
  envelope.stateBefore={ownedRecordsDigest:digest};envelope.stateAfterProposal={ownedRecordsDigest:digest};
  envelope.fixtureReadback={verified:true,independentGolden:true};
};

/** Entire live-shaped execution is injected: no Git, providers, credentials,
 * persistent reports, identity initializers, database or actual model calls. */
function harness({anonymousToken,omitProof=false,failAfter=false,driftAt=Infinity,dirty=false,manifestRevision=revision,mutateAdapterCases=false}={}){
  const calls={prepare:[],forCase:[],afterCase:[],posts:[],manifests:0,cleanup:0,reports:[]};
  const adapter={fixtureModes:Object.freeze(['fee-remission-only']),
    async prepare(value){calls.prepare.push(clone({...value,signal:undefined}));if(mutateAdapterCases)value.cases[0].question='adapter must not replace the oracle';},
    async forCase(row,context){calls.forCase.push({row:clone(row),context:{...context,signal:undefined}});if(mutateAdapterCases)row.question='adapter mutation';
      return row.plannedFixture.auth==='anonymous'?(anonymousToken===undefined?{}:{token:anonymousToken}):{token:'offline-disposable-token'};},
    async afterCase(row,envelope,context){calls.afterCase.push({row:clone(row),context:{...context,signal:undefined}});
      if(failAfter)throw new Error('Offline native readback mismatch');if(!omitProof)proof(envelope);},
    async cleanup(){calls.cleanup++;return {verified:true};},
  };
  const dependencies={
    sourceIdentity:async()=>({sourceRevision:revision,workingTreeHash:digest,dirty}),
    evaluationSuite:async(_time,selection)=>{assert.deepEqual(selection,{caseFamily:'fee-remission'});return suite();},
    saveReport:async(_path,report)=>calls.reports.push(clone(report)),loadFixtureAdapter:async()=>adapter,log(){},
    pace:async(start,_signal,before)=>{await before();return start(0);},
    async fetchImpl(url,init){
      if(new URL(url).pathname==='/release.json'){
        calls.manifests++;return new Response(JSON.stringify({version:1,revision:calls.manifests>=driftAt?'d'.repeat(40):manifestRevision,
          source:'vercel-git',environment:String(url).startsWith('https://stu.best/')?'production':'preview',builtAt:'2026-11-14T00:00:00.000Z'}),{headers:{'content-type':'application/json'}});
      }
      assert.equal(new URL(url).pathname,'/api/affairs-assistant');
      calls.posts.push({url:String(url),init:{...init,signal:undefined},body:JSON.parse(init.body)});
      const anonymous=!Object.hasOwn(init.headers,'Authorization');
      return new Response(JSON.stringify(anonymous?{error:'Authentication is required.'}:{status:'answered',answer:'Offline runner control.',citations:[],verification:{status:'verified',attempts:1}}),
        {status:anonymous?401:200,headers:{'content-type':'application/json'}});
    },
  };
  async function run(args=liveArgs){const previous=process.exitCode;try{return await main(args,dependencies);}finally{process.exitCode=previous;}}
  return {calls,adapter,dependencies,run};
}

test('fee family is opt-in, fixed to the complete packet, and cannot masquerade as draft acceptance',()=>{
  assert.equal(options([]).caseFamily,undefined);assert.equal(options(familyArgs).caseFamily,'fee-remission');
  assert.equal(options(liveArgs).mode,'live');
  for(const args of [['--case-family','unknown'],['--case-family'],['--mode','draft',...familyArgs],['--mode','retrieval',...familyArgs],
    ['--mode','review',...familyArgs],['--mode','live',...familyArgs],baseLiveArgs,[...baseLiveArgs,'--origin','https://stu.best','--approved-preview-origin','https://stu.best'],...['--only','--domain','--max-cases'].map(key=>[...familyArgs,key,key==='--max-cases'?'20':'feeRemission'])])
    assert.throws(()=>options(args));
});

test('exact 20 canonical IDs retain literal oracles and route anonymous denial without a session',()=>{
  const planned=buildPlannedFeeRemissionCases(),cases=feeRemissionRunnerCases();
  assert.equal(validateFeeRemissionRunnerCases(cases),true);
  assert.deepEqual(cases.map(row=>row.id),feeRemissionLivePlanManifest.eligibleCaseIds);
  assert.equal(cases.length,20);assert.equal(new Set(cases.map(row=>row.id)).size,20);
  for(const row of cases){
    const original=planned.find(item=>item.id===row.id);assert.deepEqual(row.expected,original.expected);
    assert.equal(row.plannedFixture.family,feeRemissionLiveFamilyForCase(row));
    assert.equal(row.fixtureKey,row.plannedFixture.auth==='anonymous'?'anonymous':'planned:'+row.plannedFixture.family);
  }
  const anonymous=cases.find(row=>row.plannedFixture.auth==='anonymous');
  assert.equal(anonymous.endpoint,'/api/affairs-assistant');assert.equal(anonymous.expected.expectedStatusCode,401);
  assert.equal(cases.filter(row=>row.fixtureKey==='anonymous').length,1);
  assert.equal(cases.some(row=>feeRemissionLivePlanManifest.offlineOnlyCaseIds.includes(row.id)),false);
  cases[0].question='local mutation';assert.notEqual(feeRemissionRunnerCases()[0].question,cases[0].question);
});

test('missing, duplicate, foreign, reordered, weakened and falsely authenticated cases fail before execution',()=>{
  for(const change of [rows=>rows.pop(),rows=>rows.push(rows[0]),rows=>rows.reverse(),rows=>{rows[0]=rows[1];},
    rows=>{rows[0].id='account:not-fee-remission';},rows=>{rows[0].expected.facts=[];},rows=>{rows[0].plannedFixture.family='charges';},
    rows=>{rows.at(-1).fixtureKey='planned:feeRemission';},rows=>{rows.at(-1).endpoint='/api/research-assistant';}]){
    const rows=feeRemissionRunnerCases();change(rows);assert.throws(()=>validateFeeRemissionRunnerCases(rows),/exact 20/);
  }
});

test('fee evaluation builds separately without mounting the family into the default bank',async()=>{
  const [normal,isolated]=await Promise.all([evaluationSuite(now),evaluationSuite(now,{caseFamily:'fee-remission'})]);
  assert.equal(isolated.cases.length,20);assert.equal(isolated.suiteHash,hash(isolated.cases));
  assert.equal(normal.cases.some(row=>row.id==='account:fee-remission-all-history'),false);
  assert.equal(normal.cases.some(row=>row.id==='account:unfinished-assignments'),true);
  assert.deepEqual(isolated.inventory,normal.inventory);
  await assert.rejects(evaluationSuite(now,{caseFamily:'unknown'}),/Unknown case family/);
});

test('fee adapter support and afterCase are mandatory before prepare can create anything',async()=>{
  const bare={prepare(){},forCase(){},cleanup(){}};
  validateFixtureAdapter(bare);
  assert.throws(()=>validateFixtureAdapter(bare,{fixtureMode:'fee-remission-only'}),/explicitly support/);
  assert.throws(()=>validateFixtureAdapter({...bare,afterCase(){},fixtureModes:['normal']},{fixtureMode:'fee-remission-only'}));
  for(const missing of ['afterCase','fixtureModes']){
    const h=harness();delete h.adapter[missing];await assert.rejects(h.run(),/explicitly support/);
    assert.equal(h.calls.prepare.length,0);assert.equal(h.calls.posts.length,0);assert.equal(h.calls.cleanup,1);
  }
});

test('isolated runner conveys each family, keeps the pinned identity, and proves anonymous rows unchanged',async()=>{
  const h=harness({mutateAdapterCases:true}),report=await h.run();
  assert.equal(report.caseFamily,'fee-remission');assert.equal(report.fixtureMode,'fee-remission-only');
  assert.deepEqual(report.selectedCases,feeRemissionLivePlanManifest.eligibleCaseIds);
  assert.equal(report.totalCases,20);assert.equal(report.results.length,20);assert.equal(report.suiteHash,hash(feeRemissionRunnerCases()));
  assert.equal(h.calls.prepare.length,1);assert.equal(h.calls.prepare[0].fixtureMode,'fee-remission-only');
  assert.equal(h.calls.prepare[0].expectedReleaseRevision,revision);assert.equal(h.calls.prepare[0].caseFamily,'fee-remission');
  assert.equal(h.calls.forCase.length,20);assert.equal(h.calls.afterCase.length,20);assert.equal(h.calls.posts.length,20);
  assert.equal(h.calls.cleanup,1);assert.equal(report.cleanup.complete,true);
  for(let i=0;i<20;i++){
    const row=feeRemissionRunnerCases()[i],before=h.calls.forCase[i],after=h.calls.afterCase[i],post=h.calls.posts[i],result=report.results[i];
    assert.equal(before.context.fixtureFamily,row.plannedFixture.family);assert.equal(after.context.fixtureFamily,row.plannedFixture.family);
    assert.equal(before.context.fixtureMode,'fee-remission-only');assert.equal(after.context.fixtureMode,'fee-remission-only');
    assert.equal(post.body.question,row.question);assert.equal(result.caseId,row.id);assert.equal(result.executed,true);
    assert.equal(result.sourceRevision,revision);assert.equal(result.response.deploymentCheck.verified,true);
    assert.equal(result.response.fixtureReadback.verified,true);
    assert.equal(Object.hasOwn(post.init.headers,'Authorization'),row.fixtureKey!=='anonymous');
    assert.equal(post.init.credentials,'omit');assert.equal(post.init.redirect,'error');
  }
  assert.equal(report.results.at(-1).response.statusCode,401);assert.equal(report.results.at(-1).fixtureKey,'anonymous');
  assert.equal(report.deploymentPin.rechecked,20);assert.equal(report.deploymentPin.issued,20);
  assert.equal(report.injectedDependencies,true);assert.equal(report.assessment.releaseReady,false);
  assert.equal(report.assessment.failures.some(row=>row.id==='run.injectedDependencies'),true);
});

test('anonymous fixture token is rejected without an authenticated request and still receives afterCase proof',async()=>{
  const h=harness({anonymousToken:'unexpected-token'}),report=await h.run();
  assert.equal(h.calls.posts.length,19);assert.equal(h.calls.afterCase.length,20);
  const last=report.results.at(-1);assert.equal(last.caseId,'account:fee-remission-anonymous');
  assert.equal(last.executed,false);assert.equal(last.failureKind,'setup');assert.equal(last.passed,false);
  assert.match(last.response.body.error,/must not receive a session token/);assert.equal(last.response.fixtureReadback.verified,true);
});

test('failed or absent post-response readback retains the response, stops the run and verifies cleanup',async()=>{
  for(const control of [{omitProof:true},{failAfter:true}]){
    const h=harness(control),report=await h.run();
    assert.equal(h.calls.posts.length,1);assert.equal(h.calls.afterCase.length,1);assert.equal(h.calls.cleanup,1);
    assert.equal(report.results.length,1);assert.equal(report.results[0].response.body.answer,'Offline runner control.');
    assert.equal(report.results[0].response.fixtureIntegrityFailed,true);assert.equal(report.results[0].failureKind,'infrastructure');
    assert.ok(report.results[0].failures.some(row=>row.id==='run.fixtureReadbackFailed'));assert.equal(report.cleanup.complete,true);
  }
});

test('first fee fixture setup failure stops later transitions, keeps the unexecuted case and still cleans up',async()=>{
  const h=harness();h.adapter.forCase=async(row,context)=>{
    h.calls.forCase.push({row,context});throw new Error('Offline uncertain fixture transition');
  };
  const report=await h.run();
  assert.equal(h.calls.forCase.length,1);assert.equal(h.calls.posts.length,0);assert.equal(h.calls.afterCase.length,0);assert.equal(h.calls.cleanup,1);
  assert.equal(report.selectedCases.length,20);assert.equal(report.results.length,1);assert.equal(report.results[0].executed,false);
  assert.equal(report.results[0].failureKind,'setup');assert.equal(report.results[0].passed,false);
  assert.match(report.results[0].response.body.error,/uncertain fixture transition/);
  assert.match(report.runFailure,/no further cases/);assert.equal(report.cleanup.complete,true);
});

test('anonymous denial cannot pass the runner without its own final unchanged-row proof',async()=>{
  const h=harness(),original=h.adapter.afterCase;
  h.adapter.afterCase=async(row,envelope,context)=>{
    await original(row,envelope,context);
    if(row.fixtureKey==='anonymous')delete envelope.fixtureReadback;
  };
  const report=await h.run(),last=report.results.at(-1);
  assert.equal(h.calls.posts.length,20);assert.equal(h.calls.afterCase.length,20);
  assert.equal(last.caseId,'account:fee-remission-anonymous');assert.equal(last.response.statusCode,401);
  assert.equal(last.response.fixtureIntegrityFailed,true);assert.equal(last.passed,false);
  assert.equal(report.cleanup.complete,true);
});

test('wrong manifest, dirty sources and drift block setup or further requests while preserving failed evidence',async()=>{
  for(const control of [{dirty:true},{manifestRevision:'e'.repeat(40)}]){
    const h=harness(control);await assert.rejects(h.run());assert.equal(h.calls.prepare.length,0);assert.equal(h.calls.posts.length,0);
  }
  const h=harness({driftAt:4}),report=await h.run();
  assert.equal(h.calls.posts.length,1);assert.equal(h.calls.afterCase.length,1);assert.equal(h.calls.cleanup,1);
  assert.equal(report.results[0].response.body.answer,'Offline runner control.');
  assert.equal(report.results[0].response.deploymentIntegrityFailed,true);assert.equal(report.results[0].passed,false);
  assert.equal(report.results[0].response.sourceRevision,'unknown');
});

test('inventory is a no-execution 20-case plan, and Preview requires explicit exact approval',async()=>{
  const h=harness(),report=await h.run([...familyArgs,'--now',now]);
  assert.equal(report.results.length,0);assert.equal(report.cases.length,20);assert.equal(h.calls.manifests,0);
  assert.equal(h.calls.prepare.length,0);assert.equal(h.calls.cleanup,0);assert.equal(report.assessment.releaseReady,false);
  const rejected=harness();await assert.rejects(rejected.run([...baseLiveArgs,'--origin',preview]),/explicitly approved/);
  assert.equal(rejected.calls.manifests,0);
  const approved=harness(),live=await approved.run(liveArgs);
  assert.equal(live.deploymentPin.manifest.environment,'preview');assert.equal(approved.calls.prepare[0].approvedPreviewOrigin,preview);
  assert.ok(approved.calls.posts.every(row=>row.url===preview+'/api/affairs-assistant'));
});

test('a bad isolated suite or suite hash fails before fixture setup or request dispatch',async()=>{
  for(const bad of ['id','hash']){
    const h=harness();h.dependencies.evaluationSuite=async()=>{const value=suite();if(bad==='id')value.cases[0].id='account:unrelated';else value.suiteHash='0'.repeat(64);return value;};
    await assert.rejects(h.run(),/manifest cases|suite hash/);assert.equal(h.calls.prepare.length,0);assert.equal(h.calls.posts.length,0);
  }
});
