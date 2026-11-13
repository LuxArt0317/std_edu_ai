import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {test} from 'node:test';
import {verifyEvidenceAnswer,repairEvidenceAnswer,reviewMatchesEvidence} from '../../server/answerVerificationModel.js';
import {runAnswerVerification} from '../../server/answerVerification.js';
import {accountEvidence} from '../../server/answerVerificationAccount.js';
import {fixtureForCase} from '../evaluation/fixtures.mjs';

const evidence=[{id:'account:academicAttendance',content:JSON.stringify({value:'literal',rules:'Local demonstration records only.'})}];
const candidate={status:'answered',answer:'The candidate contains a literal assertion.',citations:[]};
const claim=(text:string,supported=false,path='/value')=>({claim:text,supported,evidenceId:evidence[0].id,quotes:[],jsonPaths:[path]});
const review=(claims:ReturnType<typeof claim>[],supported=false)=>({supported,answersQuestion:true,claims});
const categories=new Set(['provenance','record_availability','term_selection','calculation','action_status','other']);
type Request={max_output_tokens:number;store:boolean;text:{format:{name:string;schema:any}}};

async function mocked(replies:unknown[],operation:(logs:unknown[][],requests:Request[])=>Promise<void>){
  const savedFetch=globalThis.fetch,savedKey=process.env.OPENAI_API_KEY,savedWarn=console.warn;
  const logs:unknown[][]=[],requests:Request[]=[];
  process.env.OPENAI_API_KEY='synthetic-diagnostic-test';console.warn=(...args)=>{logs.push(args);};
  globalThis.fetch=async(url,options)=>{
    assert.equal(String(url),'https://api.openai.com/v1/responses','No network request is permitted in this test.');
    assert.ok(replies.length,'Unexpected extra provider invocation.');
    requests.push(JSON.parse(String(options?.body)));
    return Response.json({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify(replies.shift())}]}]});
  };
  try{await operation(logs,requests);assert.equal(replies.length,0);}finally{
    globalThis.fetch=savedFetch;console.warn=savedWarn;
    if(savedKey===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=savedKey;
  }
}
const diagnostics=(logs:unknown[][])=>{
  const row=logs.find(item=>item[0]==='Answer evidence review rejected');assert.ok(row);
  return row[1] as {unsupportedClaims:number;unmatchedReferences:number;unsupportedClaimDiagnostics:Array<{index:number;categories:string[]}>};
};
const verify=()=>verifyEvidenceAnswer({question:'Show my saved statistics.',candidate,evidence,deadline:Date.now()+10000});

test('unsupported claim diagnostics contain only fixed lexical categories and local one-based indexes',async()=>{
  const claims=[claim('Official university sample provenance source source.'),claim('The stored record is missing and empty.'),claim('The current academic term is the latest semester.'),claim('Calculate the total hours and average credits.'),claim('The request was approved and submitted.'),claim('Uncategorized assertion.'),claim('Official university sample.',true)];
  await mocked([review(claims)],async logs=>{
    assert.equal((await verify()).ok,false);
    assert.deepEqual(diagnostics(logs).unsupportedClaimDiagnostics,[
      {index:1,categories:['provenance']},{index:2,categories:['record_availability']},
      {index:3,categories:['term_selection']},{index:4,categories:['calculation']},
      {index:5,categories:['action_status']},{index:6,categories:['other']},
    ]);
    assert.equal(diagnostics(logs).unsupportedClaims,6);assert.equal(diagnostics(logs).unmatchedReferences,0);
  });
});

test('malicious claim values, emails, URLs, pointers and source identifiers cannot enter diagnostic output',async()=>{
  const secrets=['private.student@example.invalid','PRIVATE_SECRET_TOKEN_987','https://secret.invalid/download?token=PRIVATE_URL_TOKEN','PRIVATE_SOURCE_IDENTIFIER','PRIVATE_JSON_POINTER','PRIVATE_LONG_PAYLOAD_'.repeat(500)];
  const attack=claim('Official sample current records are missing. '+secrets.join(' '));
  attack.evidenceId=secrets[3];attack.jsonPaths=['/'+secrets[4]];
  await mocked([review([attack])],async logs=>{
    assert.equal((await verify()).ok,false);
    const output=JSON.stringify(logs);for(const secret of secrets)assert.equal(output.includes(secret),false);
    assert.doesNotMatch(output,/@|https:|PRIVATE_|download|token/);
    const hints=diagnostics(logs).unsupportedClaimDiagnostics;
    assert.deepEqual(hints,[{index:1,categories:['provenance','record_availability','term_selection']}]);
    assert.deepEqual(Object.keys(hints[0]).sort(),['categories','index']);
    assert.equal(diagnostics(logs).unmatchedReferences,1);
  });
});

test('diagnostic scanning and indexes are bounded independently of malformed provider excess',async()=>{
  const claims=Array.from({length:95},(_,index)=>claim(index===0?'z'.repeat(4096)+' official university provenance':index===1?'Current current current record record record.':'PRIVATE_LONG_PAYLOAD_'.repeat(500),index===2));
  await mocked([review(claims)],async logs=>{
    assert.equal((await verify()).ok,false);
    const hints=diagnostics(logs).unsupportedClaimDiagnostics;
    assert.equal(hints.length,79);assert.equal(hints[0].index,1);assert.equal(hints.at(-1)?.index,80);
    assert.equal(new Set(hints.map(item=>item.index)).size,hints.length);
    assert.deepEqual(hints[0].categories,['other'],'Words outside the bounded prefix are not scanned.');
    assert.deepEqual(hints[1].categories,['record_availability','term_selection']);
    assert.ok(hints.every(item=>Number.isInteger(item.index)&&item.index>=1&&item.index<=80&&item.categories.length<=5&&new Set(item.categories).size===item.categories.length&&item.categories.every(category=>categories.has(category))));
    assert.ok(Buffer.byteLength(JSON.stringify(hints),'utf8')<10000);assert.doesNotMatch(JSON.stringify(logs),/PRIVATE_LONG_PAYLOAD/);
  });
});

test('supported claims add no unsupported hints and reference failure remains a rejection',async()=>{
  await mocked([review([claim('Supported literal.',true)],true)],async logs=>{
    assert.equal((await verify()).ok,true);assert.equal(logs.length,0);
  });
  const badReference=review([claim('Supported literal.',true,'/invented')],true);
  assert.equal(reviewMatchesEvidence(badReference,evidence),false);
  await mocked([badReference],async logs=>{
    assert.equal((await verify()).ok,false);
    assert.deepEqual(diagnostics(logs).unsupportedClaimDiagnostics,[]);
    assert.equal(diagnostics(logs).unsupportedClaims,0);assert.equal(diagnostics(logs).unmatchedReferences,1);
  });
});

test('diagnostics do not change schemas, output budgets, two reviews or final abstention',async()=>{
  const rejected=review([claim('The current term has zero absence hours.')]);
  await mocked([rejected,{status:'answered',answer:'The current term has zero absence hours.',sourceIds:[evidence[0].id]},rejected],async(logs,requests)=>{
    const output=await runAnswerVerification({question:'What are my current attendance statistics?',initialAnswer:candidate,deadline:Date.now()+10000,loadEvidence:async()=>evidence,verify:verifyEvidenceAnswer,repair:repairEvidenceAnswer});
    assert.equal(output.status,'abstained');assert.equal(output.verification.status,'unverified');assert.equal(output.verification.attempts,2);
    assert.deepEqual(output.citations,[]);assert.equal(output.proposedAction,undefined);
    assert.deepEqual(requests.map(item=>item.text.format.name),['answer_evidence_review','correct_grounded_answer','answer_evidence_review']);
    assert.deepEqual(requests.map(item=>item.max_output_tokens),[8192,2400,8192]);assert.ok(requests.every(item=>item.store===false));
    for(const request of [requests[0],requests[2]]){
      assert.deepEqual(Object.keys(request.text.format.schema.properties).sort(),['answersQuestion','claims','supported']);
      assert.equal(request.text.format.schema.properties.claims.maxItems,80);
      assert.deepEqual(Object.keys(request.text.format.schema.properties.claims.items.properties).sort(),['claim','evidenceId','jsonPaths','quotes','supported']);
    }
    assert.equal(logs.filter(item=>item[0]==='Answer evidence review rejected').length,2);
  });
});

test('empty native attendance evidence retains schema-backed local_demo provenance without inventing coverage',async()=>{
  const migration=await readFile(new URL('../../supabase/migrations/20261112140000_academic_attendance.sql',import.meta.url),'utf8');
  for(const table of ['statistics','details','metadata']){
    const definition=migration.split('create table public.affairs_academic_attendance_'+table+' (')[1]?.split('\n);')[0];
    assert.ok(definition);assert.match(definition,/source_mode text not null default 'local_demo' check\(source_mode='local_demo'\)/);
  }
  const source=accountEvidence(fixtureForCase('empty:academicAttendance'),['academicAttendance'],{question:'Show my current academic attendance statistics',route:'/school-affairs/services/14-1'}).find(item=>item.id==='account:academicAttendance');
  assert.ok(source);const payload=JSON.parse(source.content);
  assert.match(payload.rules,/uses local_demo provenance enforced by its schema, including when no records are returned/);
  assert.match(payload.rules,/does not establish official university synchronization or complete university history/);
  assert.equal(payload.selection.reason,'current_term_missing');assert.deepEqual(payload.records.metadata,[]);
  assert.deepEqual(payload.records.statistics,[]);assert.deepEqual(payload.records.details,[]);
  assert.ok(payload.records.coverage.every((row:any)=>row.historyCompleteness==='unknown'));
  await mocked([{supported:true,answersQuestion:true,claims:[{claim:'This native attendance store uses local_demo provenance.',supported:true,evidenceId:source.id,jsonPaths:['/rules'],quotes:[]}]}],async()=>{
    const verified=await verifyEvidenceAnswer({question:'What is the provenance of these attendance records?',candidate:{status:'answered',answer:'This native attendance store uses local_demo provenance; it does not establish official university synchronization or a complete university history.',citations:[]},evidence:[source],deadline:Date.now()+10000});
    assert.equal(verified.ok,true);
  });
});
