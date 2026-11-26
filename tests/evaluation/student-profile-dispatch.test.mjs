import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';
import dataHandler from '../../api/affairs-data.ts';
import {discoverClientDispatchSurfaces} from './client-dispatch-inventory.mjs';

const origin='https://xiftudmvxphxcjtmfmib.supabase.co';
const key='synthetic-profile-publishable-key';
const id='82100000-0000-4000-8000-000000000001',other='82100000-0000-4000-8000-000000000002';
const token='synthetic-profile-owner-token-00000000000001',otherToken='synthetic-profile-foreign-token-0000000001';

function invoke(path,accessToken){
  const record={};
  const response={setHeader(){},status(code){record.status=code;return this;},json(body){record.body=body;}};
  return dataHandler({method:'GET',query:Object.fromEntries(new URL(path,'https://fixture.invalid').searchParams),
    headers:accessToken?{authorization:'Bearer '+accessToken}:{}},response).then(()=>record);
}

async function loadBrowserDispatch(affairsClient,network){
  const primary=(path,studentService)=>{
    const requireModule=createRequire(path);
    return specifier=>{
      if(specifier==='@/features/public/affairs/authClient')return {affairsClient};
      if(specifier==='./studentProfile')return studentService;
      if(specifier.endsWith('.js'))return requireModule(specifier);
      return new Proxy({}, {get:()=>()=>assert.fail('An unrelated browser service was called: '+specifier)});
    };
  };
  const compile=(path,source,studentService)=>{
    const exports={},code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
    runInNewContext(code,{exports,require:primary(path,studentService),fetch:network,AbortSignal,URLSearchParams,URL});
    return exports;
  };
  const sources=['studentProfile','schoolAffairsAssistant'].map(name=>new URL('../../src/services/'+name+'.ts',import.meta.url));
  const [studentSource,dispatchSource]=await Promise.all(sources.map(path=>readFile(path,'utf8')));
  const studentService=compile(sources[0],studentSource);
  return compile(sources[1],dispatchSource,studentService).askSchoolAffairsAssistant;
}

test('the frozen Student Profile prompts use only the verified browser and account scopes',async t=>{
  const {questions}=await discoverClientDispatchSurfaces();
  const byMode=mode=>questions.find(item=>item.id==='client:student-profile:'+mode);
  const keys=['VITE_SUPABASE_URL','VITE_SUPABASE_PUBLISHABLE_KEY'];
  const previous=keys.map(name=>process.env[name]);
  Object.assign(process.env,{[keys[0]]:origin,[keys[1]]:key});
  t.after(()=>{for(const [index,name] of keys.entries()){if(previous[index]===undefined)delete process.env[name];else process.env[name]=previous[index];}});
  const requests=[],reads=[];
  let caller=id,failProfile=false,failYear=false,badOwner=false,failEndpoint=false;
  const fetchMock=async(input,init)=>{
    const url=new URL(String(input));
    assert.equal(url.origin,origin);
    const headers=new Headers(init.headers),accessToken=headers.get('authorization');
    assert.equal(headers.get('apikey'),key);
    const owner=accessToken==='Bearer '+token?id:accessToken==='Bearer '+otherToken?other:null;
    assert.ok(owner);
    if(url.pathname==='/auth/v1/user')return Response.json({id:owner,identities:[{provider:'google'}]});
    if(url.pathname==='/rest/v1/rpc/affairs_read_student_profile'){
      assert.equal(init.method,'POST');
      assert.deepEqual(JSON.parse(init.body),{p_target:null,p_status_only:true});
      reads.push(['confirmation',owner]);
      if(failProfile)return Response.json({message:'provider private error'}, {status:503});
      return Response.json({userId:badOwner?other:owner,recordExists:owner===id,
        confirmedAt:owner===id?'2026-11-14T02:12:00Z':null});
    }
    assert.equal(url.pathname,'/rest/v1/affairs_students');
    assert.equal(init.method,'GET');
    assert.equal(headers.get('prefer'),'count=exact');
    assert.deepEqual(Object.fromEntries(url.searchParams),{select:'user_id,year_level,source_mode',user_id:'eq.'+owner,limit:'1'});
    reads.push(['year',owner]);
    if(failYear)return Response.json({details:'provider private error'}, {status:503});
    return Response.json(owner===id?[{user_id:badOwner?other:owner,year_level:3,source_mode:'sample'}]:[],
      {headers:{'content-range':owner===id?'0-0/1':'*/0'}});
  };
  t.mock.method(globalThis,'fetch',fetchMock);
  const auth={auth:{getUser:async()=>({data:{user:{id:caller}},error:null}),getSession:async()=>({data:{session:{user:{id:caller},access_token:caller===id?token:otherToken}},error:null})}};
  const ask=await loadBrowserDispatch(auth,async(path,init)=>{
    requests.push(path);
    assert.equal(init.method,'GET');
    assert.equal(init.cache,'no-store');
    if(failEndpoint)return Response.json({message:'provider private error'},{status:503});
    const result=await invoke(path,init.headers.Authorization.slice('Bearer '.length));
    return Response.json(result.body,{status:result.status});
  });
  const askCase=mode=>{const item=byMode(mode);return ask(caller,item.question,[],undefined,[],item.route);};

  const status=await askCase('record');
  assert.match(status.answer,/current student information has been confirmed/u);
  assert.deepEqual(reads.splice(0),[['confirmation',id]]);
  assert.deepEqual(requests.splice(0),['/api/affairs-data?scope=student-profile&view=mine&answer=en']);
  const compound=await askCase('multipart');
  assert.match(compound.answer,/has been confirmed\.[\s\S]*recorded year level is 3 \(sample data\)/u);
  assert.deepEqual(compound.citations.map(row=>row.chunkId),['account:student-profile-status','account:profile']);
  assert.deepEqual(compound.activity.map(row=>[row.kind,row.status]),[['student-profile','complete'],['account-read:profile:1','complete']]);
  assert.deepEqual(reads.splice(0),[['confirmation',id],['year',id]]);
  assert.deepEqual(requests.splice(0),['/api/affairs-data?scope=student-profile&view=mine&answer=en&year_level=requested']);
  failYear=true;
  const partial=await askCase('multipart');
  assert.match(partial.answer,/has been confirmed[\s\S]*couldn’t verify your recorded year level/u);
  assert.equal(partial.activity[1].status,'unavailable');
  assert.deepEqual(partial.citations.map(row=>row.chunkId),['account:student-profile-status']);
  failYear=false;failProfile=true;
  const otherPartial=await askCase('multipart');
  assert.match(otherPartial.answer,/couldn’t verify whether your student information[\s\S]*year level is 3/u);
  assert.equal(otherPartial.activity[0].status,'unavailable');
  const unavailable=await askCase('unavailable');
  assert.equal(unavailable.status,'handoff');
  assert.match(unavailable.answer,/couldn’t verify/u);
  assert.equal(unavailable.activity[0].status,'unavailable');
  assert.doesNotMatch(unavailable.answer,/no student profile|provider private error/u);
  failEndpoint=true;
  const endpointUnavailable=await askCase('multipart');
  assert.equal(endpointUnavailable.status,'handoff');
  assert.match(endpointUnavailable.answer,/couldn’t verify whether your student information[\s\S]*couldn’t verify your recorded year level/u);
  assert.deepEqual(Array.from(endpointUnavailable.activity,row=>[row.kind,row.status]),[['student-profile','unavailable'],['account-read:profile:1','unavailable']]);
  assert.doesNotMatch(endpointUnavailable.answer,/provider private error/u);
  failEndpoint=false;
  failProfile=false;badOwner=true;
  const deniedEvidence=await askCase('multipart');
  assert.equal(deniedEvidence.status,'handoff');
  assert.deepEqual(deniedEvidence.citations,[]);
  assert.ok(deniedEvidence.activity.every(row=>row.status==='unavailable'));
  badOwner=false;reads.splice(0);requests.splice(0);
  const foreign=await askCase('foreign');
  assert.match(foreign.answer,/can’t access another student’s profile records/u);
  assert.deepEqual(reads,[]);
  assert.deepEqual(requests,[]);
  caller=other;
  const empty=await askCase('empty');
  assert.match(empty.answer,/no student profile available to confirm/u);
  const whollyEmpty=await askCase('multipart');
  assert.match(whollyEmpty.answer,/no student profile available[\s\S]*No student record is linked/u);
  assert.deepEqual(reads.splice(0),[['confirmation',other],['confirmation',other],['year',other]]);
  assert.deepEqual((await invoke('/api/affairs-data?scope=student-profile&view=mine&answer=en')).status,401);
  for(const query of ['&year_level=misspelled','&year_level=requested&user_id='+other,'&year_level=requested&extra=1']){
    assert.equal((await invoke('/api/affairs-data?scope=student-profile&view=mine&answer=en'+query,token)).status,400);
  }
  assert.equal((await invoke('/api/affairs-data?scope=student-profile&view=mine&year_level=requested',token)).status,400);
  assert.equal((await invoke('/api/affairs-data?scope=student-profile&view=manage&year_level=requested&user_id='+other,token)).status,400);
  assert.deepEqual(reads,[]);
});
