import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {newCourseOffering} from '../../src/features/public/affairs/courseCatalogModel.js';
import {SyllabusSearchError,normalizeSyllabusSearchQuery,validateSyllabusMetadataPayload,loadSyllabusSearch,loadSyllabusOptions,loadSyllabusDetail,manageSyllabusMetadata,syllabusSortKeys} from '../../server/syllabusSearch.js';

const owner='10000000-0000-4000-8000-000000000001',id='20000000-0000-4000-8000-000000000001',requestId='30000000-0000-4000-8000-000000000001';
const account={user:{id:owner},url:'https://xiftudmvxphxcjtmfmib.supabase.co',key:'synthetic-public-key',token:'synthetic-caller-token'};
const row={id,sequence:1,course_code:'LOCAL001',course_name:'Synthetic syllabus',admission_name:'Synthetic program',instructor:'Synthetic instructor',academicYearText:null,semesterText:'0'};
const result={scope:'current',total:1,rows:[row],page:0,pageSize:100,hasMore:false,sort:{key:'course_code',direction:'asc'},revision:'0'.repeat(32)};
const metadata={id,request_id:requestId,expected_version:4,syllabus_is_current:true,academic_year_text:'Local year',semester_text:null};
const receipt={id,kind:'save_syllabus_search_metadata',version:5,summary:'Saved local syllabus search metadata.'};
const detail={...newCourseOffering(),id,version:1,published:true,course_code:'LOCAL001',course_name:'Synthetic syllabus',instructor:'Synthetic instructor',syllabus:{}};
type Call={url:URL;headers:Headers;body:Record<string,unknown>;method:string|undefined;redirect:RequestRedirect|undefined;signal:AbortSignal|null|undefined};
const json=(value:unknown,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json'}});
const errorStatus=(status:number)=>(error:unknown)=>error instanceof SyllabusSearchError&&error.status===status;
async function mockFetch(run:(call:Call)=>Response|Promise<Response>,callback:()=>Promise<void>){
  const prior=globalThis.fetch;
  globalThis.fetch=async(input,init)=>run({url:new URL(String(input)),headers:new Headers(init?.headers),body:JSON.parse(String(init?.body)),method:init?.method,redirect:init?.redirect,signal:init?.signal});
  try{await callback();}finally{globalThis.fetch=prior;}
}

test('search accepts only explicit scope, literal filters, bounded pages and numeric OR themes',()=>{
  assert.deepEqual(normalizeSyllabusSearchQuery(),{p_filters:{scope:'current',keyword:'',term:'',department:'',themes:[]},p_page:0,p_page_size:100,p_sort:'course_code',p_direction:'asc'});
  assert.deepEqual(normalizeSyllabusSearchQuery({scope:'syllabus-search',search_scope:'historical',keyword:' 100%_ SQL ',term:'Z9',department:'local',themes:'11,1,11',page:'2',page_size:'50',sort:'semesterText',direction:'desc'}),
    {p_filters:{scope:'historical',keyword:'100%_ SQL',term:'Z9',department:'local',themes:[1,11]},p_page:2,p_page_size:50,p_sort:'semesterText',p_direction:'desc'});
  for(const sort of syllabusSortKeys)assert.equal(normalizeSyllabusSearchQuery({sort}).p_sort,sort);
});

test('repeated, unknown, oversized, malformed and injection-like query values fail before transport',()=>{
  for(const query of [{keyword:['one','two']},{scope:'course-catalog'},{scope:undefined},{search_scope:'past'},
    {page:'-1'},{page:'1.5'},{page:'10001'},{page_size:'101'},{page_size:'0'},{page:'Infinity'},
    {themes:'0'},{themes:'27'},{themes:'01'},{themes:'1,2,'},{themes:'1,,2'},{themes:'1 OR 1=1'},
    {themes:Array(27).fill('1').join(',')},{sort:'course_code; drop table x'},{direction:'ASC'},
    {keyword:'😀'.repeat(161)},{keyword:'\ud800'},{keyword:'\0'},{term:'t'.repeat(13)},{department:'d'.repeat(17)},
    {student_id:owner},{published:'false'}])assert.throws(()=>normalizeSyllabusSearchQuery(query),errorStatus(400),JSON.stringify(query));
});

test('search preserves caller JWT, strict target and bounded RPC parameters',async()=>{
  await mockFetch(call=>{
    assert.equal(call.url.href,account.url+'/rest/v1/rpc/affairs_syllabus_search');
    assert.equal(call.headers.get('authorization'),'Bearer synthetic-caller-token');assert.equal(call.headers.get('apikey'),'synthetic-public-key');
    assert.equal(call.method,'POST');assert.equal(call.redirect,'error');assert.ok(call.signal);
    assert.deepEqual(call.body,normalizeSyllabusSearchQuery());return json(result);
  },async()=>{assert.deepEqual(await loadSyllabusSearch(account),result);});
  await mockFetch(()=>{throw new Error('must not call');},async()=>{
    for(const patch of [{url:'https://example.invalid'},{url:account.url+'.evil.invalid'},{token:''},{key:''},{user:{id:''}}])await assert.rejects(loadSyllabusSearch({...account,...patch}),errorStatus(401));
    await assert.rejects(loadSyllabusSearch({...account,requestDeadline:Date.now()-1}),errorStatus(503));
  });
});

test('minimal result validates exact shape, null/blank/zero text, sequence and incomplete pages',async()=>{
  await mockFetch(()=>json({...result,scope:'historical',rows:[{...row,academicYearText:'',semesterText:'0'}]}),async()=>{
    const data=await loadSyllabusSearch(account,{search_scope:'historical'});assert.equal(data.rows[0].academicYearText,'');assert.equal(data.rows[0].semesterText,'0');
  });
  for(const patch of [{scope:'historical'},{total:2},{page:1},{pageSize:99},{hasMore:true},{revision:'bad'},{revision:null},{sort:{key:'instructor',direction:'asc'}},
    {rows:[]},{private_owner:owner},{rows:[{...row,signed_url:'private'}]},{rows:[{...row,academicYearText:115}]},{rows:[{...row,sequence:0}]},
    {rows:[{...row,id:'bad'}]},{rows:[{...row,instructor:null}]}])
    await mockFetch(()=>json({...result,...patch}),async()=>{await assert.rejects(loadSyllabusSearch(account),errorStatus(503));});
  await mockFetch(()=>json({...result,total:0,rows:[]}),async()=>{assert.deepEqual((await loadSyllabusSearch(account)).rows,[]);});
  await mockFetch(()=>json({...result,page:3,total:1,rows:[]}),async()=>{assert.equal((await loadSyllabusSearch(account,{page:'3'})).total,1);});
});

test('server sorting preserves canonical sequence; duplicate IDs or sequences fail closed',async()=>{
  const second={...row,id:'20000000-0000-4000-8000-000000000002',sequence:2,course_code:'LOCAL002'};
  const sorted={...result,total:2,rows:[second,row],sort:{key:'course_code',direction:'desc'}};
  await mockFetch(()=>json(sorted),async()=>{assert.deepEqual((await loadSyllabusSearch(account,{direction:'desc'})).rows.map(r=>r.sequence),[2,1]);});
  for(const rows of [[row,row],[row,{...second,sequence:1}]])await mockFetch(()=>json({...result,total:2,rows}),async()=>{await assert.rejects(loadSyllabusSearch(account),errorStatus(503));});
});

test('full100-row pages retain total and revision, while truncated or oversized pages are rejected',async()=>{
  const rows=Array.from({length:100},(_,index)=>({...row,id:`70000000-0000-4000-8000-${String(index+1).padStart(12,'0')}`,sequence:index+1}));
  const page={...result,total:103,rows,hasMore:true};
  await mockFetch(()=>json(page),async()=>{const loaded=await loadSyllabusSearch(account);assert.equal(loaded.rows.length,100);assert.equal(loaded.total,103);assert.equal(loaded.revision,result.revision);});
  for(const items of [rows.slice(1),[...rows,{...row,sequence:101}]])await mockFetch(()=>json({...page,rows:items}),async()=>{await assert.rejects(loadSyllabusSearch(account),errorStatus(503));});
  const tail=Array.from({length:3},(_,index)=>({...row,id:`80000000-0000-4000-8000-${String(index+1).padStart(12,'0')}`,sequence:index+101}));
  await mockFetch(()=>json({...page,page:1,rows:tail,hasMore:false}),async()=>{assert.deepEqual((await loadSyllabusSearch(account,{page:'1'})).rows.map(item=>item.sequence),[101,102,103]);});
});

test('options are only validated explicit code/label pairs without inferred or static terms',async()=>{
  const options={terms:[{value:'Z9',label:'Explicit local label'}],departments:[{value:'L',label:'Local unit'}]};
  await mockFetch(call=>{assert.equal(call.url.pathname,'/rest/v1/rpc/affairs_syllabus_options');assert.deepEqual(call.body,{});return json(options);},async()=>{assert.deepEqual(await loadSyllabusOptions(account),options);});
  for(const value of [{terms:[],departments:[],defaultTerm:'1151'},{terms:[...options.terms,...options.terms],departments:[]},
    {terms:[{value:'Z9',label:null}],departments:[]},{terms:Array(1001).fill(options.terms[0]),departments:[]}])
    await mockFetch(()=>json(value),async()=>{await assert.rejects(loadSyllabusOptions(account),errorStatus(503));});
  await mockFetch(()=>json({terms:[],departments:[]}),async()=>{assert.deepEqual(await loadSyllabusOptions(account),{terms:[],departments:[]});});
});

test('published detail has an explicit catalog projection and rejects draft/private/future fields',async()=>{
  await mockFetch(call=>{assert.equal(call.url.pathname,'/rest/v1/rpc/affairs_syllabus_detail');assert.deepEqual(call.body,{p_id:id});return json({row:detail});},async()=>{assert.deepEqual(await loadSyllabusDetail(account,id),{row:detail});});
  await mockFetch(()=>json({row:null}),async()=>{assert.deepEqual(await loadSyllabusDetail(account,id),{row:null});});
  for(const patch of [{published:false},{source_mode:'official'},{id:owner},{student_id:owner},{syllabus_is_current:true},{version:0},{syllabus:{secret:'private'}},
    {meetings:[{weekday:8,periods:['1']}]},{meetings:[{weekday:1,periods:['BAD']}]},{program_codes:['../private']}])
    await mockFetch(()=>json({row:{...detail,...patch}}),async()=>{await assert.rejects(loadSyllabusDetail(account,id),errorStatus(503));});
  await assert.rejects(loadSyllabusDetail(account,'bad'),errorStatus(400));
});

test('metadata is an explicit nullable six-field update, never a full offering or official sync',()=>{
  assert.equal(validateSyllabusMetadataPayload(metadata),null);
  assert.equal(validateSyllabusMetadataPayload({...metadata,syllabus_is_current:null,academic_year_text:null,semester_text:''}),null);
  assert.equal(validateSyllabusMetadataPayload({...metadata,syllabus_is_current:false,academic_year_text:'😀'.repeat(30)}),null);
  for(const key of Object.keys(metadata)){const value:Record<string,unknown>={...metadata};delete value[key];assert.ok(validateSyllabusMetadataPayload(value),key);}
  for(const patch of [{expected_version:0},{expected_version:999999999},{expected_version:'1'},{expected_version:1.2},{request_id:null},{id:'bad'},
    {syllabus_is_current:'true'},{academic_year_text:115},{academic_year_text:'x'.repeat(31)},{semester_text:'\ud800'},{academic_year_text:'\0'},
    {source_mode:'official'},{published:true},{syllabus:{}},{user_id:owner}])assert.ok(validateSyllabusMetadataPayload({...metadata,...patch}),JSON.stringify(patch));
});

test('metadata transport retains exact payload and stable receipt while rejecting malformed results',async()=>{
  await mockFetch(call=>{assert.equal(call.url.pathname,'/rest/v1/rpc/affairs_syllabus_metadata_manage');assert.deepEqual(call.body,{p_payload:metadata});return json(receipt);},async()=>{
    assert.deepEqual(await manageSyllabusMetadata(account,metadata),receipt);assert.deepEqual(await manageSyllabusMetadata(account,metadata),receipt);
  });
  for(const patch of [{id:owner},{version:4},{kind:'save_course_offering'},{private:'excluded'}])
    await mockFetch(()=>json({...receipt,...patch}),async()=>{await assert.rejects(manageSyllabusMetadata(account,metadata),errorStatus(503));});
  await assert.rejects(manageSyllabusMetadata(account,{...metadata,published:true}),errorStatus(400));
});

test('provider errors are bounded, sanitized, status-aware and never leak provider bodies',async()=>{
  for(const providerStatus of [400,401,403,409,429,500])await mockFetch(()=>json({secret:'DO NOT RETURN',url:'private'},providerStatus),async()=>{
    try{await loadSyllabusSearch(account);assert.fail('Expected failure');}catch(error){assert.ok(error instanceof SyllabusSearchError);assert.equal(error.status,providerStatus<410?providerStatus:503);assert.doesNotMatch(error.message,/DO NOT RETURN|private/);}
  });
  await mockFetch(()=>{throw new Error('secret fetch failure');},async()=>{await assert.rejects(loadSyllabusSearch(account),errorStatus(503));});
  await mockFetch(()=>new Response('not-json'),async()=>{await assert.rejects(loadSyllabusSearch(account),errorStatus(503));});
});

test('migration isolates published search, OR themes, explicit metadata and shared version/receipt locks',async()=>{
  const sql=await readFile('supabase/migrations/20261112170000_syllabus_search.sql','utf8');
  assert.match(sql,/add column syllabus_is_current boolean/);assert.doesNotMatch(sql,/update public\.affairs_course_offerings set syllabus_is_current\s*=\s*(?:true|false)/);
  assert.match(sql,/c\.published is true and \(\$1->>'scope'='historical' or c\.syllabus_is_current is true\)/);
  assert.match(sql,/jsonb_array_elements\(\$1->'themes'\) chosen/);assert.match(sql,/@> jsonb_build_array\(chosen\.value\)/);
  assert.match(sql,/p_page_size>100/);assert.match(sql,/row_number\(\) over\(order by course_code collate "C",id\)/);
  assert.match(sql,/md5\(coalesce\(string_agg\(id::text\|\|':'\|\|version::text/);
  assert.match(sql,/private\.affairs_is_admin\(\)/);assert.match(sql,/'course-offering:'\|\|v_id::text/);assert.match(sql,/v_receipt\.payload<>p_payload/);
  assert.match(sql,/v_existing\.version<>v_expected/);assert.match(sql,/insert into private\.affairs_catalog_operations/);
  assert.match(sql,/where id=p_id and published is true/);assert.doesNotMatch(sql,/public\.(?:dtm_|affairs_academic|affairs_charges)|service_role|grant (?:update|insert|delete)/);
});
