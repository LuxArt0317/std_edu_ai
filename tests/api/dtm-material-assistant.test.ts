import assert from 'node:assert/strict';
import test,{type TestContext} from 'node:test';
import {createAffairsAssistantHandler} from '../../api/affairs-assistant.ts';
import {createResearchAssistantHandler} from '../../server/researchAssistantHandler.js';

const owner='c0100000-0000-4000-8000-000000000001';
const course='c0100000-0000-4000-8000-000000000010';
const material='c0100000-0000-4000-8000-000000000020';
const other='c0100000-0000-4000-8000-000000000099';
const base='/dtm/course/'+course,detail=base+'/material/'+material;
const url='https://xiftudmvxphxcjtmfmib.supabase.co';
const safeCourse={id:course,user_id:owner,title:'Fixture course',code:'DTMTEST',term:'2026',source_mode:'sample'};
const safeMaterial={id:material,course_id:course,title:'Circuit worksheet',kind:'file',summary:'Three practice diagrams.',position:1,source_mode:'personal',source_url:'https://dtm.stu.edu.tw/mod/url/view.php?id=87',target_url:'https://files.stu.edu.tw/a?private=hidden-destination'};
const listItem={id:material,course_id:course,title:'Circuit worksheet',kind:'file',position:1,source_mode:'personal'};

function handler() {
  return createAffairsAssistantHandler({
    verifyToken:async token=>{
      assert.equal(token,'test-user');
      return {url,token,key:'test-public',user:{id:owner}};
    },
    loadSnapshot:async()=>{throw Error('Unrelated snapshot call');},
    publicResearch:async()=>{throw Error('Unrelated research call');},
  });
}
async function dispatch(handle:any,question:string,route:string,images?:unknown[]) {
  let status=0,body:any;
  const response={status(code:number){status=code;return response;},json(value:unknown){body=value;},setHeader(){}};
  await handle({method:'POST',headers:{authorization:'Bearer test-user','x-forwarded-for':'192.0.2.41'},body:{question,route,images}},response);
  assert.equal(status,200);
  return body;
}
function transport(t:TestContext,resolve:(record:URL,index:number)=>Response) {
  const original=globalThis.fetch,calls:URL[]=[];
  globalThis.fetch=async (request,init)=>{
    const req=new URL(String(request));
    assert.equal(req.origin,url);
    assert.equal((init?.headers as Record<string,string>).Authorization,'Bearer test-user');
    calls.push(req);
    return resolve(req,calls.length);
  };
  t.after(()=>{globalThis.fetch=original;});
  return calls;
}

test('exact material answers the saved description and link availability without forwarding destination, model or assignments',async t=>{
  const calls=transport(t,request=>request.pathname.endsWith('/rpc/dtm_course_content_access')
    ?Response.json({userId:owner,canManage:false}):Response.json([{...safeCourse,dtm_materials:[safeMaterial]}]));
  const result=await dispatch(handler(),'What is this material about and where is its link?',detail);
  assert.equal(result.verification.status,'verified');
  assert.match(result.answer,/Circuit worksheet|Three practice diagrams/);
  assert.match(result.answer,/Three practice diagrams/);
  assert.match(result.answer,/saved link is available/);
  assert.equal(result.citations[0].url,detail);
  assert.doesNotMatch(JSON.stringify(result),/hidden-destination|test-user|mod\/url/);
  assert.equal(calls.length,2);
  assert.equal(calls[1].searchParams.get('id'),'eq.'+course);
  assert.equal(calls[1].searchParams.get('user_id'),'eq.'+owner);
  assert.equal(calls[1].searchParams.get('dtm_materials.id'),'eq.'+material);
});

test('the overview and materials page list only saved teaching materials with exact verified detail links',async t=>{
  const calls=transport(t,()=>Response.json([{id:course,user_id:owner,dtm_materials:[listItem]}]));
  for(const route of [base,base+'/materials']){
    const result=await dispatch(handler(),'這門課有哪些已儲存教材？',route);
    assert.equal(result.verification.status,'verified');
    assert.match(result.answer,/Circuit worksheet/);
    assert.ok(result.answer.includes(detail));
    assert.equal(result.citations[0].url,base+'/materials');
  }
  assert.equal(calls.length,2);
  for(const req of calls){
    assert.equal(req.searchParams.get('dtm_materials.limit'),'13');
    assert.equal(req.searchParams.get('id'),'eq.'+course);
    assert.equal(req.searchParams.get('user_id'),'eq.'+owner);
    assert.doesNotMatch(req.searchParams.get('select')!,/summary|assignments|target_url/);
  }
});

test('one failed exact read is retried and a linked file description is never treated as file contents',async t=>{
  const calls=transport(t,request=>request.pathname.endsWith('/rpc/dtm_course_content_access')
    ?Response.json({userId:owner,canManage:false})
    :calls.length===2?new Response(null,{status:503}):Response.json([{...safeCourse,dtm_materials:[{...safeMaterial,target_url:null}]}]));
  const result=await dispatch(handler(),'Can you download this material and tell me the link?',detail);
  assert.equal(result.verification.status,'verified');
  assert.equal(result.verification.attempts,2);
  assert.match(result.answer,/no saved destination link/);
  assert.match(result.answer,/haven’t opened or downloaded/);
  assert.deepEqual(result.activity.filter((step:any)=>step.kind.startsWith('account-read:dtmMaterials')).map((step:any)=>step.status),['unavailable','complete']);
  assert.equal(calls.length,4);
});

test('crossed and unavailable records are withheld after two reads without relabelling as empty',async t=>{
  const calls=transport(t,request=>request.pathname.endsWith('/rpc/dtm_course_content_access')
    ?Response.json({userId:owner,canManage:false})
    :Response.json([{...safeCourse,user_id:other,dtm_materials:[{...safeMaterial,title:'FOREIGN_ITEM'}]}]));
  const result=await dispatch(handler(),'Show this material.',detail);
  assert.equal(result.verification.status,'unverified');
  assert.equal(result.verification.attempts,2);
  assert.deepEqual(result.citations,[]);
  assert.doesNotMatch(result.answer,/FOREIGN_ITEM|no saved resource/);
  assert.equal(calls.length,4);
});

test('explicit no-match and bounded large materials lists remain different verified results',async t=>{
  const calls=transport(t,request=>request.pathname.endsWith('/rpc/dtm_course_content_access')
    ?Response.json({userId:owner,canManage:false})
    :request.searchParams.has('dtm_materials.id')?Response.json([{...safeCourse,dtm_materials:[]}])
    :Response.json([{id:course,user_id:owner,dtm_materials:Array.from({length:13},(_,index)=>({
      ...listItem,id:'c0200000-0000-4000-8000-'+String(index).padStart(12,'0'),position:index+1,title:'Item '+(index+1),
    }))}]));
  const empty=await dispatch(handler(),'What is this material?',detail);
  assert.match(empty.answer,/no saved resource at this exact/);
  assert.equal(empty.verification.status,'verified');
  const partial=await dispatch(handler(),'List my course materials.',base+'/materials');
  assert.match(partial.answer,/partial list/);
  assert.match(partial.answer,/Item 12/);
  assert.doesNotMatch(partial.answer,/Item 13/);
  assert.equal(partial.verification.status,'verified');
  assert.equal(calls.length,3);
});

test('guest entry, exclusion, named ambiguity and attempts to see or edit another record make no calls',async t=>{
  const calls=transport(t,()=>{throw Error('No outbound requests expected');});
  const guest=createResearchAssistantHandler();
  const signedIn=handler();
  const guestReply=await dispatch(guest,'Show this Moodle material.',detail);
  assert.equal(guestReply.citations[0].url,'/dtm/login?next='+encodeURIComponent(detail));
  for(const [question,fragment] of [
    ["Show Alice’s Moodle material.","your own account"],
    ["Don't show this material.","skipped"],
    ['Replace this Moodle material.','manage saved materials'],
    ['Show the material named Walkthrough.','the exact material'],
    ['Show this material for course OTHER501.','the exact material'],
  ]){
    const result=await dispatch(signedIn,question,detail);
    assert.ok(result.answer.includes(fragment),question);
    if(fragment==='your own account'||fragment==='skipped')assert.deepEqual(result.citations,[]);
  }
  assert.equal(calls.length,0);
});

test('explicit exclusions, contextual details and compound non-material subjects are handled without disclosure',async t=>{
  const calls=transport(t,request=>request.pathname.endsWith('/rpc/dtm_course_content_access')
    ?Response.json({userId:owner,canManage:false}):Response.json([{...safeCourse,dtm_materials:[safeMaterial]}]));
  const api=handler();
  for(const [question,omitted] of [
    ['Show this file, but do not include the summary.','Three practice diagrams'],
    ['Show this resource, but do not show its destination link.','saved link is available'],
  ]){
    const result=await dispatch(api,question,detail);
    assert.equal(result.verification.status,'verified');
    assert.ok(!result.answer.includes(omitted));
  }
  assert.match((await dispatch(api,'What is the URL?',detail)).answer,/saved link is available/);
  assert.match((await dispatch(api,'What are the contents?',detail)).answer,/haven’t opened or downloaded/);
  assert.match((await dispatch(api,'Show course materials and assignments.',detail)).answer,/Ask the other part separately/);
  assert.equal(calls.length,10);
  for(const question of ["Show Alex’s file.",'顯示王小明的教材。','Show the saved course materials for Alice.']){
    const result=await dispatch(api,question,detail);
    assert.equal(result.status,'handoff',question);
    assert.deepEqual(result.citations,[]);
  }
  assert.equal(calls.length,10);
});

test('a material lookup failure preserves an independently verified fee balance and its exact reader',async t=>{
  const calls=transport(t,request=>{
    if(request.pathname.endsWith('/affairs_students'))return Response.json([{id:other,user_id:owner}]);
    if(request.pathname.endsWith('/affairs_charges'))return Response.json([{id:material,student_id:other,label:'Fixture tuition',amount_due:28000,amount_paid:5000,currency:'TWD'}]);
    return new Response(null,{status:503});
  });
  const api=createAffairsAssistantHandler({
    verifyToken:async token=>({url,token,key:'test-public',user:{id:owner}}),
    loadSnapshot:async()=>{throw Error('Unrelated snapshot call');},
    answerAccount:async options=>{
      assert.equal(options.question,'what is my remaining balance');
      assert.equal(options.snapshot.charges[0].amountDue-options.snapshot.charges[0].amountPaid,23000);
      return {status:'answered',answer:'Your remaining balance is NT$23,000.',citations:[{title:'Pending payments',url:'/school-affairs/services/39-1'}],
        grounding:{source:'account',webSearched:false},verification:{status:'verified',attempts:1}};
    },
  });
  const result=await dispatch(api,'Show this material and what is my remaining balance?',detail);
  assert.equal(result.status,'answered');
  assert.equal(result.verification.status,'unverified');
  assert.match(result.answer,/could not verify/);
  assert.match(result.answer,/NT\$23,000/);
  assert.deepEqual(result.citations.map((item:any)=>item.url),['/school-affairs/services/39-1']);
  assert.deepEqual(calls.map(req=>req.pathname.split('/').at(-1)).sort(),['affairs_charges','affairs_students','dtm_course_content_access','dtm_course_content_access']);
});

test('each registered material evaluation case grades an actual caller-scoped handler response',async t=>{
  const {buildDtmMaterialCases,dtmMaterialCasePrefix}=await import(new URL('../evaluation/dtm-material-cases.mjs',import.meta.url).href);
  const {gradeCase}=await import(new URL('../evaluation/grading.mjs',import.meta.url).href);
  const now=Date.now;
  t.mock.method(Date,'now',()=>now()+70_000);
  let mode='';
  const calls=transport(t,request=>{
    if(mode==='unavailable')return new Response(null,{status:503});
    if(request.pathname.endsWith('/rpc/dtm_course_content_access'))return Response.json({userId:owner,canManage:false});
    if(request.searchParams.has('dtm_materials.id'))return Response.json([{...safeCourse,dtm_materials:mode==='missing'?[]:[{...safeMaterial,
      target_url:mode==='no-link'?null:safeMaterial.target_url}]}]);
    const materials=mode==='list-partial'?Array.from({length:13},(_,index)=>({
      ...listItem,id:'c0200000-0000-4000-8000-'+String(index).padStart(12,'0'),position:index+1,title:'Item '+(index+1),
    })):[listItem];
    return Response.json([{id:course,user_id:owner,dtm_materials:materials}]);
  });
  for(const testCase of buildDtmMaterialCases()){
    mode=testCase.id.slice(dtmMaterialCasePrefix.length);
    const before=calls.length;
    const body=await dispatch(handler(),testCase.question,testCase.route);
    const result=gradeCase(testCase,{statusCode:200,body,events:[],fixtureKey:testCase.fixtureKey,execution:'deterministic'});
    assert.deepEqual(result.failures,[],mode);
    assert.equal(result.passed,true,mode);
    if(!testCase.coveredTools.length)assert.equal(calls.length,before);
  }
});
