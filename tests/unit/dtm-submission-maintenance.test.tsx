import assert from 'node:assert/strict';
import test from 'node:test';
import {cleanupDtmSubmissionBatch} from '../../src/services/dtmSubmissionMaintenance';
const userId='11111111-1111-4111-8111-111111111111';
const getSession=async()=>({userId,accessToken:'synthetic-manager-token'});
test('cleanup sends one exact empty-payload action using the matching caller session and returns only bounded counts',async()=>{
  let calls=0;
  const outcome=await cleanupDtmSubmissionBatch(userId,new AbortController().signal,{getSession,fetch:async(url,init)=>{
    calls++;assert.equal(url,'/api/affairs-action');assert.equal(init?.method,'POST');assert.equal(init?.credentials,'omit');assert.equal(init?.cache,'no-store');assert.equal(init?.redirect,'error');
    assert.equal(new Headers(init?.headers).get('Authorization'),'Bearer synthetic-manager-token');
    assert.deepEqual(JSON.parse(String(init?.body)),{kind:'cleanup_dtm_submission_uploads',payload:{}});
    return Response.json({removed:3,remaining:2});
  }});
  assert.deepEqual(outcome,{removed:3,remaining:2});assert.equal(calls,1);
});
test('cleanup rejects changed/missing identity before any request and respects cancellation before/after session lookup',async()=>{
  let calls=0;const fetcher:typeof fetch=async()=>{calls++;return Response.json({removed:0,remaining:0});};
  for(const session of [null,{userId:'another-account',accessToken:'synthetic'},{userId,accessToken:''}])
    await assert.rejects(cleanupDtmSubmissionBatch(userId,new AbortController().signal,{getSession:async()=>session,fetch:fetcher}),/Sign in again/);
  await assert.rejects(cleanupDtmSubmissionBatch(userId,new AbortController().signal,{getSession:async()=>{throw new Error('private-auth-provider-detail');},fetch:fetcher}),/Sign in again/);
  const pre=new AbortController();pre.abort();await assert.rejects(cleanupDtmSubmissionBatch(userId,pre.signal,{getSession,fetch:fetcher}),{name:'AbortError'});
  const during=new AbortController();await assert.rejects(cleanupDtmSubmissionBatch(userId,during.signal,{getSession:async()=>{during.abort();return getSession();},fetch:fetcher}),{name:'AbortError'});
  assert.equal(calls,0);
});
test('cleanup refuses malformed/unbounded/extra-path outcomes without leaking response data',async()=>{
  for(const value of [null,[],{}, {removed:1}, {removed:3,remaining:3}, {removed:-1,remaining:0}, {removed:.5,remaining:0}, {removed:'1',remaining:0}, {removed:1,remaining:0,path:'private-synthetic-path'}])
    await assert.rejects(cleanupDtmSubmissionBatch(userId,new AbortController().signal,{getSession,fetch:async()=>Response.json(value)}),error=>error instanceof Error&&/result was invalid/.test(error.message)&&!error.message.includes('private-synthetic-path'));
});
test('cleanup failures are sanitized and each intentional retry remains one independent bounded batch',async()=>{
  let calls=0;
  for(const status of [401,403,500])await assert.rejects(cleanupDtmSubmissionBatch(userId,new AbortController().signal,{getSession,fetch:async()=>{calls++;return new Response('private-synthetic-path',{status});}}),error=>error instanceof Error&&!error.message.includes('private-synthetic-path')&&(status<500?/cannot run/.test(error.message):/not confirmed/.test(error.message)));
  await assert.rejects(cleanupDtmSubmissionBatch(userId,new AbortController().signal,{getSession,fetch:async()=>{calls++;throw new Error('private-provider-detail');}}),/Cleanup was not confirmed/);
  assert.deepEqual(await cleanupDtmSubmissionBatch(userId,new AbortController().signal,{getSession,fetch:async()=>{calls++;return Response.json({removed:0,remaining:0});}}),{removed:0,remaining:0});
  assert.equal(calls,5);
});
