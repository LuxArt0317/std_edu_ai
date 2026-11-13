import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createDtmGradeReportClient,DtmGradeReportClientError,emptyDtmGradeCells,parseDtmGradeReportReceipt,type DtmGradeReportAction,type DtmGradeReportReceipt} from '../../src/services/dtmGradeReport';
const owner='10000000-0000-4000-8000-000000000001',manager='10000000-0000-4000-8000-000000000002',other='10000000-0000-4000-8000-000000000003',course='20000000-0000-4000-8000-000000000001';
const action=():DtmGradeReportAction=>({kind:'save_dtm_grade_report',payload:{id:'30000000-0000-4000-8000-000000000001',user_id:owner,course_id:course,request_id:'40000000-0000-4000-8000-000000000001',expected_version:0,report:{items:[{...emptyDtmGradeCells(),id:'50000000-0000-4000-8000-000000000001',label:'Synthetic',activityKind:null,gradeText:'',score:0}],total:null}}});
const receipt=(a:DtmGradeReportAction):DtmGradeReportReceipt=>({id:a.payload.id,userId:owner,courseId:course,kind:a.kind,version:1,summary:'Saved synthetic report'});
const json=(value:unknown)=>new Response(JSON.stringify(value),{status:200,headers:{'content-type':'application/json'}});
const session=(userId=manager)=>({userId,token:'synthetic-jwt'});
const deferred=<T,>()=>{let resolve!:(value:T)=>void;const promise=new Promise<T>(done=>{resolve=done;});return {promise,resolve};};
test('own/admin/course-page/overview reads have exact scope, captured cursor and strict owned response',async()=>{
 const calls:{path:string;options:RequestInit}[]=[],cursor='20000000-0000-4000-8000-000000000000';let userId=owner;
 const client=createDtmGradeReportClient(async()=>session(userId),(async(path,options)=>{calls.push({path:String(path),options:options!});return json(String(path).includes('overview')?{courses:[{id:course,userId:owner,title:'Synthetic',code:'SYN-1',term:'Synthetic term',gradeText:''}],limit:100,nextCursor:null}:String(path).includes('courses-admin')?{courses:[{id:course,userId:owner,title:'Synthetic',code:'SYN-1',term:'Synthetic term'}],limit:100,nextCursor:null}:{report:null});}) as typeof fetch);
 assert.deepEqual(await client.load(owner,course),{report:null});await client.loadOverview(owner,{afterId:cursor});userId=manager;await client.loadAdmin(manager,owner,course);await client.loadCoursesAdmin(manager,owner,{afterId:cursor});
 assert.deepEqual(calls.map(x=>x.path),['/api/affairs-data?scope=dtm-grade-report&course_id='+course,'/api/affairs-data?scope=dtm-grade-report-overview&after_id='+cursor,'/api/affairs-data?scope=dtm-grade-report-admin&user_id='+owner+'&course_id='+course,'/api/affairs-data?scope=dtm-grade-report-courses-admin&user_id='+owner+'&after_id='+cursor]);
 for(const call of calls){assert.equal(call.options.redirect,'error');assert.equal(call.options.credentials,'omit');assert.equal(call.options.cache,'no-store');assert.equal(call.options.method,'GET');}
 const foreign=createDtmGradeReportClient(async()=>session(owner),(async()=>json({courses:[{id:course,userId:other,title:'Hidden',code:'SYN-1',term:'Synthetic term',gradeText:'99'}],limit:100,nextCursor:null})) as typeof fetch);await assert.rejects(()=>foreign.loadOverview(owner),DtmGradeReportClientError);
});
test('queued session resolution, abort and post-response caller changes cannot send or return another account data',async()=>{
 let count=0;const wait=deferred<ReturnType<typeof session>>();const client=createDtmGradeReportClient(()=>wait.promise,(async()=>{count++;return json({report:null});}) as typeof fetch);const controller=new AbortController(),pending=client.load(owner,course,controller.signal);controller.abort();await assert.rejects(pending);wait.resolve(session(owner));await Promise.resolve();assert.equal(count,0);
 const mismatch=createDtmGradeReportClient(async()=>session(other),(async()=>{count++;return json({report:null});}) as typeof fetch);await assert.rejects(()=>mismatch.load(owner,course),(e)=>e instanceof DtmGradeReportClientError&&e.status===401);assert.equal(count,0);
 let reads=0;const switched=createDtmGradeReportClient(async()=>session(++reads===1?owner:other),(async()=>json({report:null})) as typeof fetch);await assert.rejects(()=>switched.load(owner,course),(e)=>e instanceof DtmGradeReportClientError&&e.status===401);
});
test('save captures nested command before awaiting session, checks exact receipt and does not alter null/blank/zero',async()=>{
 const wait=deferred<ReturnType<typeof session>>(),original=action(),expected=structuredClone(original);let sent:unknown;
 const client=createDtmGradeReportClient(()=>wait.promise,(async(_path,options)=>{sent=JSON.parse(String(options?.body));return json(receipt(expected));}) as typeof fetch);
 const pending=client.manage(manager,original);original.payload.user_id=other;if(original.kind==='save_dtm_grade_report')original.payload.report.items[0].gradeText='changed';wait.resolve(session());assert.deepEqual(await pending,receipt(expected));assert.deepEqual(sent,expected);
 for(const patch of [{summary:''},{summary:'  '},{userId:other},{courseId:other},{version:2},{extra:true}])assert.throws(()=>parseDtmGradeReportReceipt({...receipt(expected),...patch},expected),DtmGradeReportClientError);
});
test('strict invalid command/cursor blocks fetch, HTTP conflict is preserved and retries keep exact supplied command',async()=>{
 let count=0;const bodies:string[]=[];const client=createDtmGradeReportClient(async()=>session(),(async(_path,options)=>{count++;bodies.push(String(options?.body));return count===1?new Response('{}',{status:409}):json(receipt(action()));}) as typeof fetch);
 await assert.rejects(()=>client.loadCoursesAdmin(manager,owner,{afterId:'bad'}),(e)=>e instanceof DtmGradeReportClientError&&e.status===400);assert.equal(count,0);
 const invalid=action();if(invalid.kind==='save_dtm_grade_report')invalid.payload.report.items[0].score=NaN;await assert.rejects(()=>client.manage(manager,invalid));assert.equal(count,0);
 const same=action();await assert.rejects(()=>client.manage(manager,same),(e)=>e instanceof DtmGradeReportClientError&&e.status===409);await client.manage(manager,same);assert.equal(bodies[0],bodies[1]);
});
test('bounded read handles oversized/malformed UTF8 and deadline without accepting incomplete payloads',async()=>{
 for(const response of [new Response('x'.repeat(196609)),new Response(new Uint8Array([0xc3,0x28])),new Response('{')]){
 const client=createDtmGradeReportClient(async()=>session(owner),(async()=>response) as typeof fetch);await assert.rejects(()=>client.load(owner,course),DtmGradeReportClientError);}
 const timeout=createDtmGradeReportClient(()=>new Promise(()=>{}),(async()=>{throw Error('No fetch');}) as typeof fetch,10);await assert.rejects(()=>timeout.load(owner,course),(e)=>e instanceof DtmGradeReportClientError&&e.status===504);
});
