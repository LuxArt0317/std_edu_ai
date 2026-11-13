import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {createHash} from 'node:crypto';
import {buildAccountFixture,fixtureForCase,supplementalFixtureRecords,EVAL_USER_ID,EVAL_OTHER_USER_ID,evalId} from './fixtures.mjs';
import {buildAccountCases} from './account-cases.mjs';
import {planSupplementalFixture,verifySupplementalFixtureReadback,readSupplementalFixtureScopes,reconcileFixtureIdentity,LiveFixtureError} from './live-fixtures.mjs';
import {loadEnrollmentCertificate} from '../../server/enrollmentCertificate.js';
import {loadTuitionDocuments} from '../../server/tuitionDocuments.js';
import {gradeCase} from './grading.mjs';

const domains=['enrollmentCertificate','tuition'];
const options={userId:EVAL_USER_ID,otherUserId:EVAL_OTHER_USER_ID,domains};
const planFor=key=>planSupplementalFixture(fixtureForCase(key),options);
const json=value=>new Response(JSON.stringify(value),{status:200,headers:{'Content-Type':'application/json'}});
const account=id=>({user:{id},token:'synthetic-token-'+id,key:'synthetic-publishable',url:'https://xiftudmvxphxcjtmfmib.supabase.co'});
async function actualReader(plan,userId){
  const prior=globalThis.fetch;
  globalThis.fetch=async(input,init)=>{
    const url=new URL(input),table=url.pathname.split('/').at(-1);
    assert.equal(url.searchParams.get('user_id'),'eq.'+userId);
    assert.equal(init.headers.Authorization,'Bearer synthetic-token-'+userId);
    assert.ok(Object.hasOwn(plan.rows,table),'A shared/admin/document table was requested.');
    return json(plan.rows[table].filter(row=>row.user_id===userId));
  };
  try{return {enrollmentCertificate:await loadEnrollmentCertificate(account(userId)),tuition:await loadTuitionDocuments(account(userId))};}
  finally{globalThis.fetch=prior;}
}

test('independent certificate and tuition rows round-trip through actual personal readers for both disposable owners',async()=>{
  const source=buildAccountFixture(),plan=planSupplementalFixture(source,options);
  assert.deepEqual(Object.keys(plan.rows).sort(),['affairs_enrollment_certificate_assessments','affairs_tuition_settlements']);
  assert.equal(plan.rows.affairs_enrollment_certificate_assessments.length,2);
  assert.equal(plan.rows.affairs_tuition_settlements.length,5);
  assert.ok(Object.values(plan.rows).flat().every(row=>[EVAL_USER_ID,EVAL_OTHER_USER_ID].includes(row.user_id)));
  for(const userId of plan.userIds)assert.equal(verifySupplementalFixtureReadback(await actualReader(plan,userId),plan,userId),true);
  assert.deepEqual(source,buildAccountFixture());
  const own=plan.expectedByOwner[EVAL_USER_ID],foreign=plan.expectedByOwner[EVAL_OTHER_USER_ID];
  assert.equal(own.enrollmentCertificate.assessments[0].hasPendingFees,'N');assert.equal(own.enrollmentCertificate.assessments[0].status,'blocked');
  assert.equal(own.enrollmentCertificate.assessments[0].identity.studentName,'Certificate Evaluation Name');
  assert.equal(foreign.tuition.settlements[0].text,'FOREIGN PRIVATE SENTINEL tuition');
  assert.doesNotMatch(JSON.stringify(own),/FOREIGN PRIVATE SENTINEL/);
});

test('null, blank, zero text and independent balances remain distinct in SQL and full scoped readback',async()=>{
  for(const key of ['certificate-null','certificate-blank']){
    const plan=planFor(key),actual=await actualReader(plan,EVAL_USER_ID);
    assert.equal(verifySupplementalFixtureReadback(actual,plan,EVAL_USER_ID),true);
    assert.equal(actual.enrollmentCertificate.assessments[0].resultText,key==='certificate-null'?null:'');
    assert.deepEqual(actual.tuition.settlements.map(row=>row.text),['Local statement: adjustment TWD 640; this is not a remaining balance.',null,'','0']);
    if(key==='certificate-null')assert.equal(actual.enrollmentCertificate.assessments[0].hasPendingFees,null);
  }
  const fixture=fixtureForCase('tuition');assert.equal(fixture.charges[0].amountDue-fixture.charges[0].amountPaid,23000);
});

test('empty own collections are proven separately from positively readable foreign sentinel collections',async()=>{
  for(const domain of domains){
    const plan=planFor('empty:'+domain),own=await actualReader(plan,EVAL_USER_ID),other=await actualReader(plan,EVAL_OTHER_USER_ID);
    assert.equal(verifySupplementalFixtureReadback(own,plan,EVAL_USER_ID),true);
    assert.equal(verifySupplementalFixtureReadback(other,plan,EVAL_OTHER_USER_ID),true);
    assert.deepEqual(own[domain][domain==='tuition'?'settlements':'assessments'],[]);
    own[domain]=other[domain];assert.throws(()=>verifySupplementalFixtureReadback(own,plan,EVAL_USER_ID),{code:'fixture-mapping'});
  }
});

test('wrong values, omitted fields, leaked metadata and third-party owner inputs fail independently',()=>{
  const plan=planFor('all');
  for(const mutate of [x=>{x.enrollmentCertificate.assessments[0].status='local_eligible';},x=>{delete x.enrollmentCertificate.assessments[0].identity.classLabel;},x=>{x.tuition.settlements[1].text='0';},x=>{x.tuition.periods.pop();},x=>{x.tuition.documents=[{status:'verified_local_file'}];}]){
    const read=structuredClone(plan.expectedByOwner[EVAL_USER_ID]);mutate(read);
    assert.throws(()=>verifySupplementalFixtureReadback(read,plan,EVAL_USER_ID),error=>error.code==='fixture-mapping'&&!/CERT-EVAL|FOREIGN|640/.test(error.message));
  }
  for(const mutate of [x=>{x.tuition.settlements[0].userId=evalId(999);},x=>{delete x.enrollmentCertificate.assessments[0].identity.studentNumber;},x=>{x.tuition.documents=[{}];},x=>{x.tuition.settlements[0].text=undefined;},x=>{x.enrollmentCertificate.assessments[0].status='eligible';}]){
    const fixture=buildAccountFixture();mutate(fixture);assert.throws(()=>planSupplementalFixture(fixture,options));
  }
  assert.throws(()=>planSupplementalFixture(buildAccountFixture(),{...options,domains:['dtmSubmissions']}));
});

test('deployed readback uses exact personal scope and own bearer, rejecting unavailable or oversized responses',async()=>{
  const plan=planFor('all'),observed=[];
  for(const userId of plan.userIds){
    const actual=await readSupplementalFixtureScopes({id:userId,token:'private-'+userId},domains,{origin:'https://synthetic.invalid',fetchImpl:async(url,init)=>{
      observed.push(url.toString());assert.equal(init.redirect,'error');assert.equal(init.headers.Authorization,'Bearer private-'+userId);
      assert.equal(url.pathname,'/api/affairs-data');assert.deepEqual([...url.searchParams.keys()],['scope']);
      const domain=url.searchParams.get('scope')==='enrollment-certificate'?'enrollmentCertificate':'tuition';
      return json(plan.expectedByOwner[userId][domain]);
    }});
    assert.equal(verifySupplementalFixtureReadback(actual,plan,userId),true);
  }
  assert.equal(observed.length,4);
  for(const fetchImpl of [async()=>new Response('PRIVATE_BODY',{status:500}),async()=>new Response('SECRET',{headers:{'Content-Type':'application/json'}}),async()=>json({text:'x'.repeat(2_000_001)}),async()=>{throw new Error('PRIVATE_TOKEN');}]){
    await assert.rejects(readSupplementalFixtureScopes({id:EVAL_USER_ID,token:'PRIVATE_TOKEN'},['tuition'],{origin:'https://synthetic.invalid',fetchImpl}),error=>error.code==='fixture-readback'&&!/PRIVATE_BODY|PRIVATE_TOKEN|SECRET/.test(error.message));
  }
});

test('new question bank grounds every answer in literal records and retains native file capability gaps',()=>{
  const cases=buildAccountCases().filter(row=>domains.includes(row.domain));
  assert.ok(cases.length>=18);assert.equal(new Set(cases.map(row=>row.id)).size,cases.length);
  for(const row of cases){
    assert.ok(row.expected.requiredTools.includes(row.domain),row.id);
    assert.ok(row.expected.requiredLinks.length,row.id);
    assert.doesNotThrow(()=>fixtureForCase(row));
    if(row.expected.behavior==='answer')assert.ok(row.expected.facts.length,row.id);
    if(row.expected.behavior==='unavailable')assert.equal(row.expected.limitation,true,row.id);
  }
  for(const id of ['enrollment-certificate-gap','tuition-summer-file-gap','tuition-extended-gap'])assert.equal(cases.find(row=>row.id==='account:'+id).capability.gap,true);
  const mixed=cases.find(row=>row.id==='account:tuition-certificate-balance-mixed');
  assert.deepEqual(mixed.expected.requiredTools,['tuition','charges','enrollmentCertificate']);
});

test('comma and alongside mixed questions keep all three independent facts, owned readback scopes and source links',async()=>{
  const cases=buildAccountCases(),original=cases.find(row=>row.id==='account:tuition-certificate-balance-mixed');
  for(const id of ['tuition-certificate-balance-comma','tuition-certificate-balance-alongside']){
    const item=cases.find(row=>row.id==='account:'+id);assert.ok(item,id);
    assert.equal(item.fixtureKey,original.fixtureKey);assert.deepEqual(item.expected,original.expected);
    assert.notEqual(item.question,original.question);
    // These independently worded cases intentionally avoid the runtime's
    // explicit conjunction/comparison splitter; the ALL-parts verifier matters.
    assert.doesNotMatch(item.question,/\b(?:and|also|plus|compare|versus|difference|vs)\b|[;；\n]/iu);
    const fixture=fixtureForCase(item),plan=planSupplementalFixture(fixture,{...options,domains:item.expected.requiredTools.filter(key=>domains.includes(key))});
    assert.deepEqual([...plan.domains].sort(),[...domains].sort());
    for(const owner of plan.userIds){
      const readback=await actualReader(plan,owner);
      assert.equal(verifySupplementalFixtureReadback(readback,plan,owner),true);
      if(owner===EVAL_USER_ID){
        assert.equal(readback.enrollmentCertificate.assessments[0].status,'blocked');
        assert.equal(readback.tuition.settlements.find(row=>row.periodLabel==='115 Fall reconciliation').text,'Local statement: adjustment TWD 640; this is not a remaining balance.');
        assert.doesNotMatch(JSON.stringify(readback),/FOREIGN PRIVATE SENTINEL/);
      }else assert.match(JSON.stringify(readback),/FOREIGN PRIVATE SENTINEL/);
    }
    const charge=fixture.charges.find(row=>row.label==='Tuition instalment A');
    assert.equal(charge.amountDue,28000);assert.equal(charge.amountPaid,5000);assert.equal(charge.amountDue-charge.amountPaid,23000);
    const parts=['Local sample tuition settlement: adjustment TWD 640.','Remaining tuition charge balance: TWD 23,000.','Local sample enrollment-certificate status: blocked.'];
    const evaluate=(answer,links=item.expected.requiredLinks,tools=item.expected.requiredTools)=>gradeCase(item,{statusCode:200,execution:'recorded',fixtureKey:item.fixtureKey,
      toolCalls:tools.map(name=>({name,status:'complete'})),body:{status:'answered',answer,verification:{status:'verified',attempts:1},citations:links.map(url=>({url}))}});
    assert.equal(evaluate(parts.join('\n')).passed,true);
    for(let index=0;index<parts.length;index++){
      assert.equal(evaluate(parts.filter((_,i)=>i!==index).join('\n')).passed,false,'Missing one requested domain must fail.');
      assert.equal(evaluate(parts.join('\n'),item.expected.requiredLinks.filter((_,i)=>i!==index)).passed,false,'Each local record link is required.');
      assert.equal(evaluate(parts.join('\n'),undefined,item.expected.requiredTools.filter((_,i)=>i!==index)).passed,false,'Each reader must be observed.');
    }
  }
});

const source=await readFile(new URL('./live-fixtures.mjs',import.meta.url),'utf8');
function section(start,end){const begin=source.indexOf(start),finish=end?source.indexOf(end,begin):source.length;assert.ok(begin>=0&&finish>begin);return source.slice(begin,finish).replaceAll('export async function ','async function ');}

test('actual afterCase fingerprints both owners supplemental data and always clears active case after a mismatch',async()=>{
  const body=section('export async function afterCase(','/** Removes only');
  const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
  for(const mutate of [null,values=>{values[EVAL_USER_ID].tuition.settlements[1].text='0';},values=>{values[EVAL_OTHER_USER_ID].enrollmentCertificate.assessments[0].status='local_eligible';}]){
    const supplemental=planFor('all').expectedByOwner,original=structuredClone(supplemental),snapshot={fixed:'own snapshot'};
    let saves=0,reads=0;
    const state={origin:'https://synthetic.invalid',users:[{id:EVAL_USER_ID},{id:EVAL_OTHER_USER_ID}],current:{caseId:'case',supplementalDomains:domains,beforeHash:hash({snapshot,supplemental:original,catalog:null})}};
    if(mutate)mutate(supplemental);
    const context={state,ready:()=>state,hash,readSnapshot:async()=>snapshot,ownState:x=>x,readSupplementalFixtureScopes:async user=>{reads++;return supplemental[user.id];},saveLedger:async()=>{saves++;},PROJECT:'synthetic',fail:(code,message)=>{throw new LiveFixtureError(code,message);}};
    const afterCase=vm.runInNewContext(body+'\nafterCase;',context),envelope={};
    if(mutate)await assert.rejects(afterCase({id:'case'},envelope),{code:'fixture-unapproved-write'});else await afterCase({id:'case'},envelope);
    assert.equal(reads,2);assert.equal(saves,1);assert.equal(state.current,null);
    assert.equal(envelope.stateBefore.ownedRecordsDigest===envelope.stateAfterProposal.ownedRecordsDigest,!mutate);
  }
});

test('actual persistence writes supplemental IDs/table names to cleanup ledger before scoped SQL mutation',async()=>{
  const body=section('async function persistSnapshot(','function canonical('),plan=planFor('all'),events=[];
  const sql=(strings,...values)=>{if(!Array.isArray(strings)||!strings.raw)return strings;const text=strings.join('?');events.push({kind:'sql',text,values});return Promise.resolve(text.includes('select id from public.affairs_programs')?[]:[]);};
  sql.unsafe=async text=>events.push({kind:'sql',text});sql.json=value=>value;
  const state={users:[{id:EVAL_USER_ID,studentId:evalId(10)},{id:EVAL_OTHER_USER_ID}],recordIds:new Set(),supplementalTables:new Set(),sql};
  const context={state,SUPPLEMENTAL_TABLES:{enrollmentCertificate:'affairs_enrollment_certificate_assessments',tuition:'affairs_tuition_settlements'},ownTables:[],saveLedger:async()=>{events.push({kind:'ledger',ids:[...state.recordIds],tables:[...state.supplementalTables]});},query:async work=>work(),fail:()=>{throw new Error('unexpected');}};
  const persist=vm.runInNewContext(body+'\npersistSnapshot;',context);
  await persist(buildAccountFixture(),plan.rows,{expected:{}},{domains:[]},plan);
  assert.equal(events[0].kind,'ledger');assert.equal(events[0].ids.length,7);assert.equal(events[0].tables.length,2);
  const deletes=events.filter(event=>event.text?.startsWith('delete from ?'));
  for(const table of Object.keys(plan.rows)){const event=deletes.find(event=>event.values[0]==='public.'+table);assert.ok(event);assert.deepEqual(Array.from(event.values[1]),[EVAL_USER_ID,EVAL_OTHER_USER_ID]);}
  assert.doesNotMatch(events.map(event=>event.text).join('\n'),/storage\.|auth\.users|affairs_course_offerings/);
});

test('actual cleanup verifies both new owner tables and retains the recovery ledger if either still has rows',async()=>{
  const body=section('export async function cleanup('),runId=evalId(989);
  for(const remainingTable of [null,'affairs_enrollment_certificate_assessments','affairs_tuition_settlements']){
    const events=[],users=[EVAL_USER_ID,EVAL_OTHER_USER_ID].map(id=>({id,token:'PRIVATE_SESSION'}));
    const identityRequests=users.map((user,index)=>({id:user.id,email:'fixture-'+index+'@example.invalid',state:'created',runId}));
    const sql=(strings,...values)=>{
      if(!Array.isArray(strings)||!strings.raw)return strings;
      const text=strings.join('?');events.push({text,values});
      if(text.includes('raw_user_meta_data')){const row=identityRequests.find(row=>row.id===values[1]);return Promise.resolve([{id:row.id,email:row.email,run_id:runId}]);}
      if(text.startsWith('select id from ?')&&values[0]==='public.'+remainingTable)return Promise.resolve([{id:evalId(911)}]);
      return Promise.resolve([]);
    };
    let removed=false,closed=false;
    sql.release=async()=>{};
    const state={runId,users,identityRequests,ledgerOwned:true,ledgerTempOwned:false,ledger:'private-ledger',closed:false,closing:false,locked:true,sql,
      supplementalTables:new Set(['affairs_enrollment_certificate_assessments','affairs_tuition_settlements']),db:{end:async()=>{closed=true;}},admin:{auth:{admin:{deleteUser:async id=>{events.push({delete:id});return {error:null};}}}}};
    const context={state,UUID:/^[a-f0-9-]{36}$/i,PROJECT:'synthetic',ownTables:[],saveLedger:async()=>{},query:async work=>work(),reconcileFixtureIdentity,LiveFixtureError,
      rm:async()=>{removed=true;},fail:(code,message)=>{throw new LiveFixtureError(code,message);}};
    const cleanup=vm.runInNewContext(body+'\ncleanup;',context);
    if(remainingTable)await assert.rejects(cleanup(),{code:'fixture-cleanup'});else assert.equal((await cleanup()).verified,true);
    assert.equal(removed,!remainingTable);assert.equal(closed,true);assert.ok(users.every(user=>user.token===null));
    for(const table of ['affairs_enrollment_certificate_assessments','affairs_tuition_settlements']){
      if(remainingTable==='affairs_enrollment_certificate_assessments'&&table==='affairs_tuition_settlements')continue;
      const read=events.find(event=>event.text?.startsWith('select id from ?')&&event.values[0]==='public.'+table);
      assert.ok(read);assert.deepEqual(Array.from(read.values[1]),[EVAL_USER_ID,EVAL_OTHER_USER_ID]);
    }
  }
});
