import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createDtmCourseContentClient,DtmCourseContentClientError,loadAllDtmCourseContent,orderedDtmCourseSections,parseDtmCourseContentReceipt,type DtmCourseContentAction,type DtmCourseContentData,type DtmCourseContentActivity,type DtmCourseContentRecord} from '../../src/services/dtmCourseContent';
const owner='10000000-0000-4000-8000-000000000001',manager='10000000-0000-4000-8000-000000000002',other='10000000-0000-4000-8000-000000000003',courseId='20000000-0000-4000-8000-000000000001',date='2030-01-01T00:00:00Z';
const id=(n:number)=>'40000000-0000-4000-8000-'+String(n).padStart(12,'0');
const course={id:courseId,userId:owner,title:'Synthetic course',code:'QA',term:'Synthetic term'};
const activity=(n:number):DtmCourseContentActivity=>({kind:'assignment',id:id(n),title:'Synthetic '+n,details:'',dueAt:null});
const page=(activities:DtmCourseContentActivity[]=[],patch:Partial<DtmCourseContentData>={}):DtmCourseContentData=>({course,content:null,activities,total:activities.length,limit:100,nextCursor:null,revision:'a'.repeat(64),unavailableReferenceCount:0,...patch});
const record:DtmCourseContentRecord={id:'30000000-0000-4000-8000-000000000001',userId:owner,courseId,sourceMode:'local_demo',version:1,createdAt:date,updatedAt:date,references:[]};
const action=():DtmCourseContentAction=>({kind:'save_dtm_course_content',payload:{id:record.id,user_id:owner,course_id:courseId,request_id:id(999),expected_version:0,content:{references:[{kind:'assignment',id:id(1),section:'quizzes'}]}}});
const receipt=(a:DtmCourseContentAction)=>({id:a.payload.id,userId:owner,courseId,kind:a.kind,version:a.payload.expected_version+1,summary:'Saved synthetic placement'});
const json=(value:unknown)=>new Response(JSON.stringify(value),{headers:{'content-type':'application/json'}});
const session=(userId=manager)=>({userId,token:'synthetic-jwt'});
const deferred=<T,>()=>{let resolve!:(value:T)=>void;const promise=new Promise<T>(done=>{resolve=done;});return {promise,resolve};};
test('own/admin/course and exact-assignment reads use exact scoped URLs and reject foreign returned data',async()=>{
 let caller=owner;const calls:{path:string;options:RequestInit}[]=[];
 const client=createDtmCourseContentClient(async()=>session(caller),(async(path,options)=>{const url=String(path);calls.push({path:url,options:options!});return json(url.includes('courses-admin')?{courses:[course],limit:100,nextCursor:null}:url.includes('content-assignment')?{assignment:null}:page());}) as typeof fetch);
 await client.load(owner,courseId);await client.loadAssignment(owner,courseId,id(1));caller=manager;await client.loadAdmin(manager,owner,courseId);await client.loadCoursesAdmin(manager,owner,{afterId:'20000000-0000-4000-8000-000000000000'});
 assert.deepEqual(calls.map(row=>row.path),['/api/affairs-data?scope=dtm-course-content&course_id='+courseId,'/api/affairs-data?scope=dtm-course-content-assignment&course_id='+courseId+'&assignment_id='+id(1),'/api/affairs-data?scope=dtm-course-content-admin&user_id='+owner+'&course_id='+courseId,'/api/affairs-data?scope=dtm-course-content-courses-admin&user_id='+owner+'&after_id=20000000-0000-4000-8000-000000000000']);
 for(const call of calls){assert.equal(call.options.redirect,'error');assert.equal(call.options.credentials,'omit');assert.equal(call.options.cache,'no-store');assert.equal(call.options.method,'GET');}
 const foreign=createDtmCourseContentClient(async()=>session(owner),(async()=>json(page([],{course:{...course,userId:other}}))) as typeof fetch);await assert.rejects(()=>foreign.load(owner,courseId),DtmCourseContentClientError);
});
test('queued session abort, foreign session and post-response account switch fail closed',async()=>{
 let count=0;const wait=deferred<ReturnType<typeof session>>(),controller=new AbortController();const client=createDtmCourseContentClient(()=>wait.promise,(async()=>{count++;return json(page());}) as typeof fetch);
 const pending=client.load(owner,courseId,{},controller.signal);controller.abort();await assert.rejects(pending);wait.resolve(session(owner));await Promise.resolve();assert.equal(count,0);
 const foreign=createDtmCourseContentClient(async()=>session(other),(async()=>{count++;return json(page());}) as typeof fetch);await assert.rejects(()=>foreign.load(owner,courseId),(e)=>e instanceof DtmCourseContentClientError&&e.status===401);assert.equal(count,0);
 let reads=0;const switched=createDtmCourseContentClient(async()=>session(++reads===1?owner:other),(async()=>json(page())) as typeof fetch);await assert.rejects(()=>switched.load(owner,courseId),(e)=>e instanceof DtmCourseContentClientError&&e.status===401);
});
test('save captures nested command before awaiting session and validates exact receipt target',async()=>{
 const wait=deferred<ReturnType<typeof session>>(),input=action(),expected=structuredClone(input);let sent:unknown;
 const client=createDtmCourseContentClient(()=>wait.promise,(async(_path,options)=>{sent=JSON.parse(String(options?.body));return json(receipt(expected));}) as typeof fetch);
 const pending=client.manage(manager,input);input.payload.user_id=other;if(input.kind==='save_dtm_course_content')input.payload.content.references[0].section='materials';wait.resolve(session());assert.deepEqual(await pending,receipt(expected));assert.deepEqual(sent,expected);
 for(const patch of [{summary:''},{summary:'  '},{userId:other},{courseId:other},{version:2},{extra:true}])assert.throws(()=>parseDtmCourseContentReceipt({...receipt(expected),...patch},expected),DtmCourseContentClientError);
});
test('strict cursor pairs and commands stop before fetch; conflict preserves exact retry command',async()=>{
 let count=0;const bodies:string[]=[];const client=createDtmCourseContentClient(async()=>session(),(async(_path,options)=>{count++;bodies.push(String(options?.body));return count===1?new Response('{}',{status:409}):json(receipt(action()));}) as typeof fetch);
 for(const options of [{afterKind:'assignment' as const},{afterId:id(1)},{afterKind:'assignment' as const,afterId:'bad'}])await assert.rejects(()=>client.loadAdmin(manager,owner,courseId,options),(e)=>e instanceof DtmCourseContentClientError&&e.status===400);
 const invalid=action();if(invalid.kind==='save_dtm_course_content')invalid.payload.content.references.push({...invalid.payload.content.references[0]});await assert.rejects(()=>client.manage(manager,invalid));assert.equal(count,0);
 const same=action();await assert.rejects(()=>client.manage(manager,same),(e)=>e instanceof DtmCourseContentClientError&&e.status===409);await client.manage(manager,same);assert.equal(bodies[0],bodies[1]);
});
test('response byte/UTF8/JSON limits and total request deadline reject incomplete responses',async()=>{
 for(const response of [new Response('x'.repeat(196609)),new Response(new Uint8Array([0xc3,0x28])),new Response('{')]){const client=createDtmCourseContentClient(async()=>session(owner),(async()=>response) as typeof fetch);await assert.rejects(()=>client.load(owner,courseId),DtmCourseContentClientError);}
 const timeout=createDtmCourseContentClient(()=>new Promise(()=>{}),(async()=>{throw Error('No fetch');}) as typeof fetch,10);await assert.rejects(()=>timeout.load(owner,courseId),(e)=>e instanceof DtmCourseContentClientError&&e.status===504);
});
test('complete inventory follows paired cursors and verifies missing references across all pages',async()=>{
 const rows=Array.from({length:101},(_,i)=>activity(i+1)),content={...record,references:[{kind:'assignment' as const,id:id(101),section:'quizzes' as const},{kind:'material' as const,id:id(999),section:'materials' as const}]};const cursors:unknown[]=[];
 const result=await loadAllDtmCourseContent(async options=>{cursors.push(options);return page(options.afterId?rows.slice(100):rows.slice(0,100),{content,total:101,nextCursor:options.afterId?null:{kind:'assignment',id:id(100)},unavailableReferenceCount:1});},owner,courseId);
 assert.equal(result.activities.length,101);assert.equal(result.unavailableReferenceCount,1);assert.deepEqual(cursors,[{},{afterKind:'assignment',afterId:id(100)}]);assert.equal(orderedDtmCourseSections(result).quizzes[0].id,id(101));
});
test('revision, metadata, count, ordering, missing-reference mismatch and later page failures never return partial inventory',async()=>{
 const first=page(Array.from({length:100},(_,i)=>activity(i+1)),{total:101,nextCursor:{kind:'assignment',id:id(100)}});
 for(const second of [page([activity(101)],{total:101,revision:'b'.repeat(64)}),page([activity(101)],{total:101,course:{...course,title:'Changed'}}),page([],{total:101}),page([activity(100)],{total:101}),page([activity(101)],{total:102})])await assert.rejects(()=>loadAllDtmCourseContent(async options=>options.afterId?second:first,owner,courseId));
 await assert.rejects(()=>loadAllDtmCourseContent(async options=>{if(options.afterId)throw new DtmCourseContentClientError('Revoked',403);return first;},owner,courseId),(e)=>e instanceof DtmCourseContentClientError&&e.status===403);
 await assert.rejects(()=>loadAllDtmCourseContent(async()=>page([],{content:{...record,references:[{kind:'assignment',id:id(1),section:'quizzes'}]}}),owner,courseId));
});
test('full-inventory time and aggregate byte budgets fail explicitly without truncating',async()=>{
 await assert.rejects(()=>loadAllDtmCourseContent(()=>new Promise(()=>{}),owner,courseId,undefined,10),(e)=>e instanceof DtmCourseContentClientError&&e.status===504);
 let pages=0;await assert.rejects(()=>loadAllDtmCourseContent(async options=>{pages++;const start=options.afterId?Number(options.afterId.slice(-12)):0;return page(Array.from({length:100},(_,i)=>({...activity(start+i+1),details:'x'.repeat(1200)})),{total:5000,nextCursor:{kind:'assignment',id:id(start+100)}});},owner,courseId),(e)=>e instanceof DtmCourseContentClientError&&/容量/.test(e.message));assert.ok(pages>1&&pages<50);
});
test('placement is independent of activity kind, preserves explicit order and appends unplaced defaults exactly once',async()=>{
 const material=(n:number,position:number):DtmCourseContentActivity=>({kind:'material',id:id(n),title:'Material '+n,materialKind:'page',summary:'',position,sourceMode:'personal',sourceUrl:null});
 const rows=[{...activity(1),dueAt:'2030-01-03T00:00:00Z'},{...activity(2),dueAt:'2030-01-01T00:00:00Z'},activity(3),material(1,2),material(2,1)];
 const snapshot=await loadAllDtmCourseContent(async()=>page(rows),owner,courseId);let sections=orderedDtmCourseSections(snapshot);assert.deepEqual(sections.assignments.map(row=>row.id),[id(2),id(1),id(3)]);assert.deepEqual(sections.materials.map(row=>row.id),[id(2),id(1)]);
 sections=orderedDtmCourseSections({...snapshot,content:{...record,references:[{kind:'material',id:id(1),section:'assignments'},{kind:'assignment',id:id(3),section:'quizzes'},{kind:'assignment',id:id(1),section:'assignments'},{kind:'assignment',id:id(999),section:'quizzes'}]}});
 assert.deepEqual(sections.assignments.map(row=>[row.kind,row.id]),[['material',id(1)],['assignment',id(1)],['assignment',id(2)]]);assert.deepEqual(sections.quizzes.map(row=>row.id),[id(3)]);assert.deepEqual(sections.materials.map(row=>row.id),[id(2)]);assert.equal(Object.values(sections).flat().length,5);
});
