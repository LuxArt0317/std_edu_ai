import assert from 'node:assert/strict';
import test from 'node:test';
import affairsData from '../../api/affairs-data.ts';
import {createAffairsAssistantHandler} from '../../api/affairs-assistant.ts';
import {readHealthExaminationEvidence} from '../../server/accountHealthExaminationEvidence.js';
import {healthReportBucket,healthExaminationScope} from '../../server/healthExaminationContract.js';
import {buildHealthExaminationCases,gradeHealthExaminationCase,healthExaminationFixtureForCase} from './health-examination-cases.mjs';
import {readReply} from './run.mjs';

const origin='https://xiftudmvxphxcjtmfmib.supabase.co';
const syntheticPdf='%PDF-1.4\n% synthetic examination fixture\n%%EOF\n';
const ownerToken='SYNTHETIC_HEALTH_OWNER_TOKEN_'.repeat(2);
const otherToken='SYNTHETIC_HEALTH_OTHER_TOKEN_'.repeat(2);
const serviceKey='SYNTHETIC_HEALTH_STORAGE_KEY';
const publishableKey='SYNTHETIC_HEALTH_PUBLISHABLE_KEY';
const capabilityToken='SYNTHETIC_HEALTH_CAPABILITY_TOKEN';
const fixtures=buildHealthExaminationCases();
const healthCase=suffix=>fixtures.find(row=>row.id==='account:health-examinations-'+suffix);
const ownedCase=healthCase('report-available');
const {owner,foreignOwner,rows,foreignRows}=healthExaminationFixtureForCase(ownedCase);
const storageKey=(userId,reportId)=>userId+'/'+reportId+'.pdf';
const endpoint='/rest/v1/rpc/affairs_read_health_examinations';
const authorize='/rest/v1/rpc/affairs_can_download_health_report';
const sign='/storage/v1/object/sign/'+healthReportBucket+'/';

async function invoke(handler,{token,query,body}={}){
  const headers=new Headers(),chunks=[];
  let responseBody,status;
  const response={setHeader(name,value){headers.set(name,value);},status(code){status=code;return this;},
    json(value){responseBody=JSON.stringify(value);},write(chunk){chunks.push(chunk);},end(){},flushHeaders(){}};
  await handler({method:body?'POST':'GET',headers:token?{authorization:'Bearer '+token}:{},query,body},response);
  assert.ok(status,'The actual handler must send a terminal status');
  return new Response(chunks.join('')||responseBody,{headers,status});
}

test('the same owned Storage fixture enables the inquiry PDF and only availability metadata in chat',async t=>{
  const env={VITE_SUPABASE_URL:origin,VITE_SUPABASE_PUBLISHABLE_KEY:publishableKey,
    SUPABASE_SECRET_KEY:serviceKey,OPENAI_API_KEY:'SYNTHETIC_HEALTH_REVIEW_KEY'};
  for(const [key,value] of Object.entries(env)){
    const previous=process.env[key];
    process.env[key]=value;
    t.after(()=>{if(previous===undefined)delete process.env[key];else process.env[key]=previous;});
  }

  const [attached,withheld,missing]=rows;
  const [otherReport]=foreignRows;
  const register=new Map([
    [owner,[attached,withheld,{...missing,report_available:true}]],
    [foreignOwner,[{...otherReport,report_available:true}]],
  ]);
  const files=new Map([attached,withheld].map(row=>[storageKey(owner,row.id),syntheticPdf]));
  files.set(storageKey(foreignOwner,otherReport.id),syntheticPdf);
  const before=structuredClone({register,files});
  const tokens=new Map([[ownerToken,owner],[otherToken,foreignOwner]]);
  const calls=[],queries=[],unexpected=[];
  const available=(userId,row)=>row.report_available&&files.has(storageKey(userId,row.id));
  const exactFlags=[true,false,false];
  t.mock.method(globalThis,'fetch',async(input,init={})=>{
    try{
      const url=new URL(input),method=init.method??'GET',headers=new Headers(init.headers);
      const token=headers.get('authorization')?.slice(7);
      const userId=tokens.get(token);
      calls.push(url.pathname);
      if(url.href==='https://api.openai.com/v1/responses'){
        const request=JSON.parse(init.body);
        assert.equal(request.text.format.name,'answer_evidence_review');
        const value=JSON.parse(request.input[0].content[0].text);
        assert.deepEqual(value.evidence.map(source=>source.id),['account-scope','account:healthExaminations']);
        assert.doesNotMatch(JSON.stringify(value),/PRIVATE HEALTH|FOREIGN HEALTH|3600000|storage\/v1|SYNTHETIC_HEALTH/u);
        const metadata=JSON.parse(value.evidence[1].content);
        assert.deepEqual(metadata.records,rows.map((row,index)=>({
          examinationCode:row.examination_code,reportAvailable:exactFlags[index],
        })));
        assert.equal(metadata.capability.downloads,false);
        const review={supported:true,answersQuestion:true,claims:rows.map((row,index)=>({
          claim:'Saved report availability for '+row.examination_code+' is '+exactFlags[index]+'.',
          supported:true,evidenceId:'account:healthExaminations',quotes:[],
          jsonPaths:['/records/'+index+'/examinationCode','/records/'+index+'/reportAvailable'],
        }))};
        return Response.json({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify(review)}]}]});
      }
      assert.equal(url.origin,origin);
      if(url.pathname.startsWith(sign)){
        const key=url.pathname.slice(sign.length);
        assert.equal(key,storageKey(owner,attached.id));
        assert.ok(files.has(key));
        if(method==='POST'){
          assert.equal(token,serviceKey);
          assert.equal(headers.get('apikey'),serviceKey);
          assert.equal(init.redirect,'error');
          assert.deepEqual(JSON.parse(init.body),{expiresIn:30});
          return Response.json({signedURL:url.pathname.slice('/storage/v1'.length)+'?token='+capabilityToken});
        }
        assert.equal(method,'GET');
        assert.equal(url.searchParams.get('token'),capabilityToken);
        return new Response(files.get(key),{headers:{'Content-Type':'application/pdf'}});
      }
      assert.ok(userId,'Every private RPC uses an authorized synthetic caller');
      assert.equal(headers.get('apikey'),publishableKey);
      if(url.pathname==='/auth/v1/user'){
        assert.equal(method,'GET');
        return Response.json({id:userId,identities:[{provider:'google'}]});
      }
      assert.equal(method,'POST');
      assert.equal(init.redirect,'error');
      const args=JSON.parse(init.body),owned=register.get(userId);
      if(url.pathname===endpoint){
        assert.deepEqual(args,{p_offset:0});
        queries.push({scope:healthExaminationScope,page:String(args.p_offset/25+1)});
        return Response.json({userId,total:owned.length,rows:owned.map(row=>({...row,report_available:available(userId,row)}))});
      }
      assert.equal(url.pathname,authorize);
      assert.deepEqual(Object.keys(args),['p_record_id']);
      return Response.json(owned.some(row=>row.id===args.p_record_id&&available(userId,row)));
    }catch(error){unexpected.push(error);throw error;}
  });

  const data=(token,extra)=>invoke(affairsData,{token,query:{scope:healthExaminationScope,...extra}});
  const inquiry=await data(ownerToken);
  assert.equal(inquiry.status,200);
  assert.match(inquiry.headers.get('cache-control'),/no-store/u);
  assert.deepEqual((await inquiry.json()).rows.map(row=>row.report_available),exactFlags);
  const otherInquiry=await data(otherToken);
  assert.equal(otherInquiry.status,200);
  assert.deepEqual((await otherInquiry.json()).rows.map(row=>[row.id,row.report_available]),[[otherReport.id,true]]);
  for(const [token,report,status] of [[ownerToken,withheld.id,404],[ownerToken,missing.id,404],
    [ownerToken,'36000002-0000-4000-8000-000000000999',404],[ownerToken,otherReport.id,404],
    [otherToken,attached.id,404],[undefined,attached.id,401]]){
    const denied=await data(token,{report});
    assert.equal(denied.status,status);
    assert.deepEqual(Object.keys(await denied.json()),['error']);
  }
  assert.equal(calls.filter(path=>path.startsWith(sign)).length,0);
  const granted=await data(ownerToken,{report:attached.id});
  assert.equal(granted.status,200);
  const {url}=await granted.json(),file=await fetch(url);
  assert.equal(file.headers.get('content-type'),'application/pdf');
  assert.equal(await file.text(),syntheticPdf);
  assert.equal(calls.filter(path=>path.startsWith(sign)).length,2);

  let metadataResult=null;
  const assistant=createAffairsAssistantHandler({
    loadSnapshot:async()=>assert.fail('This lookup needs no broad account snapshot'),
    publicResearch:async()=>assert.fail('Personal report metadata needs no public research'),
    readers:{healthExaminations:async(...args)=>{metadataResult=await readHealthExaminationEvidence(...args);return metadataResult;}},
  });
  const beforeChat=calls.length,beforeQueries=queries.length;
  const response=await invoke(assistant,{token:ownerToken,body:{question:ownedCase.question,route:ownedCase.route,stream:true}});
  const envelope={...await readReply(response),statusCode:response.status,execution:'deterministic',fixtureKey:ownedCase.fixtureKey};
  const chat=calls.slice(beforeChat);
  assert.deepEqual(chat,['/auth/v1/user',endpoint,'/v1/responses']);
  const observation={result:metadataResult,readCalls:chat.filter(path=>path===endpoint).length,
    queries:queries.slice(beforeQueries),storageRequests:chat.filter(path=>path===authorize||path.startsWith('/storage/v1/')),
    writeRequests:chat.filter(path=>path.startsWith('/rest/v1/')&&path!==endpoint&&path!==authorize)};
  const outcome=gradeHealthExaminationCase(ownedCase,envelope,{observation});
  assert.equal(outcome.passed,true,JSON.stringify(outcome.failures.map(failure=>failure.id)));
  assert.deepEqual(envelope.body.verification,{status:'verified',attempts:1});
  assert.doesNotMatch(JSON.stringify(envelope),/SYNTHETIC_HEALTH|3600000|FOREIGN HEALTH|PRIVATE HEALTH|storage\/v1|%PDF/u);

  const foreignCase=healthCase('foreign-account'),beforeForeign=calls.length;
  const foreign=await invoke(assistant,{token:ownerToken,body:{question:foreignCase.question,route:foreignCase.route}});
  assert.equal(foreign.status,200);
  const deniedBody=await foreign.json();
  assert.equal(deniedBody.status,'handoff');
  assert.deepEqual(deniedBody.citations,[]);
  assert.deepEqual(calls.slice(beforeForeign),['/auth/v1/user']);
  assert.deepEqual(unexpected,[]);
  assert.deepEqual({register,files},before);
});
