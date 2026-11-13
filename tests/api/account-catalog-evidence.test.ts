import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFile} from 'node:fs/promises';
import {catalogEvidenceRequirements,catalogEvidenceMaxBytes,isCatalogEvidenceQuestion,readCatalogEvidence,type CatalogEvidenceQuery} from '../../server/accountCatalogEvidence.js';
import type {SyllabusAccount,SyllabusSearchResult} from '../../server/syllabusSearch.js';
import {newCourseOffering} from '../../src/features/public/affairs/courseCatalogModel.js';
import {newCourseSyllabus} from '../../src/features/public/affairs/courseSyllabusModel.js';

const id='20000000-0000-4000-8000-000000000001',other='20000000-0000-4000-8000-000000000002';
const account={user:{id:'10000000-0000-4000-8000-000000000001'},url:'https://xiftudmvxphxcjtmfmib.supabase.co',key:'synthetic-key',token:'synthetic-caller-token'};
const route='/school-affairs/services/12-4';
const deadline=()=>Date.now()+20_000;
const offering=()=>({...newCourseOffering(),id,version:3,published:true,source_mode:'sample' as const,
  term_code:'1151',term_label:'Local 115 first term',department_code:'IM',department_name:'Local Information Studies',classification_code:'IMU',admission_code:'1',admission_name:'Day program',
  course_code:'CAT301',course_name:'Catalog Database Design',instructor:'Catalog Teacher',room1:'C301',credits:3,capacity:30,enrolled_count:10,selected_count:11,
  meetings:[{weekday:3,periods:['3','4']}],syllabus:{...newCourseSyllabus(),objectives:'Explain database normalization.',grading:[{weight:25,methods:['1']},{weight:null,methods:[]},{weight:null,methods:[]},{weight:null,methods:[]}]}});
const summary=(n=1)=>({id:n===1?id:other,sequence:n,course_code:'CAT301',course_name:'Catalog Database Design',admission_name:'Day program',instructor:'Catalog Teacher',academicYearText:null,semesterText:'1'});
const page=(patch:Partial<SyllabusSearchResult>={}):SyllabusSearchResult=>({scope:'historical',total:1,rows:[summary()],page:0,pageSize:20,hasMore:false,sort:{key:'course_code',direction:'asc'},revision:'a'.repeat(32),...patch});
const content=(result:Awaited<ReturnType<typeof readCatalogEvidence>>)=>JSON.parse(result.evidence.content);

test('caller identity, credentials and selectors are captured before deferred catalog reads',async()=>{
  const originalUser=account.user.id,inherited=Date.now()+5000;
  const caller={...account,user:{...account.user,email:'private-extra@example.invalid'},requestDeadline:inherited,unused:'PRIVATE EXTRA'};
  const query={keyword:'CAT301'};
  const calls:unknown[]=[];
  let release!:()=>void,started!:()=>void;
  const gate=new Promise<void>(resolve=>{release=resolve;}),begun=new Promise<void>(resolve=>{started=resolve;});
  const capture=(selected:SyllabusAccount)=>({
    keys:Object.keys(selected).sort(),user:{...selected.user},url:selected.url,key:selected.key,token:selected.token,requestDeadline:selected.requestDeadline,
  });
  const pending=readCatalogEvidence(caller,{query,deadline:Date.now()+10000},{
    search:async(selected,filters)=>{calls.push({kind:'search',caller:capture(selected),filters:{...filters}});started();await gate;return page();},
    detail:async(selected,selectedId)=>{calls.push({kind:'detail',caller:capture(selected),id:selectedId});return {row:offering()};},
  });
  // This runs before Promise.then invokes even the first dependency.
  caller.user.id='10000000-0000-4000-8000-000000000002';caller.token='FOREIGN TOKEN';caller.key='FOREIGN KEY';caller.url='https://foreign.invalid';caller.requestDeadline=0;query.keyword='Other course';
  await begun;
  caller.user={id:'10000000-0000-4000-8000-000000000003',email:'different@example.invalid'};
  release();
  const result=await pending;
  const captured={keys:['key','requestDeadline','token','url','user'],user:{id:originalUser},url:account.url,key:account.key,token:account.token,requestDeadline:inherited};
  assert.equal(result.readState,'ok');
  assert.deepEqual(calls,[{kind:'search',caller:captured,filters:{search_scope:'historical',page_size:'20',keyword:'CAT301'}},{kind:'detail',caller:captured,id}]);
  assert.equal(content(result).selection.query.keyword,'CAT301');
  assert.doesNotMatch(JSON.stringify(result),/FOREIGN|PRIVATE EXTRA|private-extra|different@example/);
});

test('registered read-only module requires the published syllabus migration',()=>{
  assert.deepEqual(catalogEvidenceRequirements,{migration:'20261112170000',mounted:true,readOnly:true});
  assert.equal(catalogEvidenceMaxBytes,18000);
});

test('catalog intent recognizes exact routes and follow-ups without substituting personal courses',()=>{
  for(const question of ['Show the course catalog','What courses are available?','Explain the CAT301 syllabus','查詢課程大綱'])assert.equal(isCatalogEvidenceQuestion(question),true);
  assert.equal(isCatalogEvidenceQuestion('Who teaches this?',route+'?course='+id),true);
  assert.equal(isCatalogEvidenceQuestion('What about its prerequisites?','/',[{role:'user',content:'Show CAT301 syllabus'}]),true);
  for(const question of ['What are my grades?','What is my next class?','Show my enrolled courses','我的課表'])assert.equal(isCatalogEvidenceQuestion(question,route),false);
  assert.equal(isCatalogEvidenceQuestion('Who teaches this?','/dtm'),false);
});

test('exact local course and syllabus IDs are retained before route normalization',async()=>{
  for(const key of ['course','syllabus']){
    const result=await readCatalogEvidence(account,{route:route+'?yr=1151&dep=IM&'+key+'='+id,question:'Explain this offering.',deadline:deadline()},
      {search:async()=>{throw new Error('No search for an exact ID.');},detail:async(bounded,selected)=>{assert.equal(selected,id);assert.equal(bounded.token,account.token);assert.ok(bounded.requestDeadline!<=deadline());return {row:offering()};}});
    assert.equal(result.readState,'ok');assert.equal(result.reason,null);assert.equal(result.evidence.url,route+'?'+key+'='+id);
    const data=content(result);assert.equal(data.rows[0].id,id);assert.equal(data.rows[0].room1,'C301');assert.equal(data.rows[0].syllabus.grading[1].weight,null);
    assert.deepEqual(data.provenance,{source:'published_local_sample_catalog',sourceMode:'sample',officialUniversityData:false,enrollmentEvidence:false});
    assert.match(data.rules,/No enrollment/);assert.doesNotMatch(JSON.stringify(result),/synthetic-caller-token|synthetic-key/);
  }
});

test('the complete syllabus-page detail URL retains the exact ID and validated originating filters',async()=>{
  // Exact URL contract emitted by syllabusSearchRouteParams, including all
  // seven keys. The displayed detail is independently selected by syllabus ID.
  const localRoute='/school-affairs/services/12-3?search_scope=historical&keyword=CAT301&term=1151&department=IM&themes=1%2C26&searched=1&syllabus='+id;
  let searches=0,details=0;
  const result=await readCatalogEvidence(account,{route:localRoute,query:{id},question:'Explain this syllabus.',deadline:deadline()},{
    search:async()=>{searches++;return page();},
    detail:async(_account,selected)=>{details++;assert.equal(selected,id);return {row:offering()};},
  });
  assert.equal(result.readState,'ok');assert.equal(searches,0);assert.equal(details,1);
  const data=content(result);
  assert.equal(data.selection.id,id);assert.equal(data.selection.filters,null);
  assert.deepEqual(data.selection.routeContext,{path:'/school-affairs/services/12-3',searched:true,
    filters:{scope:'historical',keyword:'CAT301',term:'1151',department:'IM',themes:[1,26]}});
  assert.equal(result.evidence.url,route+'?syllabus='+id);assert.equal(data.rows[0].id,id);
  assert.match(data.rules,/does not establish that the offering matches those filters/);
});

test('syllabus search URL filters survive nonconflicting structured pagination and sort selectors',async()=>{
  const localRoute='/school-affairs/services/12-3?search_scope=historical&keyword=CAT301&term=1151&department=IM&themes=1%2C26&searched=1';
  const result=await readCatalogEvidence(account,{route:localRoute,query:{page_size:'10',sort:'instructor'},deadline:deadline()},{
    search:async(_account,query)=>{
      assert.deepEqual(query,{search_scope:'historical',page_size:'10',keyword:'CAT301',term:'1151',department:'IM',themes:'1,26',sort:'instructor'});
      return page({total:0,rows:[],pageSize:10,sort:{key:'instructor',direction:'asc'}});
    },
  });
  assert.equal(result.readState,'empty');assert.equal(result.reason,'no_matching_published_rows');
  assert.deepEqual(content(result).selection.filters,{scope:'historical',keyword:'CAT301',term:'1151',department:'IM',themes:[1,26]});
});

test('a bare syllabus page defaults to current but does not replace an explicit structured scope',async()=>{
  for(const query of [{},{search_scope:'historical' as const}]){
    const scope=query.search_scope??'current';
    const result=await readCatalogEvidence(account,{route:'/school-affairs/services/12-3',query,deadline:deadline()},{
      search:async(_account,selected)=>{
        assert.equal(selected?.search_scope,scope);return page({scope,total:0,rows:[]});
      },
    });
    assert.equal(result.readState,'empty');assert.equal(content(result).selection.filters.scope,scope);
  }
});

test('encoded Unicode syllabus URLs use the client query-length limit without truncating selectors',async()=>{
  const values={search_scope:'historical',keyword:'📖'.repeat(160),term:'📅'.repeat(12),department:'🏫'.repeat(16),themes:'1,26',searched:'1'};
  const params=new URLSearchParams(values);
  assert.ok(params.toString().length>2048&&params.toString().length<3000);
  const result=await readCatalogEvidence(account,{route:'/school-affairs/services/12-3?'+params,deadline:deadline()},{
    search:async(_account,query)=>{
      assert.equal(query?.keyword,values.keyword);assert.equal(query?.term,values.term);assert.equal(query?.department,values.department);
      return page({total:0,rows:[]});
    },
  });
  assert.equal(result.readState,'empty');assert.equal(content(result).selection.filters.keyword,values.keyword);
  let calls=0;
  const oversized=await readCatalogEvidence(account,{route:'/school-affairs/services/12-3?keyword='+ 'x'.repeat(3001),deadline:deadline()},{
    search:async()=>{calls++;return page();},
  });
  assert.equal(oversized.reason,'invalid_selection');assert.equal(calls,0);
});

test('conflicting structured and URL selectors fail before reads instead of dropping either selection',async()=>{
  const localRoute='/school-affairs/services/12-3?search_scope=historical&keyword=CAT301&term=1151&department=IM&themes=1%2C26&searched=1';
  let calls=0;
  for(const query of [{search_scope:'current'},{keyword:'Other course'},{term:'1141'},{department:'CS'},{themes:'2,26'}]){
    const result=await readCatalogEvidence(account,{route:localRoute,query:query as CatalogEvidenceQuery,deadline:deadline()},{
      search:async()=>{calls++;return page();},detail:async()=>{calls++;return {row:offering()};},
    });
    assert.equal(result.readState,'unavailable');assert.equal(result.reason,'ambiguous_selection');
  }
  assert.equal(calls,0);
  const equivalent=await readCatalogEvidence(account,{route:localRoute,query:{keyword:' CAT301 ',themes:'26,1'},deadline:deadline()},{
    search:async(_account,query)=>{
      assert.equal(query?.keyword,' CAT301 ');assert.equal(query?.themes,'26,1');return page({total:0,rows:[]});
    },
  });
  assert.equal(equivalent.readState,'empty');
  assert.deepEqual(content(equivalent).selection.filters.themes,[1,26]);
});

test('malformed syllabus URL filters remain invalid even beside a valid detail ID',async()=>{
  let calls=0;
  const dependencies={search:async()=>{calls++;return page();},detail:async()=>{calls++;return {row:offering()};}};
  const invalid=['searched=0','searched=1&searched=1','search_scope=all','term='+ 'x'.repeat(13),'department='+ 'x'.repeat(17),
    'themes=1%2C1','themes=27','themes=1%2C','keyword=bad%00value','keyword='+ 'x'.repeat(161),
    'page=0','course='+id,'url=https%3A%2F%2Fattacker.invalid','syllabus='+id];
  for(const params of invalid){
    const result=await readCatalogEvidence(account,{route:'/school-affairs/services/12-3?syllabus='+id+'&'+params,deadline:deadline()},dependencies);
    assert.equal(result.readState,'unavailable',params);assert.equal(result.reason,'invalid_selection',params);
  }
  for(const query of [{id:other},{keyword:'CAT301'}]){
    const result=await readCatalogEvidence(account,{route:'/school-affairs/services/12-3?syllabus='+id,query,deadline:deadline()},dependencies);
    assert.equal(result.reason,'ambiguous_selection');
  }
  assert.equal(calls,0);
});

test('legacy route filters are also preserved and unsupported filters cannot hide behind structured queries',async()=>{
  const selected=await readCatalogEvidence(account,{route:route+'?yr=1151&dep=IM',query:{keyword:'CAT301'},deadline:deadline()},{
    search:async(_account,query)=>{
      assert.deepEqual(query,{search_scope:'historical',page_size:'20',term:'1151',department:'IM',keyword:'CAT301'});
      return page({total:0,rows:[]});
    },
  });
  assert.equal(selected.readState,'empty');
  let calls=0;
  for(const input of [
    {route:route+'?yr=1151',query:{term:'1141'}},
    {route:route+'?instructor=Somebody',query:{keyword:'CAT301'}},
    {route:route+'?course='+id+'&instructor=Somebody',query:{id}},
    {route:route+'?yr='+ 'x'.repeat(13)+'&course='+id},
  ]){
    const result=await readCatalogEvidence(account,{...input,deadline:deadline()},{search:async()=>{calls++;return page();},detail:async()=>{calls++;return {row:offering()};}});
    assert.equal(result.readState,'unavailable');assert.ok(['ambiguous_selection','unsupported_filters','invalid_selection'].includes(result.reason!));
  }
  assert.equal(calls,0);
});

test('literal search selectors remain allowlisted and a unique match can load published details',async()=>{
  const query={keyword:'CAT301',term:'1151',department:'IM'};
  const result=await readCatalogEvidence(account,{query,question:'Explain its syllabus.',deadline:deadline()},{search:async(bounded,filters)=>{
    assert.ok(bounded.requestDeadline!>Date.now());assert.deepEqual(filters,{search_scope:'historical',page_size:'20',...query});return page();},detail:async(_account,selected)=>{assert.equal(selected,id);return {row:offering()};}});
  assert.equal(result.readState,'ok');assert.equal(result.evidence.url,route+'?syllabus='+id);assert.equal(content(result).revision,'a'.repeat(32));
  assert.deepEqual(content(result).counts,{total:1,returnedRows:1,includedRows:1,hasMore:false,complete:true});
  assert.deepEqual(query,{keyword:'CAT301',term:'1151',department:'IM'});
});

test('invalid, duplicated, conflicting, prototype and unsupported selectors do not invoke readers',async()=>{
  let calls=0;const dependencies={search:async()=>{calls++;return page();},detail:async()=>{calls++;return {row:offering()};}};
  const inputs=[
    {query:{published:'false'}},{query:{keyword:['one','two']}},{query:{sort:'course_code; drop table x'}},
    {query:{page_size:'51'}},{query:{page:'1001'}},{query:{id:'../private'}},{query:{url:'https://attacker.invalid'}},
    {query:JSON.parse('{"__proto__":{}}')},{query:Object.create({keyword:'hidden'})},
    {route:'https://attacker.invalid/'+id},{route:'//attacker.invalid/'+id},{route:route+'?course='+id+'&course='+id},
    {route:route+'?course='+id+'&syllabus='+other},{route:route+'?course='+id,query:{id:other}},
    {route:route+'?course='+id,query:{keyword:'Another course'}},{route:route+'?student_id=private'},
    {route:route+'?credit=3'},{route:route+'?instructor=Somebody'},{route:route+'?keyword=one&keyword=two'},
  ];
  for(const input of inputs){
    const result=await readCatalogEvidence(account,{...input,deadline:deadline()} as Parameters<typeof readCatalogEvidence>[1],dependencies);
    assert.equal(result.readState,'unavailable',JSON.stringify(input));assert.ok(['invalid_selection','ambiguous_selection','unsupported_filters'].includes(result.reason!));
    assert.equal(content(result).counts.total,null);assert.deepEqual(content(result).rows,[]);
  }
  assert.equal(calls,0);
});

test('unsupported selector fields cannot be smuggled in a supposedly valid query',async()=>{
  let calls=0;
  for(const query of [{keyword:'x'.repeat(161)},{keyword:'bad\0value'},{themes:'27'},{themes:'1,1'},{direction:'ASC'},{term:'x'.repeat(13)}]){
    const result=await readCatalogEvidence(account,{query:query as CatalogEvidenceQuery,deadline:deadline()},{search:async()=>{calls++;return page();}});
    assert.equal(result.readState,'unavailable');assert.equal(result.reason,'invalid_selection');
  }
  assert.equal(calls,0);
});

test('explicit current search uses only the stored current flag and does not invent a term',async()=>{
  const result=await readCatalogEvidence(account,{query:{search_scope:'current'},deadline:deadline()},
    {search:async(_account,query)=>{assert.equal(query?.search_scope,'current');assert.equal(query?.term,undefined);return page({scope:'current',total:0,rows:[]});}});
  assert.equal(result.readState,'empty');assert.equal(result.reason,'no_matching_published_rows');assert.match(content(result).rules,/explicitly stored current flag/);
  assert.deepEqual(content(result).counts,{total:0,returnedRows:0,includedRows:0,hasMore:false,complete:true});
});

test('search pagination and out-of-range pages cannot become whole-catalog absence',async()=>{
  const rows=Array.from({length:20},(_,index)=>({...summary(index+1),id:`20000000-0000-4000-8000-${String(index+1).padStart(12,'0')}`}));
  const partial=await readCatalogEvidence(account,{deadline:deadline()},{search:async()=>page({rows,total:21,hasMore:true})});
  assert.equal(partial.readState,'partial');assert.equal(partial.reason,'paged_results');assert.equal(content(partial).counts.complete,false);assert.equal(content(partial).counts.total,21);
  const beyond=await readCatalogEvidence(account,{query:{page:'2'},deadline:deadline()},{search:async()=>page({rows:[],page:2,total:1})});
  assert.equal(beyond.readState,'partial');assert.equal(beyond.reason,'page_out_of_range');assert.equal(content(beyond).counts.total,1);
});

test('multiple same-code offerings require selection before claiming a single syllabus',async()=>{
  let details=0;
  const result=await readCatalogEvidence(account,{query:{keyword:'CAT301'},question:'What are the objectives in the CAT301 syllabus?',deadline:deadline()},
    {search:async()=>page({rows:[summary(),summary(2)],total:2}),detail:async()=>{details++;return {row:offering()};}});
  assert.equal(result.readState,'partial');assert.equal(result.reason,'ambiguous_selection');assert.equal(content(result).rows.length,2);assert.equal(details,0);
});

test('missing exact published offering remains distinct from a changed search/detail pair',async()=>{
  const missing=await readCatalogEvidence(account,{query:{id},deadline:deadline()},{detail:async()=>({row:null})});
  assert.equal(missing.readState,'empty');assert.equal(missing.reason,'published_offering_not_found');
  const changed=await readCatalogEvidence(account,{query:{keyword:'CAT301'},deadline:deadline()},{search:async()=>page(),detail:async()=>({row:null})});
  assert.equal(changed.readState,'unavailable');assert.equal(changed.reason,'offering_changed_during_read');assert.equal(content(changed).counts.total,1);assert.equal(content(changed).counts.complete,false);
  for(const patch of [{course_name:'Changed course'},{term_code:'1141'},{department_code:'OTHER'}]){
    const result=await readCatalogEvidence(account,{query:{keyword:'CAT301',term:'1151',department:'IM'},deadline:deadline()},
      {search:async()=>page(),detail:async()=>({row:{...offering(),...patch}})});
    assert.equal(result.readState,'unavailable');assert.equal(result.reason,'offering_changed_during_read');
  }
});

test('admin privileges never permit unpublished, foreign-field or malformed detail evidence',async()=>{
  for(const patch of [{published:false},{source_mode:'official'},{student_id:'PRIVATE MARKER'},{id:other},{version:0},{credits:999},{syllabus:{private_note:'PRIVATE MARKER'}}]){
    const result=await readCatalogEvidence({...account,user:{...account.user,email:'admin@example.invalid'}},{query:{id},deadline:deadline()},
      {detail:async()=>({row:{...offering(),...patch}}) as Awaited<ReturnType<NonNullable<NonNullable<Parameters<typeof readCatalogEvidence>[2]>['detail']>>>});
    assert.equal(result.readState,'unavailable');assert.equal(result.reason,'catalog_read_unavailable');assert.equal(content(result).counts.total,null);assert.doesNotMatch(JSON.stringify(result),/PRIVATE MARKER|admin@example/);
  }
});

test('malformed search totals, revisions, duplicate IDs and extra fields fail closed',async()=>{
  for(const patch of [{total:2},{hasMore:true},{revision:'changed'},{private_data:'PRIVATE MARKER'},
    {rows:[{...summary(),secret:'PRIVATE MARKER'}]},{total:2,rows:[summary(),summary()]},{pageSize:100}]){
    const result=await readCatalogEvidence(account,{deadline:deadline()},{search:async()=>({...page(),...patch})});
    assert.equal(result.readState,'unavailable');assert.equal(result.reason,'catalog_read_unavailable');assert.equal(content(result).counts.total,null);assert.doesNotMatch(JSON.stringify(result),/PRIVATE MARKER/);
  }
});

test('large Unicode search results retain truthful counts within the serialized 18KB envelope',async()=>{
  const rows=Array.from({length:50},(_,index)=>({...summary(),id:`20000000-0000-4000-8000-${String(index+1).padStart(12,'0')}`,sequence:index+1,course_name:'課'.repeat(160),admission_name:'班'.repeat(100),instructor:'師'.repeat(100)}));
  const result=await readCatalogEvidence(account,{query:{page_size:'50'},deadline:deadline()},{search:async()=>page({rows,total:50,pageSize:50})});
  const data=content(result);assert.equal(result.readState,'partial');assert.equal(result.reason,'evidence_budget');assert.equal(data.counts.total,50);assert.equal(data.counts.returnedRows,50);
  assert.ok(data.counts.includedRows>0&&data.counts.includedRows<50);assert.equal(data.rows.length,data.counts.includedRows);assert.ok(Buffer.byteLength(JSON.stringify(result),'utf8')<=18000);
  assert.ok(data.rows.every((row:{course_name:string})=>row.course_name==='課'.repeat(160)),'Whole fields, not truncated strings.');
});

test('large syllabi preserve null grading weights and explicitly list omitted whole fields',async()=>{
  const row=offering();row.description='說'.repeat(2000);row.syllabus.objectives='目'.repeat(1600);row.syllabus.materials='材'.repeat(1200);row.syllabus.references='參'.repeat(1200);row.syllabus.advice='建'.repeat(1200);
  const before=JSON.stringify(row);
  const result=await readCatalogEvidence(account,{query:{id},question:'Explain the syllabus grading weights.',deadline:deadline()},{detail:async()=>({row})});
  const data=content(result);assert.equal(result.readState,'partial');assert.equal(result.reason,'evidence_budget');assert.ok(data.omittedFields.length>0);
  assert.equal(data.rows[0].id,id);assert.equal(data.rows[0].syllabus.grading[0].weight,25);assert.equal(data.rows[0].syllabus.grading[1].weight,null);
  assert.ok(Buffer.byteLength(JSON.stringify(result),'utf8')<=18000);assert.equal(JSON.stringify(row),before);assert.equal(data.counts.complete,false);
});

test('deadline and authorization failures occur before reads; provider failures do not become empty',async()=>{
  let calls=0;const dependencies={search:async()=>{calls++;throw new Error('PRIVATE PROVIDER BODY');},detail:async()=>{calls++;return {row:offering()};}};
  for(const bad of [{...account,token:''},{...account,url:'https://attacker.invalid'},{...account,url:account.url+'.evil.invalid'}]){
    const result=await readCatalogEvidence(bad,{deadline:deadline()},dependencies);assert.equal(result.reason,'authorization_required');
  }
  const expired=await readCatalogEvidence(account,{deadline:Date.now()-1},dependencies);assert.equal(expired.reason,'deadline_exceeded');assert.equal(calls,0);
  for(const requestDeadline of [Number.NaN,Infinity,Date.now()-1]){
    const bounded=await readCatalogEvidence({...account,requestDeadline},{deadline:deadline()},dependencies);
    assert.equal(bounded.reason,'deadline_exceeded');assert.equal(calls,0);
  }
  const failed=await readCatalogEvidence(account,{deadline:deadline()},dependencies);assert.equal(failed.readState,'unavailable');assert.equal(failed.reason,'catalog_read_unavailable');assert.equal(content(failed).counts.total,null);assert.doesNotMatch(JSON.stringify(failed),/PRIVATE PROVIDER BODY/);
});

test('a never-resolving search is bounded by the caller deadline', {timeout:2000}, async()=>{
  let searches=0,details=0;
  const result=await readCatalogEvidence(account,{deadline:Date.now()+40},{
    search:()=>{searches++;return new Promise(()=>{});},
    detail:async()=>{details++;return {row:offering()};},
  });
  assert.equal(searches,1);assert.equal(details,0);assert.equal(result.readState,'unavailable');assert.equal(result.reason,'deadline_exceeded');
  assert.equal(content(result).counts.total,null);assert.deepEqual(content(result).rows,[]);
});

test('a never-resolving exact detail respects the earlier inherited deadline', {timeout:2000}, async()=>{
  const inherited=Date.now()+40;
  let details=0;
  const result=await readCatalogEvidence({...account,requestDeadline:inherited},{query:{id},deadline:Date.now()+5000},{
    detail:bounded=>{details++;assert.equal(bounded.requestDeadline,inherited);return new Promise(()=>{});},
  });
  assert.equal(details,1);assert.equal(result.readState,'unavailable');assert.equal(result.reason,'deadline_exceeded');assert.equal(content(result).counts.total,null);
});

test('read deadline timers are cleared after success and synchronous failure',async context=>{
  const originalSetTimeout=globalThis.setTimeout,originalClearTimeout=globalThis.clearTimeout;
  const scheduled=new Set<unknown>(),cleared=new Set<unknown>();
  context.mock.method(globalThis,'setTimeout',(...args:Parameters<typeof setTimeout>)=>{
    const timer=originalSetTimeout(...args);scheduled.add(timer);return timer;
  });
  context.mock.method(globalThis,'clearTimeout',(...args:Parameters<typeof clearTimeout>)=>{
    cleared.add(args[0]);return originalClearTimeout(...args);
  });
  const success=await readCatalogEvidence(account,{deadline:deadline()},{search:async()=>page(),detail:async()=>({row:offering()})});
  assert.equal(success.readState,'ok');assert.equal(scheduled.size,2);
  const failed=await readCatalogEvidence(account,{query:{id},deadline:deadline()},{detail:()=>{throw new Error('Synthetic synchronous failure');}});
  assert.equal(failed.readState,'unavailable');assert.equal(scheduled.size,3);
  assert.ok([...scheduled].every(timer=>cleared.has(timer)));
});

test('default transport invokes only published read RPCs with caller token and redirect protection',async()=>{
  const prior=globalThis.fetch,calls:string[]=[];
  globalThis.fetch=async(input,init)=>{
    const url=String(input);calls.push(url);assert.equal(init?.method,'POST');assert.equal(init?.redirect,'error');assert.equal(new Headers(init?.headers).get('authorization'),'Bearer '+account.token);assert.ok(init?.signal);
    if(url===account.url+'/rest/v1/rpc/affairs_syllabus_search')return Response.json(page());
    assert.equal(url,account.url+'/rest/v1/rpc/affairs_syllabus_detail');assert.deepEqual(JSON.parse(String(init?.body)),{p_id:id});return Response.json({row:offering()});
  };
  try{const result=await readCatalogEvidence(account,{query:{keyword:'CAT301'},deadline:deadline()});assert.equal(result.readState,'ok');assert.equal(calls.length,2);assert.ok(calls.every(url=>!url.includes('catalog_search')&&!url.includes('manage')));}
  finally{globalThis.fetch=prior;}
  const sql=await readFile('supabase/migrations/20261112170000_syllabus_search.sql','utf8');assert.match(sql,/c\.published is true/);assert.match(sql,/where id=p_id and published is true/);
});
