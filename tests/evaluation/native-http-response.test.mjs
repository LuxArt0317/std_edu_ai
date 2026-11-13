import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFile} from 'node:fs/promises';
import {readNativeHttpResponse} from '../integration/helpers/native-http-response.mjs';

test('valid JSON success and error responses retain status and exact parsed data',async()=>{
  for(const status of [200,400,403,409,500]){
    const body={status:'synthetic',rows:[{title:'合成課程'}],nested:{zero:0,unknown:null}};
    const result=await readNativeHttpResponse(Response.json(body,{status}));
    assert.deepEqual(result,{status,contentType:'application/json',body});
  }
  assert.deepEqual((await readNativeHttpResponse(new Response('[1,null,"text"]',{headers:{'Content-Type':'text/plain'}}))).body,[1,null,'text']);
  assert.deepEqual((await readNativeHttpResponse(new Response('\uFEFF{"answer":"合成"}'))).body,{answer:'合成'});
});

test('Vercel non-JSON invocation failure is visible through existing assertion-only logging',async()=>{
  const response=new Response('A server error occurred\nFUNCTION_INVOCATION_FAILED\nPrivate synthetic body SECRET_TOKEN student@example.invalid',{status:500,headers:{'Content-Type':'text/plain; charset=utf-8'}});
  await assert.rejects(readNativeHttpResponse(response),error=>{
    assert.ok(error instanceof assert.AssertionError);assert.equal(error.status,500);assert.equal(error.contentType,'text/plain');assert.equal(error.diagnosticCode,'FUNCTION_INVOCATION_FAILED');
    assert.match(error.message,/HTTP 500.*text\/plain.*FUNCTION_INVOCATION_FAILED/);
    assert.doesNotMatch(JSON.stringify(error)+error.message+error.stack,/SECRET_TOKEN|student@example|Private synthetic/);assert.equal(error.cause,undefined);return true;
  });
});

test('only fixed platform codes and safe MIME values survive hostile headers or bodies',async()=>{
  const cases=[
    {body:'UNKNOWN_PRIVATE_CODE SECRET_TOKEN',headers:{'Content-Type':'application/x-SECRET_TOKEN; private=SECRET_TOKEN','x-vercel-error':'SECRET_TOKEN'},type:'other',code:'NON_JSON_RESPONSE'},
    {body:'broken { "secret": "SECRET_TOKEN"',headers:{'Content-Type':'application/json; private=SECRET_TOKEN'},type:'application/json',code:'INVALID_JSON_RESPONSE'},
    {body:'private body',headers:{'Content-Type':'text/html','x-vercel-error':'FUNCTION_INVOCATION_TIMEOUT'},type:'text/html',code:'FUNCTION_INVOCATION_TIMEOUT'},
    {body:'X'.repeat(4100)+' FUNCTION_INVOCATION_FAILED',headers:{'Content-Type':'text/plain'},type:'text/plain',code:'NON_JSON_RESPONSE'},
    {body:'PREFIX_FUNCTION_INVOCATION_FAILED_SUFFIX',headers:{'Content-Type':'text/plain'},type:'text/plain',code:'NON_JSON_RESPONSE'},
  ];
  for(const item of cases)await assert.rejects(readNativeHttpResponse(new Response(item.body,{status:502,headers:item.headers})),error=>{
    assert.equal(error.status,502);assert.equal(error.contentType,item.type);assert.equal(error.diagnosticCode,item.code);assert.ok(error.message.length<200);assert.doesNotMatch(JSON.stringify(error)+error.message,/SECRET_TOKEN|private body|PREFIX_/);return true;
  });
});

test('empty, oversized and broken streams return safe protocol codes without raw exceptions',async()=>{
  await assert.rejects(readNativeHttpResponse(new Response(null,{status:204})),error=>error.status===204&&error.diagnosticCode==='NON_JSON_RESPONSE');
  let cancelled=false;
  const oversized=new Response(new ReadableStream({start(controller){controller.enqueue(new Uint8Array(2_000_001));},cancel(){cancelled=true;}}),{status:500});
  await assert.rejects(readNativeHttpResponse(oversized),error=>error.diagnosticCode==='HTTP_RESPONSE_TOO_LARGE');assert.equal(cancelled,true);
  const broken=new Response(new ReadableStream({start(controller){controller.error(new Error('PRIVATE PROVIDER BODY'));}}),{status:503});
  await assert.rejects(readNativeHttpResponse(broken),error=>{assert.equal(error.diagnosticCode,'HTTP_RESPONSE_READ_FAILED');assert.doesNotMatch(error.stack+JSON.stringify(error),/PRIVATE PROVIDER/);return true;});
});

test('all three native harnesses invoke the safe parser without changing live auth or cleanup',async()=>{
  for(const name of ['academic-grades','graduation-review','academic-attendance']){
    const source=await readFile(new URL('../integration/'+name+'-live.mjs',import.meta.url),'utf8');
    assert.match(source,/readNativeHttpResponse\(response\)/);assert.doesNotMatch(source,/body:await response\.json\(\)/);
    assert.match(source,/redirect:'error'/);assert.match(source,/finally\{/);assert.match(source,/deleteUser\(id\)/);
  }
});
