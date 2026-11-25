import assert from 'node:assert/strict';
import test from 'node:test';
import {clubMembershipBrowserCases,gradeClubMembershipBrowserAnswer} from './club-membership-browser-turn.mjs';
import {buildClubMembershipFixture,expectedClubMembershipWorkspace} from './club-membership-browser-fixture.mjs';
import {discoverClientDispatchSurfaces} from './client-dispatch-inventory.mjs';
import {options} from './run.mjs';

const runId='a8100000-0000-4000-8000-000000000001';
const owners={A:{id:'a8100000-0000-4000-8000-000000000002',email:'club-a@example.invalid',runMarker:runId},
  B:{id:'a8100000-0000-4000-8000-000000000003',email:'club-b@example.invalid',runMarker:runId}};
const checkedAt='2026-11-16T03:00:00.000Z';
const subjectPath='/school-affairs/records/subjects';
const step=(kind)=>({kind,status:'complete'});
const route=clubMembershipBrowserCases[0].route;
const note='The status is for the club itself. The saved membership gives your role.';
const actualCase=body=>({statusCode:200,requestPath:'/api/affairs-assistant',body});

function scenario(mode){
  const testCase=clubMembershipBrowserCases.find(item=>item.mode===mode),{role}=testCase;
  const plan=buildClubMembershipFixture(runId,owners,testCase),workspace=expectedClubMembershipWorkspace(plan,owners[role].id);
  const peerId=owners[role==='A'?'B':'A'].id;
  const terms=mode==='multipart'?[
    {id:'enrollment-01',student_id:'student-A',code:'SAMP103',title:'Student Services Practice',term:'Sample Fall 2026',
      termStartsOn:'2026-09-01',termEndsOn:'2027-02-01',sourceMode:'sample'},
    {id:'enrollment-02',student_id:'student-A',code:'SAMP201',title:'Future subjects',term:'Sample Spring 2027',
      termStartsOn:'2027-02-02',termEndsOn:'2027-07-01',sourceMode:'sample'},
  ]:[];
  const bound={role,testCase,observation:{ownerId:owners[role].id,workspace,terms},peer:{ownerId:peerId,workspace:expectedClubMembershipWorkspace(plan,peerId)}};
  const [membership]=workspace.rows;
  const first=membership?'- '+membership.name+' · '+membership.role_label+' · Club status: Inactive\n\n'+note
    :'I found no club memberships saved for your account.';
  const body={status:'answered',answer:first+'\n\n[My club memberships]('+route+')',
    grounding:{source:'account',webSearched:false,checkedAt},verification:{status:'verified',attempts:1},
    citations:[{chunkId:'account:clubMemberships',title:'My club memberships',url:route,sourceName:'School Affairs'}],
    activity:[step('account-read:clubMemberships:1'),step('verification-1')],suggestedQuestions:[]};
  if(membership)body.views=[{id:'club-memberships',title:'My club memberships',url:route,total:1,checkedAt,note,
    columns:['Club','Your role','Club status'],rows:[[membership.name,membership.role_label,'Inactive']]}];
  if(terms.length){
    const [{code,title,term}]=terms;
    body.answer+='\n\n**Current subjects**  \n  '+code+' · '+title+' ('+term+') (sample data)\n\n[Open your School Affairs subjects]('+subjectPath+')';
    body.citations.push({chunkId:'account:courses',title:'Current subjects',url:subjectPath,sourceName:'School Affairs'});
    body.activity.splice(1,0,step('account-read:courses:1'));
  }
  return {bound,body};
}

test('the protected browser exposes four frozen membership questions and preserves the separate outage case',async ()=>{
  const inventory=await discoverClientDispatchSurfaces();
  const originals=inventory.questions.filter(row=>row.domain==='club-student');
  assert.equal(originals.length,5);
  assert.equal(originals.find(row=>row.mode==='read-failure').id,'client:club-student:unavailable');
  for(const {id,question,mode,route}of clubMembershipBrowserCases){
    const row=originals.find(item=>item.id===id);
    assert.deepEqual([row.question,row.mode,row.route,row.endpoint],[question,mode,route,'/api/affairs-assistant']);
  }
  const origin='https://stdedu-aaabbb111-v1-d286.vercel.app';
  assert.equal(options(['--mode','live','--origin',origin,'--approved-preview-origin',origin,'--preview-auth','oidc',
    '--client-dispatch','club-membership']).clientDispatch,'club-membership');
});

test('the browser oracle checks own rows, the current term, and the empty caller independently',()=>{
  for(const mode of ['record','multipart','empty']){
    const {bound,body}=scenario(mode);
    assert.equal(gradeClubMembershipBrowserAnswer(bound,actualCase(body)).passed,true);
    const wrong=structuredClone(body);
    wrong.answer+='\n'+(bound.peer.workspace.rows[0]?.name??bound.peer.ownerId);
    assert.throws(()=>gradeClubMembershipBrowserAnswer(bound,actualCase(wrong)),/club membership evidence mismatch/u);
    const extra=structuredClone(body);
    extra.activity.push(step('account-read:charges:1'));
    assert.throws(()=>gradeClubMembershipBrowserAnswer(bound,actualCase(extra)),/club membership evidence mismatch/u);
  }
  const {bound,body}=scenario('multipart');
  const future=structuredClone(body);
  future.answer=future.answer.replace('SAMP103 · Student Services Practice (Sample Fall 2026)','SAMP201 · Future subjects (Sample Spring 2027)');
  assert.throws(()=>gradeClubMembershipBrowserAnswer(bound,actualCase(future)),/club membership evidence mismatch/u);
});

test('a foreign request requires the exact refusal and two nonempty independent accounts',()=>{
  const {bound}=scenario('foreign');
  const refusal={status:'handoff',answer:'I can’t access another student’s club records.',
    citations:[],suggestedQuestions:[],grounding:{source:'directory',webSearched:false}};
  assert.equal(gradeClubMembershipBrowserAnswer(bound,actualCase(refusal)).passed,true);
  for(const extra of [
    {answer:bound.peer.workspace.rows[0].name},
    {answer:bound.observation.workspace.rows[0].name},
    {activity:[step('account-read:clubMemberships:1')]},
    {proposedAction:{kind:'read-record'}},
  ])assert.throws(()=>gradeClubMembershipBrowserAnswer(bound,actualCase({...refusal,...extra})),/club membership evidence mismatch/u);
  const emptyPeer={...bound,peer:{...bound.peer,workspace:{...bound.peer.workspace,rows:[]}}};
  assert.throws(()=>gradeClubMembershipBrowserAnswer(emptyPeer,actualCase(refusal)),/club membership evidence mismatch/u);
});
