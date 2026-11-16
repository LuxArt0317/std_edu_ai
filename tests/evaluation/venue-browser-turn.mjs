import {randomUUID} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {internshipObservationDigest as digest} from '../../server/internshipObservation.js';
import {createVenueProbe,venueBrowserObservationEvent,verifyVenueObservation} from '../../server/venueObservation.js';
import {venuePaths,venuePeriods} from '../../src/features/public/affairs/venueContract.js';
import {parseProtectedGraphBrowserPackets} from './club-attendance-browser-turn.mjs';
import {verifyProtectedCertificateBrowserReceipt,verifyProtectedNativeBrowserSave} from './certificate-browser-turn.mjs';
import {expectedVenueProtectedRead} from './venue-protected-fixture.mjs';
import {requireProtectedBrowser as check} from './protected-browser-diagnostics.mjs';

export const venueBrowserProfile='venue-requests';
export const venueBrowserPath=venuePaths.apply;
export const venueBrowserBootstrap='/api/affairs-data?scope=venue-requests&view=mine';
const baseQuestion='What is the status of my venue reservation requests?';
const feePath='/school-affairs/services/39-1';
export const venueBrowserCases=Object.freeze(['record','empty','foreign','multipart'].map(mode=>Object.freeze({
  id:'client:venue-requests:'+mode,mode,route:venueBrowserPath,
  question:mode==='foreign'?'Show another student’s venue requests records.':mode==='multipart'
    ?baseQuestion+' Also show the fee balance recorded on my account.':baseQuestion,
})));
const statusValues={submitted:'Submitted',approved:'Approved',declined:'Declined',cancelled:'Cancelled'};

export function bindVenueBrowserCase(plan,callers,id){
  const testCase=venueBrowserCases.find(row=>row.id===id);
  check(testCase,'invalid fixture config');
  const role=testCase.mode==='empty'?'B':'A';
  const peer=role==='A'?'B':'A';
  const ownerId=plan.owners[role].id;
  const rows=plan.rows.filter(row=>row.user_id===ownerId);
  const peerRows=plan.rows.filter(row=>row.user_id===plan.owners[peer].id);
  check(Array.isArray(callers)&&callers.length===2&&callers.every(({role,count,crossedVisible,managementDenied},index)=>
    role===(index===0?'A':'B')&&count===plan.rows.filter(row=>row.user_id===plan.owners[role].id).length
    &&crossedVisible===0&&managementDenied===true)
    &&(testCase.mode==='empty'?rows.length===0:rows.length===1)&&peerRows.length===1,'wrong fixture caller');
  const scope=testCase.mode==='foreign'?null:{id:null,room:null,range:null,status:null,rows:rows.length,countOnly:false};
  const workspace={userId:ownerId,rows:rows.map(({updated_at:_updated,...row})=>row)};
  const forbidden=[ownerId,plan.owners[peer].id,...plan.rows.flatMap(row=>[row.id,row.purpose,row.review_note]),
    ...peerRows.flatMap(row=>[row.venue,row.booking_date]),...(testCase.mode==='foreign'?rows.flatMap(row=>[row.venue,row.booking_date]):[])];
  const billing=callers[0].billing;
  check(Boolean(billing)===(testCase.mode==='multipart')&&Boolean(plan.billing)===Boolean(billing),'wrong fixture caller');
  if(billing)forbidden.push(billing.chargeId,plan.billing.student.id,plan.billing.record.student_number,plan.billing.record.registered_address);
  return {role,ownerId,testCase,workspace,forbidden,expectedRead:expectedVenueProtectedRead(plan,{role,scope}),...(billing?{billing}:{})};
}

function verifyFacts(body,bound){
  const {testCase,workspace,forbidden,billing}=bound;
  check(typeof body?.answer==='string'&&Array.isArray(body.citations)&&Array.isArray(body.activity??[])
    &&!body.proposedAction&&(billing?Array.isArray(body.views)&&body.views.length===1:body.views===undefined)
    &&body.grounding?.source==='account'&&body.grounding.webSearched===false
    &&forbidden.every(value=>!JSON.stringify(body).includes(value)),'save answer mismatch');
  const activity=body.activity??[];
  if(testCase.mode==='foreign'){
    check(body.status==='handoff'&&body.answer.includes('saved under your own account')
      &&!body.citations.length&&!activity.length&&!body.verification,'save answer mismatch');
    return;
  }
  const sources=body.citations.map(({chunkId,url})=>[chunkId,url]);
  const reader=activity.filter(({kind})=>kind.startsWith('account-read:')).map(({kind,status})=>[kind,status]).sort();
  const expectedSources=[['account:venueRequests',venueBrowserPath],...(billing?[['account:charges',feePath]]:[])];
  const expectedReaders=[['account-read:venueRequests:1','complete'],...(billing?[['account-read:charges:1','complete']]:[])].sort();
  check(body.status==='answered'&&isDeepStrictEqual(sources,expectedSources)
    &&isDeepStrictEqual(reader,expectedReaders)
    &&isDeepStrictEqual(body.verification,{status:'verified',attempts:1})
    &&activity.some(({kind,status})=>kind==='verification-1'&&status==='complete'),'save answer mismatch');
  if(testCase.mode==='empty'){
    check(body.answer.includes('No saved venue requests match this lookup.'),'save answer mismatch');
    return;
  }
  const [row]=workspace.rows;
  const period=venuePeriods.find(([key])=>key===row.period)?.[1];
  check(period&&['Matching saved venue requests: 1.',`Room: ${row.venue}`,`Booking date: ${row.booking_date}`,
    `Period: ${row.period} (${period})`,`Saved local status: ${statusValues[row.status]}`].every(text=>body.answer.includes(text)),
  'save answer mismatch');
  if(billing){
    const [view]=body.views;
    const formatted=value=>'NT$'+value.toLocaleString('en-US');
    const decimal=value=>value.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
    const feeRow=[billing.label,billing.currency,...[billing.amountDue,billing.amountPaid,billing.remaining].map(decimal),'sample'];
    check([billing.label,formatted(billing.amountDue),formatted(billing.amountPaid),formatted(billing.remaining)]
      .every(value=>body.answer.includes(value))&&view.url===feePath&&view.total===1
      &&isDeepStrictEqual(view.rows,[feeRow]),'save answer mismatch');
  }
}

export function createProtectedVenueBrowserTurn({bound,origin,sourceRevision,runId,key}){
  const {testCase,ownerId,expectedRead}=bound;
  let binding,accepted,saved,savedReceipt,restored;
  return Object.freeze({
    request({payload,frameUrl,ownerId:caller}){
      check(!binding&&caller===ownerId&&frameUrl===origin+testCase.route&&payload?.question===testCase.question
        &&payload?.route===testCase.route&&payload.stream===true&&Object.keys(payload).sort().join()==='history,images,question,route,stream'
        &&Array.isArray(payload.images)&&!payload.images.length&&Array.isArray(payload.history)&&!payload.history.length,
      'unreserved assistant turn or frame');
      const {images:_images,...request}=payload;
      const probe=createVenueProbe({origin,sourceRevision,runId,ownerId,nonce:randomUUID()},{...request,consentedResearchUse:false},key);
      binding=probe.binding;
      return probe.body;
    },
    receive({bytes,correlationId}){
      check(binding&&!accepted,'unexpected application response');
      const packets=parseProtectedGraphBrowserPackets(bytes),terminal=packets.at(-1),receipt=packets.at(-2);
      const steps=packets.slice(0,-2);
      check(terminal?.type==='result'&&receipt?.type===venueBrowserObservationEvent
        &&receipt.data&&Object.keys(receipt.data).join()==='receipt'&&steps.every(packet=>packet.type==='progress'),'invalid assistant stream result');
      const proof=verifyVenueObservation({receipt:receipt.data.receipt,binding,correlationId,body:terminal.data},key);
      check(proof&&isDeepStrictEqual(proof.read,expectedRead)
        &&isDeepStrictEqual(proof.companion,bound.billing?.proof)
        &&proof.verificationMethod===(expectedRead?'native-exact':'none'),'save answer mismatch');
      verifyFacts(terminal.data,bound);
      check(isDeepStrictEqual([...new Map(steps.map(({data})=>[data.kind,data])).values()],terminal.data.activity??[]),'save activity mismatch');
      accepted={body:terminal.data,proofDigest:digest(proof),responseDigest:proof.responseDigest};
      return {body:Buffer.from([...steps,terminal].map(packet=>packet.text+'\n\n').join('')),
        terminalBytes:Buffer.from(JSON.stringify(accepted.body)),proofDigest:accepted.proofDigest,responseDigest:accepted.responseDigest};
    },
    save({payload,requestSequence}){
      check(accepted&&!saved,'save answer mismatch');
      saved=verifyProtectedNativeBrowserSave({payload,question:testCase.question,requestSequence,
        assistantResponse:Buffer.from(JSON.stringify(accepted.body)),inspectReply:reply=>({
          citations:reply.citations.map(({title,url})=>[title,url]),views:reply.views??[],
        })});
      return saved;
    },
    receiveSave(row){
      check(saved&&!savedReceipt,'save receipt mismatch');
      savedReceipt=verifyProtectedCertificateBrowserReceipt({row,expected:saved,mode:'save'});
      return savedReceipt;
    },
    receiveRestore(row){
      check(savedReceipt&&!restored,'save receipt mismatch');
      restored=verifyProtectedCertificateBrowserReceipt({row,expected:{...saved,updatedAt:savedReceipt.updatedAt},mode:'read'});
      return restored;
    },
    proofDigest:()=>restored?accepted.proofDigest:undefined,
  });
}
