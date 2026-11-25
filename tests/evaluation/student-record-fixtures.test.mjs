import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';
import {fixtureForCase,EVAL_USER_ID,EVAL_OTHER_USER_ID,evalId} from './fixtures.mjs';
import {planSupplementalFixture,verifySupplementalFixtureReadback,readSupplementalFixtureScopes,LiveFixtureError} from './live-fixtures.mjs';
import {loadStudentConduct} from '../../server/studentConduct.js';
import {loadStudentLoan} from '../../server/studentLoan.js';

const domains=['studentConduct','studentLoan'],options={userId:EVAL_USER_ID,otherUserId:EVAL_OTHER_USER_ID,domains};
function fixture(){return {...fixtureForCase('studentConduct'),studentLoan:fixtureForCase('studentLoan').studentLoan};}
const errorCode=code=>error=>error instanceof LiveFixtureError&&error.code===code;
async function actualRead(plan,userId){
  const original=globalThis.fetch,account={url:'https://xiftudmvxphxcjtmfmib.supabase.co',key:'SYNTHETIC',token:'SYNTHETIC-'+userId,user:{id:userId}};
  globalThis.fetch=async(input,init)=>{
    const url=new URL(String(input));assert.equal(url.origin,account.url);assert.equal(init.method,'GET');assert.equal(init.body,undefined);
    assert.equal(init.headers.Authorization,'Bearer '+account.token);assert.equal(url.searchParams.get('user_id'),'eq.'+userId);assert.equal(url.searchParams.get('deleted_at'),'is.null');
    const table=url.pathname.slice('/rest/v1/'.length);assert.ok(['affairs_student_conduct','affairs_student_loan'].includes(table));
    const rows=plan.rows[table].filter(row=>row.user_id===userId);return Response.json(rows);
  };
  try{return {studentConduct:await loadStudentConduct(account),studentLoan:await loadStudentLoan(account)};}finally{globalThis.fetch=original;}
}

test('both native domains round-trip through actual personal loaders with exact independent fields and positive foreign sentinels',async()=>{
  const value=fixture(),copy=structuredClone(value),plan=planSupplementalFixture(value,options);
  assert.deepEqual(value,copy);assert.deepEqual(Object.keys(plan.rows).sort(),['affairs_student_conduct','affairs_student_loan']);
  assert.ok(Object.values(plan.rows).flat().every(row=>[EVAL_USER_ID,EVAL_OTHER_USER_ID].includes(row.user_id)&&row.deleted_at===null&&row.source_mode==='local_demo'));
  for(const userId of plan.userIds){const actual=await actualRead(plan,userId);assert.equal(verifySupplementalFixtureReadback(actual,plan,userId),true);}
  const own=plan.expectedByOwner[EVAL_USER_ID],foreign=plan.expectedByOwner[EVAL_OTHER_USER_ID];
  assert.equal(own.studentConduct.records[0].conductCode,'M-0');assert.equal(own.studentConduct.records[0].quantityText,'0');assert.equal(own.studentConduct.records[0].voidStatusText,null);
  assert.equal(own.studentLoan.record.currentApplicationState,'recorded');assert.equal(own.studentLoan.record.historyCount,0);assert.equal(own.studentLoan.record.historyText,null);
  assert.match(foreign.studentConduct.records[0].reasonText,/FOREIGN PRIVATE SENTINEL/);assert.match(foreign.studentLoan.record.currentApplicationText,/FOREIGN PRIVATE SENTINEL/);
  assert.doesNotMatch(JSON.stringify(own),/FOREIGN PRIVATE SENTINEL/);
});

test('guard: an empty own native record is verified separately from the second owner and cannot absorb a foreign positive result',async()=>{
  for(const domain of domains){
    const value=fixture();value[domain]=fixtureForCase('empty:'+domain)[domain];const plan=planSupplementalFixture(value,options);
    const own=await actualRead(plan,EVAL_USER_ID),other=await actualRead(plan,EVAL_OTHER_USER_ID);
    assert.equal(verifySupplementalFixtureReadback(own,plan,EVAL_USER_ID),true);assert.equal(verifySupplementalFixtureReadback(other,plan,EVAL_OTHER_USER_ID),true);
    if(domain==='studentConduct'){assert.deepEqual(own[domain].records,[]);assert.equal(other[domain].records.length,1);}else{assert.equal(own[domain].record,null);assert.ok(other[domain].record);}
    own[domain]=other[domain];assert.throws(()=>verifySupplementalFixtureReadback(own,plan,EVAL_USER_ID),errorCode('fixture-mapping'));
  }
});

test('nullable, blank, zero, literal dates and contradictory states survive schema and readback without normalization',async()=>{
  for(const literal of [null,'','0','Contradictory label']){
    const value=fixture();Object.assign(value.studentConduct.records[0],{occurredOnText:'115/02/31 literal',quantityText:literal,voidStatusText:literal});
    Object.assign(value.studentLoan.record,{currentApplicationState:'unknown',progressText:literal,historyCount:0,historyText:'9 prior records'});
    const plan=planSupplementalFixture(value,options),actual=await actualRead(plan,EVAL_USER_ID);
    assert.equal(verifySupplementalFixtureReadback(actual,plan,EVAL_USER_ID),true);assert.equal(actual.studentConduct.records[0].quantityText,literal);
    assert.equal(actual.studentConduct.records[0].occurredOnText,'115/02/31 literal');assert.equal(actual.studentLoan.record.historyCount,0);assert.equal(actual.studentLoan.record.historyText,'9 prior records');
  }
});

test('invalid owners, shapes, metadata, timestamps and native field values fail before any SQL plan is returned',()=>{
  const mutations=[
    value=>{value.studentConduct.records[0].userId=evalId(999);},value=>{value.studentLoan.record.userId=evalId(999);},
    value=>{value.studentConduct.records.push({...value.studentConduct.records[0]});},value=>{value.studentConduct.records[0].storagePath='PRIVATE';},
    value=>{delete value.studentConduct.records[0].studentName;},value=>{value.studentConduct.records[0].quantityText=0;},
    value=>{value.studentConduct.records[0].reasonText='\u0000';},value=>{value.studentConduct.records[0].updatedAt='2026-11-13T02:00:00+16:00';},
    value=>{value.studentConduct.records[0].createdAt='0000-01-01T00:00:00Z';},value=>{value.studentConduct.records[0].version=1000000000;},
    value=>{value.studentLoan.status='unavailable';},value=>{value.studentLoan.record.currentApplicationState='approved';},value=>{value.studentLoan.record.historyCount=-1;},
    value=>{value.studentLoan.record.historyCount='0';},value=>{value.studentLoan.record.progressText='\ud800';},value=>{value.studentLoan.document={url:'PRIVATE'};},
  ];
  for(const mutate of mutations){const value=fixture();mutate(value);assert.throws(()=>planSupplementalFixture(value,options),errorCode('fixture-schema'));}
});

test('readback is full literal equality, including absence of metadata and ownership—not only a matching answer',()=>{
  const plan=planSupplementalFixture(fixture(),options);
  for(const mutate of [value=>{value.studentConduct.records[0].quantityText=0;},value=>{value.studentConduct.records[0].voidStatusText='';},
    value=>{delete value.studentConduct.records[0].studentName;},value=>{value.studentLoan.record.historyCount=null;},value=>{value.studentLoan.record.progressText='Approved';},
    value=>{value.studentLoan.record.adminMetadata='PRIVATE';},value=>{value.studentLoan.record.userId=EVAL_OTHER_USER_ID;}]){
    const actual=structuredClone(plan.expectedByOwner[EVAL_USER_ID]);mutate(actual);assert.throws(()=>verifySupplementalFixtureReadback(actual,plan,EVAL_USER_ID),errorCode('fixture-mapping'));
  }
});

test('scoped authenticated API readbacks request only personal native scopes without selected user IDs',async()=>{
  const plan=planSupplementalFixture(fixture(),options),seen=[];
  for(const userId of plan.userIds){
    const actual=await readSupplementalFixtureScopes({id:userId,token:'SYNTHETIC-'+userId},domains,{origin:'https://synthetic.invalid',fetchImpl:async(url,init)=>{
      seen.push(url.searchParams.get('scope'));assert.deepEqual([...url.searchParams.keys()],['scope']);assert.equal(init.headers.Authorization,'Bearer SYNTHETIC-'+userId);
      const domain=url.searchParams.get('scope')==='student-conduct'?'studentConduct':'studentLoan';return Response.json(plan.expectedByOwner[userId][domain]);
    }});assert.equal(verifySupplementalFixtureReadback(actual,plan,userId),true);
  }
  assert.deepEqual(seen.sort(),['student-conduct','student-conduct','student-loan','student-loan']);
});

test('guard: real persistence ledgers both owners and exact tables before SQL, and never changes role, shared rows or a third owner',async()=>{
  const source=await readFile(new URL('./live-fixtures.mjs',import.meta.url),'utf8'),start=source.indexOf('async function persistSnapshot('),end=source.indexOf('function canonical(',start);
  assert.ok(start>=0&&end>start);const value=fixture(),plan=planSupplementalFixture(value,options),events=[];
  const tables={studentConduct:'affairs_student_conduct',studentLoan:'affairs_student_loan'};
  const sql=(strings,...values)=>{if(!strings?.raw)return {identifier:strings};events.push({kind:'sql',sql:strings.join('?'),values});return Promise.resolve([]);};
  sql.unsafe=async statement=>events.push({kind:'sql',sql:statement,values:[]});sql.json=value=>value;
  const state={users:[{id:EVAL_USER_ID,studentId:evalId(10)},{id:EVAL_OTHER_USER_ID}],recordIds:new Set(),supplementalTables:new Set(),sql};
  const persist=vm.runInNewContext(source.slice(start,end)+'\npersistSnapshot;',{state,ownTables:[],SUPPLEMENTAL_TABLES:tables,query:task=>task(),
    saveLedger:async()=>events.push({kind:'ledger',ids:[...state.recordIds],tables:[...state.supplementalTables]}),fail:(code,message)=>{throw new LiveFixtureError(code,message);}});
  await persist(value,plan.rows,{expected:{}},{domains:[]},plan);
  assert.equal(events[0].kind,'ledger');assert.deepEqual(new Set(events[0].ids),new Set(Object.values(plan.rows).flat().map(row=>row.id)));assert.deepEqual(new Set(events[0].tables),new Set(Object.values(tables)));
  for(const table of Object.values(tables)){
    const deletion=events.find(event=>event.sql==='delete from ? where user_id in ?'&&event.values[0].identifier==='public.'+table);
    assert.deepEqual(Array.from(deletion.values[1].identifier),[EVAL_USER_ID,EVAL_OTHER_USER_ID]);
    const insertion=events.find(event=>event.sql==='insert into ? ?'&&event.values[0].identifier==='public.'+table);
    assert.ok(insertion.values[1].identifier.every(row=>[EVAL_USER_ID,EVAL_OTHER_USER_ID].includes(row.user_id)));
  }
  assert.ok(!events.some(event=>event.sql?.includes('set role=')||event.sql?.includes('auth.users')||/update public\.affairs_(?:programs|courses|sections|terms)/.test(event.sql||'')));
  assert.ok(events.some(event=>event.sql==='commit'));
});
