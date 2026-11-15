import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {test} from 'node:test';
import {checkConfirmedTaskRoundTrip} from './confirmed-task-preview.mjs';

function harness(fault){
  const owners=[randomUUID(),randomUUID()],title='QA assistant task 448d92b032ff';
  const task=randomUUID(),commands={create:randomUUID(),complete:randomUUID()};
  const baseline={id:randomUUID(),user_id:owners[1],source_mode:'sample',title:'Sample task'};
  const state={tasks:[baseline],audits:[],receipts:[]},order=[];
  const proposal=(kind,payload,requestId)=>({kind,payload,requestId});
  async function propose(side,question){
    order.push(`propose ${side}`);
    const creating=question.startsWith('Create');
    if(creating&&fault==='premature')state.audits.push({user_id:owners[0]});
    const proposedAction=creating?proposal('create_task',{title},commands.create)
      :side==='A'||fault==='foreign proposal'?proposal('complete_task',{task_id:task},commands.complete):undefined;
    return {status:200,correlationId:randomUUID(),body:{status:proposedAction?'answered':'clarification',
      verification:{status:'verified',attempts:1},proposedAction}};
  }
  async function submit(side,command,stage){
    order.push(stage);
    const [owner,kind]=[owners[side==='A'?0:1],command.kind];
    const existing=state.receipts.find(row=>row.user_id===owner&&row.request_id===command.requestId);
    if(existing){
      if(JSON.stringify(existing.payload)!==JSON.stringify(command.payload))return {status:409,body:{error:'Conflict'}};
      if(fault==='replay'&&kind==='complete_task')state.tasks[1].completed_at='2026-11-15T12:32:00Z';
      return {status:200,body:existing.result};
    }
    if(side==='B'){
      if(fault==='foreign receipt')return {status:400,body:{id:task}};
      return {status:400,body:{error:'Invalid action'}};
    }
    const creating=kind==='create_task';
    if(creating){
      state.tasks.push({id:task,user_id:owner,title,source_mode:'site',due_at:null,completed_at:null});
      if(fault==='baseline mutation')state.tasks[0].title='Changed baseline';
    }else state.tasks[1].completed_at='2026-11-15T12:31:00Z';
    const summary=(creating?'Created':'Completed')+' task: '+title,id=task;
    const result={id,kind,summary};
    state.receipts.push({user_id:owner,request_id:command.requestId,kind,payload:command.payload,result});
    state.audits.push({user_id:owner,action_kind:kind,target_id:id,summary});
    return {status:200,body:result};
  }
  return {order,run:()=>checkConfirmedTaskRoundTrip({owners,title,propose,submit,read:async()=>structuredClone(state)})};
}

test('the independently verified action packet requires confirmation, exactly one owned change and preserved replay receipts',async()=>{
  const {run,order}=harness();
  const report=await run();
  assert.equal(report.passed,true);
  assert.equal(report.proposalsChecked,3);
  assert.equal(report.actionRequestsChecked,7);
  assert.deepEqual(order,['propose A','confirm creation','replay creation','reject changed replay','propose B','propose A',
    'deny completion by other owner','confirm completion','replay completion','deny other owner receipt replay']);
  assert.equal(report.readout.length,10);
  assert.equal(report.readout[7].digest,report.readout[9].digest);
});

test('early writes, changed sample rows, foreign account leakage and replay side effects fail independent verification',async()=>{
  for(const [fault,stage] of [['premature','creation proposal produced no write'],['baseline mutation','one open task'],
    ['foreign proposal','other account proposal denied'],['foreign receipt','open task owner boundary'],
    ['replay','completion replay preserved the original timestamp']]){
    await assert.rejects(harness(fault).run(),new RegExp(stage,'u'),fault);
  }
});
