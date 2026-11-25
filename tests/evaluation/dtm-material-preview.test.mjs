import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createAffairsAssistantHandler} from '../../api/affairs-assistant.ts';
import {buildDtmMaterialCases} from './dtm-material-cases.mjs';
import {assertDtmMaterialPreviewRows,buildDtmMaterialPreviewPlan,dtmMaterialCaseScope,dtmMaterialPreviewCases,
  dtmMaterialPreviewGaps,dtmMaterialPreviewMode,dtmMaterialPreviewRequest,dtmMaterialPreviewRows,gradeDtmMaterialPreviewCase,
  readDtmMaterialPreviewCallers} from './dtm-material-preview.mjs';
import {prepare} from './live-fixtures.mjs';
import {readReply} from './run.mjs';

const project='https://xiftudmvxphxcjtmfmib.supabase.co';
const origin='https://stdedu-abc123def-v1-d286.vercel.app';
const users=['A','B'].map((label,index)=>({id:'c0100000-0000-4000-8000-00000000000'+(index+1),token:'caller-'+label}));
const plan=buildDtmMaterialPreviewPlan(users);
const revision='a'.repeat(40);

async function readResponse(response,url,maxBytes,status=200){
  assert.equal(response.status,status,url.pathname);
  const text=await response.text();
  assert.ok(Buffer.byteLength(text)<=maxBytes);
  return JSON.parse(text);
}

function transports(scope,{crossStatus=403,foreignError,leak=false}={}){
  const {courses,materials}=dtmMaterialPreviewRows(plan,scope.variant);
  const paths=[];
  function caller(headers){
    const value=new Headers(headers).get('authorization');
    const index=users.findIndex(user=>value==='Bearer '+user.token);
    assert.ok(index>=0);
    return index;
  }
  const reads=async(target,init)=>{
    const index=caller(init.headers);
    assert.equal(init.method,'GET');
    assert.equal(init.redirect,'error');
    assert.equal(init.credentials,'omit');
    paths.push([target.origin,index,target.pathname]);
    if(target.origin===project){
      assert.equal(new Headers(init.headers).get('apikey'),'public key sentinel');
      assert.equal(target.searchParams.get('course_id'),'in.('+plan.courseIds.join(',')+')');
      const rows=leak?materials:materials.filter(row=>row.course_id===plan.courseIds[index]);
      return Response.json(rows);
    }
    assert.equal(target.origin,origin);
    const course=courses.find(row=>row.id===target.searchParams.get('course_id'));
    const selected=target.searchParams.get('scope');
    assert.equal(selected,scope.view==='detail'?'dtm-course-resource':'dtm-course-content');
    const details=selected==='dtm-course-resource';
    if(course.user_id!==users[index].id)return Response.json({error:foreignError??(details
      ?'This course resource is not available to your account.':'This course content is not available to your account.')},{status:crossStatus});
    const summary={id:course.id,userId:course.user_id,title:course.title,code:course.code,term:course.term};
    const owned=materials.filter(row=>row.course_id===course.id);
    if(details){
      const row=owned.find(item=>item.id===target.searchParams.get('material_id'));
      return Response.json({course:{...summary,sourceMode:course.source_mode},material:row?{
        id:row.id,userId:course.user_id,courseId:course.id,title:row.title,kind:row.kind,summary:row.summary,
        position:row.position,sourceMode:row.source_mode,sourceUrl:row.source_url,targetUrl:row.target_url,
      }:null});
    }
    return Response.json({course:summary,total:owned.length,content:null,limit:100,nextCursor:null,
      revision:'2'.repeat(64),unavailableReferenceCount:0,activities:owned.map(row=>({kind:'material',id:row.id,
        title:row.title,materialKind:row.kind,summary:row.summary,position:row.position,sourceMode:row.source_mode,sourceUrl:row.source_url}))});
  };
  return {paths,previewFetch:reads,projectFetch:reads,origin,projectUrl:project,publishable:'public key sentinel',readResponse};
}

test('mounts the unchanged 11 case bank and keeps the simulated outage controlled',()=>{
  const frozen=buildDtmMaterialCases();
  const mounted=dtmMaterialPreviewCases();
  assert.equal(mounted.length,11);
  assert.deepEqual(mounted.map(({executionContract:_executionContract,...row})=>row),frozen.filter(row=>!row.id.endsWith('-unavailable')));
  assert.deepEqual(dtmMaterialPreviewGaps.map(row=>row.id),frozen.filter(row=>row.id.endsWith('-unavailable')).map(row=>row.id));
  assert.throws(()=>dtmMaterialPreviewRequest({...mounted[0],question:'Changed question'}),/unchanged mounted case/);
  assert.throws(()=>buildDtmMaterialPreviewPlan([users[0],users[0]]),/distinct disposable owners/);
});

test('wrong Preview origin or a caller-selected question is rejected before fixture setup',async()=>{
  const common={runId:'c0100000-0000-4000-8000-0000000000ff',cases:[],now:'2026-11-15T00:00:00Z',
    origin,approvedPreviewOrigin:origin,expectedReleaseRevision:revision,fixtureMode:dtmMaterialPreviewMode,
    previewReadbackFetch:()=>assert.fail('A rejected configuration cannot dispatch')};
  await assert.rejects(prepare({...common,origin:'https://stu.best'}),/exact protected Preview/);
  await assert.rejects(prepare({...common,cases:[dtmMaterialPreviewCases()[0]]}),/exact protected Preview/);
});

test('SQL oracles reject changed metadata, another owner, or extra rows',()=>{
  for(const variant of ['baseline','no-link','missing','list-partial']){
    const rows=dtmMaterialPreviewRows(plan,variant);
    assert.match(assertDtmMaterialPreviewRows(plan,variant,rows),/^[a-f0-9]{64}$/);
    const changed=structuredClone(rows);
    changed.courses[0].user_id=users[1].id;
    assert.throws(()=>assertDtmMaterialPreviewRows(plan,variant,changed),/isolated fixture/);
    changed.courses[0].user_id=users[0].id;
    changed.materials.push(rows.materials[0]);
    assert.throws(()=>assertDtmMaterialPreviewRows(plan,variant,changed),/isolated fixture/);
  }
});

test('two caller readbacks require both native app crossed denials and a shared-ID RLS query',async()=>{
  const scope={variant:'list-partial',view:'list'};
  const transport=transports(scope);
  const proofs=await readDtmMaterialPreviewCallers(plan,scope,users,transport);
  assert.deepEqual(proofs.map(({count,crossedDenied})=>[count,crossedDenied]),[[13,true],[1,true]]);
  assert.equal(transport.paths.filter(([host])=>host===project).length,2);
  assert.equal(transport.paths.filter(([host])=>host===origin).length,4);
  for(const bad of [{crossStatus:200},{foreignError:'Deployment protection'},{leak:true}])
    await assert.rejects(readDtmMaterialPreviewCallers(plan,scope,users,transports(scope,bad)));
  await assert.rejects(readDtmMaterialPreviewCallers(plan,scope,[users[0],{...users[1],token:users[0].token}],transport));
});

test('all mounted frozen questions grade actual streamed handler answers against both readbacks',async t=>{
  let selected;
  let readCount=0;
  const requests=[];
  t.mock.method(globalThis,'fetch',async (input,init)=>{
    const url=new URL(String(input));
    assert.equal(url.origin,project,'A fixture material URL, web, or model must never be fetched.');
    assert.equal(new Headers(init.headers).get('authorization'),'Bearer '+users[0].token);
    readCount++;
    if(url.pathname.endsWith('/rpc/dtm_course_content_access'))
      return Response.json({userId:users[0].id,canManage:false});
    const {courses,materials}=dtmMaterialPreviewRows(plan,selected.variant);
    const {role,...course}=courses[0];
    assert.equal(role,'student');
    assert.equal(url.pathname,'/rest/v1/dtm_courses');
    assert.equal(url.searchParams.get('id'),'eq.'+course.id);
    assert.equal(url.searchParams.get('user_id'),'eq.'+course.user_id);
    const owned=materials.filter(row=>row.course_id===course.id);
    if(url.searchParams.has('dtm_materials.id'))
      return Response.json([{...course,dtm_materials:owned.filter(row=>'eq.'+row.id===url.searchParams.get('dtm_materials.id'))}]);
    return Response.json([{id:course.id,user_id:course.user_id,dtm_materials:owned.map(({summary:_summary,source_url:_source,target_url:_target,...row})=>row)}]);
  });
  const handler=createAffairsAssistantHandler({
    verifyToken:async value=>{
      assert.equal(value,users[0].token);
      return {url:project,key:'public key sentinel',token:value,user:{id:users[0].id}};
    },
    loadSnapshot:()=>assert.fail('Unrelated record collections are outside this packet.'),
    publicResearch:()=>assert.fail('Public research is outside this packet.'),
  });
  for(const [index,testCase] of dtmMaterialPreviewCases().entries()){
    selected=dtmMaterialCaseScope(testCase);
    const rows=dtmMaterialPreviewRows(plan,selected.variant);
    const observation={sqlSha256:assertDtmMaterialPreviewRows(plan,selected.variant,rows),
      callers:await readDtmMaterialPreviewCallers(plan,selected,users,transports(selected))};
    const request=dtmMaterialPreviewRequest(testCase),headers=new Headers(),chunks=[];
    const before=readCount;
    let status=0;
    const response={status(code){status=code;return this;},setHeader(key,value){headers.set(key,value);},write(chunk){chunks.push(chunk);},
      end(){},json(){assert.fail('This packet must stream real Activity.');}};
    await handler({method:'POST',headers:{authorization:'Bearer '+users[0].token},body:JSON.parse(request.body)},response);
    const wire=await readReply(new Response(chunks.join(''),{status,headers}));
    const envelope={...wire,statusCode:status,fixtureKey:testCase.fixtureKey,execution:'live-native',sourceRevision:revision,
      correlationId:headers.get('x-assistant-request-id'),
      deploymentCheck:{verified:true,sourceRevision:revision,requestIndex:index+1},
      materialDispatch:{endpoint:request.path,bodySha256:request.bodySha256}};
    const graded=gradeDtmMaterialPreviewCase(testCase,envelope,{before:observation,after:observation,
      deniedMarkers:users.flatMap(user=>[user.id,user.token])});
    assert.deepEqual(graded.failedChecks,[],testCase.id);
    assert.equal(graded.passed,true,testCase.id);
    assert.equal(readCount-before,testCase.coveredTools.length?selected.view==='list'?1:2:0,testCase.id);
    assert.doesNotMatch(JSON.stringify(graded),/Circuit worksheet|FOREIGN_ITEM|caller-A|\/hidden-destination/);
    requests.push(envelope);
  }
  const testCase=dtmMaterialPreviewCases()[0],scope=dtmMaterialCaseScope(testCase);
  const observation={sqlSha256:assertDtmMaterialPreviewRows(plan,scope.variant,dtmMaterialPreviewRows(plan,scope.variant)),
    callers:await readDtmMaterialPreviewCallers(plan,scope,users,transports(scope))};
  const drift=structuredClone(observation);
  drift.callers[1].rlsSha256='0'.repeat(64);
  const bad=structuredClone(requests[0]);
  bad.body.answer+=' https://example.com/hidden-destination';
  bad.materialDispatch.bodySha256='0'.repeat(64);
  assert.deepEqual(gradeDtmMaterialPreviewCase(testCase,bad,{before:observation,after:drift}).failedChecks.filter(id=>id.startsWith('dtm-material.')),
    ['dtm-material.request','dtm-material.unchanged-readback','dtm-material.no-private-destination']);
  assert.equal(new Set(requests.map(item=>item.correlationId)).size,requests.length);
});
