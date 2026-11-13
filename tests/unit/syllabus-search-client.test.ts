import assert from 'node:assert/strict';
import test from 'node:test';
import {copySyllabusSearchFilters,createSyllabusSearchClient,SyllabusSearchClientError,type CompleteSyllabusSearchResult} from '../../src/services/syllabusSearchClient';
import type {SyllabusSearchFilters,SyllabusSearchSort} from '../../src/features/public/affairs/SyllabusSearch';
import {newCourseOffering} from '../../src/features/public/affairs/courseCatalogModel.js';
import {newCourseSyllabus} from '../../src/features/public/affairs/courseSyllabusModel.js';
const owner='10000000-0000-4000-8000-000000000001',other='10000000-0000-4000-8000-000000000002';
const session={userId:owner,token:'synthetic-only-token'};
const filters:SyllabusSearchFilters={scope:'current',keyword:' literal & 字 ',term:'T1',department:'DEMO',themes:['26','1']};
const options={terms:[{value:'T1',label:'合成學期'}],departments:[{value:'DEMO',label:'合成系所'}]};
const row=(index:number):CompleteSyllabusSearchResult['rows'][number]=>({id:'20000000-0000-4000-8000-'+String(index).padStart(12,'0'),sequence:index,course_code:'DEMO-'+String(index).padStart(4,'0'),course_name:'合成課程 '+index,admission_name:'',instructor:'合成教師',academicYearText:null,semesterText:'0'});
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}});
const status=(value:number)=>(error:unknown)=>error instanceof SyllabusSearchClientError&&error.status===value;
function page(query:URLSearchParams,total=101,rows=Array.from({length:total},(_,index)=>row(index+1))){
  const offset=Number(query.get('page')??0)*100;
  return {scope:query.get('search_scope')??'current',total,rows:rows.slice(offset,offset+100),page:offset/100,pageSize:100,hasMore:offset+100<total,sort:{key:query.get('sort')??'sequence',direction:query.get('direction')??'asc'},revision:'a'.repeat(32)};
}
const queryOf=(input:RequestInfo|URL)=>new URL(String(input),'https://local.invalid').searchParams;

test('options and full search use only exact local GET scopes and the independent caller token',async()=>{
  let reads=0;const calls:{query:URLSearchParams;init:RequestInit}[]=[];
  const client=createSyllabusSearchClient(async()=>{reads++;return session;},async(input,init)=>{
    assert.ok(String(input).startsWith('/api/affairs-data?'));const query=queryOf(input);calls.push({query,init:init!});
    return json(query.get('scope')==='syllabus-options'?options:page(query));
  });
  assert.deepEqual(await client.loadOptions(owner),options);
  const result=await client.search(owner,filters);assert.equal(result.total,101);assert.equal(result.rows.length,101);assert.equal(result.rows[0].academicYearText,null);assert.equal(result.rows[0].semesterText,'0');assert.equal(result.rows[0].admission_name,'');
  assert.equal(reads,6);assert.equal(calls.length,3);assert.equal(calls[1].init.signal,calls[2].init.signal);
  for(const {init} of calls){assert.equal(init.method,'GET');assert.equal(init.credentials,'omit');assert.equal(init.cache,'no-store');assert.equal(init.redirect,'error');assert.equal(init.body,undefined);assert.equal(new Headers(init.headers).get('Authorization'),'Bearer '+session.token);}
  assert.deepEqual([...calls[1].query.entries()],Object.entries({scope:'syllabus-search',search_scope:'current',keyword:filters.keyword,term:'T1',department:'DEMO',themes:'1,26',page:'0',page_size:'100',sort:'sequence',direction:'asc'}));
  assert.equal(calls[2].query.get('page'),'1');assert.deepEqual(filters.themes,['26','1']);
});

test('only explicit complete zero is empty; a full 1000-row drain is permitted, 1001 asks for refinement',async()=>{
  for(const total of [0,1000,1001]){
    let requests=0;const client=createSyllabusSearchClient(async()=>session,async input=>{requests++;return json(page(queryOf(input),total));});
    if(total===1001){await assert.rejects(client.search(owner,filters),status(422));assert.equal(requests,1);}
    else{const result=await client.search(owner,filters);assert.equal(result.total,total);assert.equal(result.rows.length,total);assert.equal(requests,total===0?1:10);}
  }
});

test('options reject duplicates, ambiguous labels, unknown keys and excessive metadata without partial options',async()=>{
  for(const body of [null,{...options,currentTerm:'T1'},{terms:[...options.terms,...options.terms],departments:[]},{terms:[...options.terms,{value:'T1',label:'different'}],departments:[]},
    {terms:[{value:'',label:'invented'}],departments:[]},{terms:[{value:'T1',label:null}],departments:[]},{terms:[],departments:[{value:'D',label:'Demo',privateNote:'never display'}]},
    {terms:Array.from({length:1001},(_,i)=>({value:String(i),label:'合成'})),departments:[]}]){
    const client=createSyllabusSearchClient(async()=>session,async()=>json(body));await assert.rejects(client.loadOptions(owner),status(503));
  }
  const maximum={terms:Array.from({length:1000},(_,i)=>({value:String(i),label:'合成'})),departments:[]};
  assert.equal((await createSyllabusSearchClient(async()=>session,async()=>json(maximum)).loadOptions(owner)).terms.length,1000);
});

test('cross-page changes, duplicates, malformed counts, unexpected scope and order all fail closed',async()=>{
  const mutations:((body:ReturnType<typeof page>)=>unknown)[]=[
    body=>({...body,revision:'b'.repeat(32)}),body=>({...body,total:102}),body=>({...body,scope:'historical'}),
    body=>({...body,page:0}),body=>({...body,pageSize:99}),body=>({...body,hasMore:true}),body=>({...body,rows:[]}),
    body=>({...body,sort:{key:'course_code',direction:'asc'}}),body=>({...body,rows:[row(1)]}),
    body=>({...body,rows:[{...row(101),sequence:1}]}),body=>({...body,rows:[{...row(101),course_code:'AAA'}]}),
    body=>({...body,rows:[{...row(101),academicYearText:0}]}),body=>({...body,rows:[{...row(101),userId:other}]}),
    body=>({...body,revision:'invalid'}),body=>({...body,unapproved:true}),
  ];
  for(const mutate of mutations){
    const client=createSyllabusSearchClient(async()=>session,async input=>{const query=queryOf(input),body=page(query);return json(query.get('page')==='1'?mutate(body):body);});
    await assert.rejects(client.search(owner,filters),status(503));
  }
  const client=createSyllabusSearchClient(async()=>session,async input=>{const body=page(queryOf(input),2);body.rows.reverse();return json(body);});
  await assert.rejects(client.search(owner,filters),status(503));
});

test('server sorting is checked bytewise with NULLS LAST, stable canonical sequence, and immutable filters',async()=>{
  const rows=[{...row(1),course_name:'\ue000',academicYearText:'1'},{...row(2),course_name:'𐀀',academicYearText:null}];
  const sort:SyllabusSearchSort={key:'course_name',direction:'asc'},input={...filters,themes:[...filters.themes]};
  const client=createSyllabusSearchClient(async()=>{input.keyword='mutated';input.themes.length=0;sort.key='instructor';return session;},async url=>{
    const query=queryOf(url);assert.equal(query.get('keyword'),filters.keyword);assert.equal(query.get('themes'),'1,26');assert.equal(query.get('sort'),'course_name');return json(page(query,2,rows));
  });
  assert.equal((await client.search(owner,input,undefined,sort)).rows.length,2);
  const nullLast=createSyllabusSearchClient(async()=>session,async url=>json(page(queryOf(url),2,rows)));
  assert.equal((await nullLast.search(owner,filters,undefined,{key:'academicYearText',direction:'desc'})).rows[1].academicYearText,null);
});

test('invalid filters, inherited fields and invalid sorting fail before fetching',async()=>{
  let requests=0;const client=createSyllabusSearchClient(async()=>session,async()=>{requests++;return json(options);});
  for(const body of [{...filters,themes:['1','1']},{...filters,themes:['27']},{...filters,scope:{toString:()=> 'current'}},{...filters,keyword:'a'.repeat(161)},{...filters,term:'x\u0000'},{...filters,privateValue:'x'},Object.create(filters)])
    await assert.rejects(client.search(owner,body as SyllabusSearchFilters),status(400));
  await assert.rejects(client.search(owner,filters,undefined,{key:'__proto__',direction:'asc'} as unknown as SyllabusSearchSort),status(400));
  assert.throws(()=>copySyllabusSearchFilters({...filters,keyword:'\ud800'}),status(400));assert.equal(requests,0);
});

test('missing sessions and changes before or after any page never return data or continue draining',async()=>{
  for(const changeAt of [1,2,3,4]){
    let reads=0,requests=0;const client=createSyllabusSearchClient(async()=>++reads===changeAt?{...session,userId:other}:session,async input=>{requests++;return json(page(queryOf(input)));});
    await assert.rejects(client.search(owner,filters),status(401));assert.equal(requests,Math.floor(changeAt/2));
  }
  for(const invalid of [null,{...session,token:''}]){let calls=0;const client=createSyllabusSearchClient(async()=>invalid,async()=>{calls++;return json(options);});await assert.rejects(client.loadOptions(owner),status(401));assert.equal(calls,0);}
});

test('abort and the shared operation deadline cover stalled session, fetch and response-body reads',async()=>{
  let late:(value:typeof session)=>void=()=>{},requests=0;
  const controller=new AbortController(),client=createSyllabusSearchClient(()=>new Promise(resolve=>{late=resolve;}),async()=>{requests++;return json(options);});
  const pending=client.loadOptions(owner,controller.signal);await Promise.resolve();controller.abort();await assert.rejects(pending,{name:'AbortError'});late(session);await Promise.resolve();assert.equal(requests,0);
  const hungSession=createSyllabusSearchClient(()=>new Promise(()=>{}),async()=>json(options),15);await assert.rejects(hungSession.loadOptions(owner),status(504));
  const hungFetch=createSyllabusSearchClient(async()=>session,()=>new Promise(()=>{}),15);await assert.rejects(hungFetch.loadOptions(owner),status(504));
  let cancelled=false;const hungBody=createSyllabusSearchClient(async()=>session,async()=>new Response(new ReadableStream({cancel(){cancelled=true;}})),15);
  await assert.rejects(hungBody.loadOptions(owner),status(504));assert.equal(cancelled,true);
  let pages=0;const drain=createSyllabusSearchClient(async()=>session,async url=>{pages++;return pages===1?json(page(queryOf(url))):new Promise(()=>{});},15);
  await assert.rejects(drain.search(owner,filters),status(504));assert.equal(pages,2);
});

test('HTTP, malformed JSON, oversized bodies and thrown provider details remain generic errors',async()=>{
  for(const responseStatus of [400,401,403,409,500]){
    const client=createSyllabusSearchClient(async()=>session,async()=>json({error:'PRIVATE provider details'},responseStatus));
    await assert.rejects(client.loadOptions(owner),error=>error instanceof SyllabusSearchClientError&&error.status===(responseStatus===500?503:responseStatus)&&!error.message.includes('PRIVATE'));
  }
  for(const fetcher of [async()=>new Response('PRIVATE not json'),async()=>new Response('x'.repeat(512*1024+1)),async()=>{throw new Error('PRIVATE transport');}]){
    const client=createSyllabusSearchClient(async()=>session,fetcher);await assert.rejects(client.search(owner,filters),error=>error instanceof SyllabusSearchClientError&&!error.message.includes('PRIVATE'));
  }
  const client=createSyllabusSearchClient(async()=>{throw new Error('PRIVATE session');},async()=>json(options));await assert.rejects(client.loadOptions(owner),error=>error instanceof SyllabusSearchClientError&&!error.message.includes('PRIVATE'));
});

test('successful complete results remain detached from subsequent caller edits',async()=>{
  const input={...filters,themes:[...filters.themes]},client=createSyllabusSearchClient(async()=>session,async url=>json(page(queryOf(url),1)));
  const result:CompleteSyllabusSearchResult=await client.search(owner,input);result.rows[0].course_name='edited';
  assert.equal((await client.search(owner,input)).rows[0].course_name,'合成課程 1');assert.equal(input.keyword,filters.keyword);
});

test('detail requests use only the published syllabus scope and validate exact row identity and projection',async()=>{
  const id=row(1).id,offering={...newCourseOffering(),id,version:1,published:true,course_name:' literal ',syllabus:newCourseSyllabus()};
  const client=createSyllabusSearchClient(async()=>session,async input=>{assert.equal(String(input),'/api/affairs-data?scope=syllabus-detail&id='+id);return json({row:offering});});
  assert.equal((await client.loadDetail(owner,id)).row?.course_name,' literal ');
  assert.deepEqual(await createSyllabusSearchClient(async()=>session,async()=>json({row:null})).loadDetail(owner,id),{row:null});
  for(const body of [{row:{...offering,published:false}},{row:{...offering,id:row(2).id}},{row:{...offering,privateField:'no'}},{row:{...offering,syllabus:{weeks:[]}}},{row:{...offering,credits:'3'}},{row:{...offering,source_mode:'official'}},{row:offering,extra:true}])
    await assert.rejects(createSyllabusSearchClient(async()=>session,async()=>json(body)).loadDetail(owner,id),status(503));
  await assert.rejects(client.loadDetail(owner,'https://school.invalid/'),status(400));
});

test('metadata writes preserve exact null/false/blank/Unicode payloads and validate versioned receipts',async()=>{
  const payload={id:row(1).id,request_id:'30000000-0000-4000-8000-000000000001',expected_version:7,syllabus_is_current:false,academic_year_text:'𐀀'.repeat(30),semester_text:''};
  const saved={id:payload.id,kind:'save_syllabus_search_metadata',version:8,summary:'Saved local metadata'};
  let writes=0,reads=0;
  const client=createSyllabusSearchClient(async()=>{reads++;return session;},async(input,init)=>{writes++;assert.equal(input,'/api/affairs-manage');assert.equal(init?.method,'POST');assert.equal(init?.redirect,'error');assert.deepEqual(JSON.parse(String(init?.body)),{kind:'syllabus-metadata',payload});return json(saved);});
  assert.deepEqual(await client.saveMetadata(owner,payload),saved);assert.equal(writes,1);assert.equal(reads,2);
  const cleared={...payload,syllabus_is_current:null,academic_year_text:null,semester_text:null};
  assert.deepEqual(await createSyllabusSearchClient(async()=>session,async(_input,init)=>{assert.deepEqual(JSON.parse(String(init?.body)).payload,cleared);return json(saved);}).saveMetadata(owner,cleared),saved);
  for(const invalid of [{...payload,academic_year_text:'字'.repeat(31)},{...payload,syllabus_is_current:'true'},{...payload,expected_version:0},{...payload,extra:'no'},Object.create(payload)])
    await assert.rejects(client.saveMetadata(owner,invalid as typeof payload),status(400));
  assert.equal(writes,1);
  for(const receipt of [{...saved,id:row(2).id},{...saved,version:9},{...saved,kind:'save_course_offering'},{...saved,extra:true}])await assert.rejects(createSyllabusSearchClient(async()=>session,async()=>json(receipt)).saveMetadata(owner,payload),status(503));
  let sessionReads=0;await assert.rejects(createSyllabusSearchClient(async()=>++sessionReads===1?session:{...session,userId:other},async()=>json(saved)).saveMetadata(owner,payload),status(401));
});
