import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {test} from 'node:test';
import {buildDtmTimingPlan,dtmTimingPreviewCases,dtmTimingRequest,gradeDtmTimingCase,observeDtmTimingCallers} from './dtm-submission-timing-preview.mjs';

const makePlan=()=>buildDtmTimingPlan(randomUUID(),Array.from({length:2},()=>({id:randomUUID(),studentId:randomUUID()})));
const origin='https://stdedu-abcdef123-v1-d286.vercel.app';
const fixedDigest='b'.repeat(64),observed={rows:'a'.repeat(64),callers:[{own:2,crossed:1,digest:fixedDigest},{own:1,crossed:2,digest:fixedDigest}]};

test('the disposable packet covers current revision vs edited due, a missing saved date, exact follow-up and both trust boundaries',()=>{
  const plan=makePlan(),cases=dtmTimingPreviewCases(plan);
  assert.equal(new Set(cases.map(row=>row.id)).size,6);
  assert.deepEqual(cases.map(row=>row.actor),['A','B','A','A','B','guest']);
  assert.notEqual(plan.assignments[0].due_at,plan.submissions[0].due_at_at_submission);
  assert.equal(plan.submissions[2].due_at_at_submission,null);
  assert.equal(cases[0].path,cases[3].path);
  assert.equal(cases[3].history[0].content,cases[0].question);
  assert.equal(dtmTimingRequest(cases[0]).path,'/api/affairs-assistant');
  assert.equal(dtmTimingRequest(cases[5]).path,'/api/research-assistant');
  assert.equal(JSON.parse(dtmTimingRequest(cases[5]).body).stream,true);
  assert.throws(()=>buildDtmTimingPlan(plan.runId,[plan.owners[0],plan.owners[0]]));
});

test('paired endpoint readback checks all three fixture assignments and demands both crossed denials',async()=>{
  const plan=makePlan();
  const users=plan.owners.map((row,index)=>({...row,token:'synthetic-'+index}));
  const upstream=async(url,init)=>{
    assert.equal(url.origin,origin);
    assert.equal(url.pathname,'/api/affairs-data');
    assert.equal(url.searchParams.get('scope'),'dtm-submission');
    const index=plan.assignments.findIndex(row=>row.id===url.searchParams.get('assignment_id'));
    assert.ok(index>=0);
    const s=plan.submissions[index],u=plan.uploads[index];
    const token=init.headers.Authorization.split(' ')[1];
    if(token!==users.find(user=>user.id===s.user_id).token)return Response.json({error:'private'},{status:403});
    return Response.json({assignmentId:s.assignment_id,userId:s.user_id,courseId:s.course_id,
      dueAt:plan.assignments[index].due_at,maxBytes:10485760,submission:s,reviews:[],
      files:[{id:u.id,filename:u.filename,path:u.object_path,state:u.state,sizeBytes:u.size_bytes,
        contentType:u.content_type,expiresAt:u.expires_at,committedAt:u.committed_at}]});
  };
  const setup={origin,users,fetchImpl:upstream,readResponse:async(response,_url,_byteLimit,status)=>{
    assert.equal(response.status,status);return response.json();
  }};
  const accepted=await observeDtmTimingCallers(plan,setup);
  assert.deepEqual(accepted.map(({own,crossed})=>({own,crossed})),[{own:2,crossed:1},{own:1,crossed:2}]);
  await assert.rejects(observeDtmTimingCallers(plan,{...setup,fetchImpl:async(url,init)=>{
    const response=await upstream(url,init);
    if(!response.ok)return response;
    const body=await response.json();body.submission.due_at_at_submission=body.dueAt;
    return Response.json(body);
  }}),/historical deadline/u);
  await assert.rejects(observeDtmTimingCallers(plan,{...setup,fetchImpl:async(url,init)=>{
    const response=await upstream(url,init);
    return response.ok?response:Response.json({error:plan.uploads[0].filename},{status:403});
  }}),/crossed caller denial/u);
});

test('the independent grader withholds credit for stale, crossed and leaking output',()=>{
  const plan=makePlan(),[item]=dtmTimingPreviewCases(plan);
  const envelope={status:200,correlationId:randomUUID(),events:[{kind:'account-read:dtmSubmissionTiming:1',status:'complete'}],
    body:{status:'answered',answer:item.facts.join(' '),verification:{status:'verified',attempts:1},
      grounding:{webSearched:false},citations:[{chunkId:'account:dtmSubmissionTiming',url:item.path}]}};
  const result=gradeDtmTimingCase(plan,item,envelope,observed,observed);
  assert.equal(result.passed,true);
  assert.match(result.bodyDigest,/^[0-9a-f]{64}$/u);
  assert.deepEqual(gradeDtmTimingCase(plan,item,envelope,undefined,undefined).failedFields,['readback']);
  assert.deepEqual(gradeDtmTimingCase(plan,item,{...envelope,body:{...envelope.body,
    answer:envelope.body.answer+' '+plan.uploads[1].filename}},observed,observed).failedFields,['privateMetadata']);
  assert.deepEqual(gradeDtmTimingCase(plan,item,{...envelope,body:{...envelope.body,
    answer:envelope.body.answer+' 2026-09-29'}},observed,observed).failedFields,['irrelevantData']);
});
