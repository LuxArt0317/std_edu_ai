import assert from 'node:assert/strict';
import test from 'node:test';
import {createEnrollmentCertificateLoader,EnrollmentCertificateClientError,parseEnrollmentCertificateData} from '../../src/services/enrollmentCertificateClient';
import type {EnrollmentCertificateAssessment} from '../../src/services/enrollmentCertificate';
const owner='10000000-0000-4000-8000-000000000001',other='10000000-0000-4000-8000-000000000002';
const row:EnrollmentCertificateAssessment={id:'20000000-0000-4000-8000-000000000001',userId:owner,sourceMode:'local_demo',version:1,createdAt:'2030-01-01T00:00:00Z',updatedAt:'2030-01-01T00:00:00Z',academicYear:130,semester:1,hasPendingFees:'N',status:'blocked',resultText:'Synthetic status',assessedAt:null,identity:{studentNumber:null,studentName:'Synthetic student',departmentName:null,yearText:'',classLabel:null}};
const data={assessments:[row],documents:[]},session={userId:owner,token:'synthetic-caller-token'};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}});
const errorStatus=(status:number)=>(error:unknown)=>error instanceof EnrollmentCertificateClientError&&error.status===status;

test('certificate client validates exact owner, null/blank values and empty document contract',()=>{
  assert.deepEqual(parseEnrollmentCertificateData(data,owner),data);
  assert.equal(parseEnrollmentCertificateData(data,owner).assessments[0].identity.yearText,'');
  assert.deepEqual(parseEnrollmentCertificateData({assessments:[],documents:[]},owner),{assessments:[],documents:[]});
  for(const patch of [{userId:other},{sourceMode:'official'},{version:0},{academicYear:0},{semester:'1'},{status:['blocked']},{hasPendingFees:0},{signedUrl:'PRIVATE'},
    {identity:{...row.identity,governmentId:'PRIVATE'}},{createdAt:'2030-02-30T00:00:00Z'},{assessedAt:'invalid'}])
    assert.throws(()=>parseEnrollmentCertificateData({assessments:[{...row,...patch}],documents:[]},owner),errorStatus(503));
  for(const value of [{...data,documentMetadata:[]},{...data,documents:[{status:'available',verifiedAt:'2030-01-01T00:00:00Z'}]},{...data,assessments:[row,row]},null,[]])
    assert.throws(()=>parseEnrollmentCertificateData(value,owner),errorStatus(503));
});

test('dedicated personal GET sends only caller bearer token and constructs an owned receipt-time snapshot',async()=>{
  const calls:RequestInit[]=[];let sessions=0;
  const load=createEnrollmentCertificateLoader(async()=>{sessions++;return session;},async(input,init)=>{assert.equal(input,'/api/affairs-data?scope=enrollment-certificate');calls.push(init!);return json(data);});
  const start=Date.now(),snapshot=await load(owner);
  assert.equal(snapshot.profile.userId,owner);assert.deepEqual(snapshot.enrollmentCertificate,data);assert.ok(Date.parse(snapshot.checkedAt)>=start&&Date.parse(snapshot.checkedAt)<=Date.now());
  assert.equal(sessions,2);assert.equal(calls.length,1);assert.equal(new Headers(calls[0].headers).get('authorization'),'Bearer synthetic-caller-token');
  assert.equal(calls[0].method,'GET');assert.equal(calls[0].body,undefined);assert.equal(calls[0].credentials,'omit');assert.equal(calls[0].cache,'no-store');assert.equal(calls[0].redirect,'error');assert.ok(calls[0].signal);
});

test('missing or changing sessions never publish records and preserve strict account matching',async()=>{
  let requests=0;
  for(const value of [null,{...session,userId:other},{...session,token:''}]){
    const load=createEnrollmentCertificateLoader(async()=>value,async()=>{requests++;return json(data);});await assert.rejects(load(owner),errorStatus(401));
  }assert.equal(requests,0);
  for(const changed of [null,{...session,userId:other}]){
    let reads=0;const load=createEnrollmentCertificateLoader(async()=>++reads===1?session:changed,async()=>json(data));await assert.rejects(load(owner),errorStatus(401));
  }
});

test('abort interrupts a stalled session lookup and late session resolution never starts a request',async()=>{
  let resolveSession:(value:typeof session)=>void=()=>{},requests=0;
  const controller=new AbortController(),load=createEnrollmentCertificateLoader(()=>new Promise(resolve=>{resolveSession=resolve;}),async()=>{requests++;return json(data);});
  const pending=load(owner,controller.signal);await Promise.resolve();controller.abort();await assert.rejects(pending,{name:'AbortError'});
  resolveSession(session);await Promise.resolve();assert.equal(requests,0);
  const stopped=new AbortController();stopped.abort();await assert.rejects(load(owner,stopped.signal),{name:'AbortError'});assert.equal(requests,0);
});

test('HTTP, JSON, auth and network errors remain bounded generic failures without provider secrets',async()=>{
  for(const status of [401,403,404,500]){
    const load=createEnrollmentCertificateLoader(async()=>session,async()=>json({error:'PRIVATE token or backend detail'},status));
    await assert.rejects(load(owner),error=>error instanceof EnrollmentCertificateClientError&&error.status===([401,403].includes(status)?status:503)&&!error.message.includes('PRIVATE'));
  }
  for(const fetcher of [async()=>new Response('not json'),async()=>{throw new Error('PRIVATE fetch details');}]){
    const load=createEnrollmentCertificateLoader(async()=>session,fetcher);await assert.rejects(load(owner),error=>error instanceof EnrollmentCertificateClientError&&!error.message.includes('PRIVATE'));
  }
  const load=createEnrollmentCertificateLoader(async()=>{throw new Error('PRIVATE session details');},async()=>json(data));
  await assert.rejects(load(owner),error=>error instanceof EnrollmentCertificateClientError&&!error.message.includes('PRIVATE'));
});
