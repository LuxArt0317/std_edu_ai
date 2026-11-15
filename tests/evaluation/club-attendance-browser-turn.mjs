import {randomUUID} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {clubAttendancePath} from '../../server/clubAttendanceIntent.js';
import {internshipObservationDigest as digest} from '../../server/internshipObservation.js';
import {clubAttendanceBrowserObservationEvent,createClubAttendanceBrowserProbe,verifyClubAttendanceBrowserObservation} from '../../server/clubAttendanceObservation.js';
import {assistantActivityStatus,assistantActivityTimeline} from '../../src/features/public/assistantActivityTimeline.ts';
import {verifyProtectedCertificateBrowserReceipt,verifyProtectedNativeBrowserSave} from './certificate-browser-turn.mjs';
import {requireProtectedBrowser as check} from './protected-browser-diagnostics.mjs';

const modes=['record','multipart','empty','foreign','read-failure'];
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u;
const feePath='/school-affairs/services/39-1';
const project='https://xiftudmvxphxcjtmfmib.supabase.co';
const choice=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
const exact=(value,keys)=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).sort().join()===keys;

/** Independent records from both inspected caller scopes. The normal live
 * operator still has to obtain these at the pinned deployment and verify that
 * the same persisted data remains after the turn. This never returns live credit. */
function bindReadbacks(input,mode,ownerId){
  check(exact(input,'A,B')&&input.A?.ownerId!==input.B?.ownerId,'invalid fixture config');
  const ownerKey=mode==='empty'?'B':'A';
  check(input[ownerKey]?.ownerId===ownerId,'wrong fixture caller');
  for(const side of [input.A,input.B]){
    const id=side?.ownerId,attendance=side?.attendance;
    check(uuid.test(id??'')&&attendance?.userId===id&&attendance.page===1&&attendance.view==='my-attendance'
      &&typeof attendance.hasMore==='boolean'&&Array.isArray(attendance.rows)&&attendance.rows.length<=25
      &&attendance.rows.every(row=>uuid.test(row?.id??'')&&['title','club_name','location'].every(name=>typeof row[name]==='string'&&row[name]
        &&row[name].length<=150)&&['starts_at','recorded_at'].every(name=>typeof row[name]==='string'&&Number.isFinite(Date.parse(row[name])))
        &&['academic_year','term'].every(name=>row[name]===null||Number.isSafeInteger(row[name]))),'wrong fixture caller');
  }
  const rowsA=input.A.attendance.rows,rowsB=input.B.attendance.rows;
  check(rowsA.length>0&&(mode==='empty'?rowsB.length===0:rowsB.length>0)
    &&rowsA.every(row=>rowsB.every(other=>row.id!==other.id&&row.title!==other.title)),'invalid fixture config');
  const current=input[ownerKey],other=input[ownerKey==='A'?'B':'A'];
  if(mode==='multipart')for(const side of [current,other]){
    const {tuitionReads}=side;
    check(Array.isArray(tuitionReads)&&tuitionReads.length===2,'invalid fixture config');
    const [students,charges]=tuitionReads;
    let first,second;
    try{first=new URL(students.url);second=new URL(charges.url);}catch{check(false,'invalid fixture config');}
    check(first.origin===project&&first.pathname==='/rest/v1/affairs_students'&&first.searchParams.get('user_id')==='eq.'+side.ownerId
      &&second.origin===project&&second.pathname==='/rest/v1/affairs_charges'&&Array.isArray(students.rows)&&students.rows.length===1
      &&students.rows[0].user_id===side.ownerId&&uuid.test(students.rows[0].id)
      &&second.searchParams.get('student_id')==='eq.'+students.rows[0].id
      &&Array.isArray(charges.rows)&&charges.rows.length===1&&charges.rows[0].student_id===students.rows[0].id
      &&uuid.test(charges.rows[0].id??'')&&charges.rows[0].category==='tuition'&&charges.rows[0].currency==='TWD'
      &&tuitionReads.every(read=>read.ownerId===side.ownerId&&read.method==='GET'),'invalid fixture config');
  }
  if(mode==='multipart'){
    const [ownCharge,otherCharge]=[current,other].map(side=>side.tuitionReads[1].rows[0]);
    check(['id','label','student_id'].every(field=>typeof ownCharge[field]==='string'&&ownCharge[field]
      &&typeof otherCharge[field]==='string'&&otherCharge[field]&&ownCharge[field]!==otherCharge[field]),'invalid fixture config');
  }
  return {current,other,beforeDigest:digest(input)};
}

function verifyReplyFacts(body,mode,current,other){
  const rows=current.attendance.rows;
  check(Array.isArray(body?.citations)&&Array.isArray(body?.activity??[])&&Array.isArray(body?.views??[]),'invalid assistant stream result');
  const sources=body.citations.map(({chunkId,url})=>[chunkId,url]);
  const expectedSources=mode==='foreign'||mode==='read-failure'?[]:[['account:clubAttendance',clubAttendancePath],
    ...(mode==='multipart'?[['account:charges',feePath]]:[])];
  const rendered=JSON.stringify(body);
  const forbidden=[current.ownerId,other.ownerId,...other.attendance.rows.flatMap(row=>[row.id,row.title]),
    ...(mode==='multipart'?other.tuitionReads[1].rows.map(row=>row.label):[])];
  check(isDeepStrictEqual(sources,expectedSources)&&typeof body.answer==='string'&&body.answer.length<=12000
    &&forbidden.every(value=>typeof value==='string'&&value&&!rendered.includes(value)), 'save answer mismatch');
  const steps=body.activity??[],tools=steps.filter(step=>step.kind?.startsWith('account-read:'));
  const expectedTools=mode==='foreign'?[]:mode==='read-failure'?[['account-read:clubAttendance:1','unavailable'],['account-read:clubAttendance:2','unavailable']]
    :[['account-read:clubAttendance:1','complete'],...(mode==='multipart'?[['account-read:charges:1','complete']]:[])];
  check(isDeepStrictEqual(tools.map(step=>[step.kind,step.status]).sort(),expectedTools.sort()),'save activity mismatch');
  const views=body.views??[];
  if(mode==='foreign')check(/saved for your own account/u.test(body.answer)&&!views.length
    &&!rows.some(row=>rendered.includes(row.title)),'save answer mismatch');
  else if(mode==='read-failure')check(/could not verify this answer/u.test(body.answer)&&!/No saved attendance/u.test(body.answer)
    &&!views.length&&!rows.some(row=>rendered.includes(row.title)),'save answer mismatch');
  else if(mode==='empty')check(/No saved attendance entries were returned on page 1/u.test(body.answer)&&!views.length,'save answer mismatch');
  else{
    const cells=rows.slice(0,12).map(row=>[row.title,row.club_name,choice.format(new Date(row.starts_at)),row.location,
      row.academic_year===null?'Not recorded':String(row.academic_year),row.term===null?'Not recorded':String(row.term),choice.format(new Date(row.recorded_at))]);
    const columns=['Activity','Club','Starts (Taipei)','Location','Academic year','Term','Recorded (Taipei)'];
    const expectedCards=(rows.length>1?1:0)+(mode==='multipart'?1:0);
    const visible=views.filter(view=>view.id==='club-attendance');
    check(body.answer.includes('Saved attendance entries on page 1: '+rows.length+'.')
      &&views.length===expectedCards
      &&body.answer.includes('There are more pages.')===current.attendance.hasMore
      &&(rows.length===1?visible.length===0&&cells[0].every((value,index)=>body.answer.includes(columns[index]+': '+value))
        :visible.length===1&&visible[0]?.id==='club-attendance'&&visible[0].url===clubAttendancePath&&visible[0].total===rows.length
          &&isDeepStrictEqual(visible[0].columns,columns)&&isDeepStrictEqual(visible[0].rows,cells)),'save answer mismatch');
  }
  if(mode==='multipart'){
    const [{label,amount_due,amount_paid,source_mode}]=current.tuitionReads[1].rows;
    const exactCents=value=>{
      if(typeof value!=='number'&&(typeof value!=='string'||!/^\d+(?:\.\d{1,2})?$/u.test(value)))return NaN;
      const amount=Number(value),cents=Math.round(amount*100);
      return cents/100===amount?cents:NaN;
    };
    const due=exactCents(amount_due),paid=exactCents(amount_paid);
    check(Number.isSafeInteger(due)&&Number.isSafeInteger(paid)&&due>=paid&&paid>=0,'invalid fixture config');
    const decimal=(min)=>((due-paid)/100).toLocaleString('en-US',{minimumFractionDigits:min,maximumFractionDigits:2,useGrouping:true});
    const amount='NT$'+decimal(0),view=views.at(-1);
    const balances=body.answer.split('\n').filter(line=>line.startsWith('Remaining balance: '));
    check(body.answer.includes(label)&&balances.length===1&&balances[0].slice('Remaining balance: '.length).replaceAll('\`','').trim()===amount
      &&view?.id==='charges'&&view.url===feePath&&view.total===1
      &&isDeepStrictEqual(view.columns,['Charge','Currency','Calculated remaining','Source mode'])
      &&isDeepStrictEqual(view.rows,[[label,'TWD',decimal(2),source_mode]]),'save answer mismatch');
  }
}

function parsePackets(bytes){
  check(Buffer.isBuffer(bytes)&&bytes.byteLength<=300000,'invalid assistant stream result');
  let source;
  try{source=new TextDecoder('utf-8',{fatal:true}).decode(bytes);}catch{check(false,'invalid assistant stream result');}
  check(source.endsWith('\n\n'),'invalid assistant stream result');
  return source.slice(0,-2).split('\n\n').map(text=>{
    const match=/^event: ([a-z-]+)\ndata: (.+)$/u.exec(text);
    check(match,'invalid assistant stream result');
    try{return {type:match[1],data:JSON.parse(match[2]),text};}catch{check(false,'invalid assistant stream result');}
  });
}

/** One exact signed browser ask, SSE receipt stripping, and version-zero
 * save binding. The caller owns live-origin pinning and durable journal I/O. */
export function createProtectedClubAttendanceBrowserTurn({testCase,scope,key,readbacks,now=Date.now}){
  const {mode}=testCase;
  check(modes.includes(mode)&&testCase.id==='client:club-activity-attendance:'+(mode==='read-failure'?'unavailable':mode)
    &&testCase.endpoint==='/api/affairs-assistant'&&testCase.route===clubAttendancePath&&scope.mode===mode,'invalid fixture config');
  const {current,other,beforeDigest}=bindReadbacks(readbacks,mode,scope.ownerId);
  const before=structuredClone({current,other});
  let binding,accepted,saved,savedReceipt,restoredReceipt;
  return Object.freeze({
    request({payload,frameUrl,ownerId}){
      check(!binding&&ownerId===scope.ownerId&&frameUrl===scope.origin+testCase.route&&payload?.question===testCase.question
        &&payload?.route===testCase.route,'unreserved assistant turn or frame');
      const probe=createClubAttendanceBrowserProbe({...scope,nonce:randomUUID()},payload,key,now());
      binding=probe.binding;
      return probe.body;
    },
    receive({bytes,correlationId}){
      check(binding&&!accepted,'unexpected application response');
      const packets=parsePackets(bytes),terminal=packets.at(-1),receipt=packets.at(-2);
      check(terminal?.type==='result'&&receipt?.type===clubAttendanceBrowserObservationEvent&&exact(receipt.data,'receipt')
        &&packets.slice(0,-2).every(packet=>packet.type==='progress'),'invalid assistant stream result');
      const proof=verifyClubAttendanceBrowserObservation({receipt:receipt.data.receipt,binding,correlationId,body:terminal.data},key);
      check(proof,'invalid assistant stream result');
      const observed=proof.reads.filter(read=>read.status==='complete');
      for(const read of observed){
        const expected=read.tool==='clubAttendance'?[{ownerId:scope.ownerId,workspace:before.current.attendance}]:before.current.tuitionReads;
        check(Array.isArray(expected)&&isDeepStrictEqual(read.inputDigests,expected.map(digest)),'save answer mismatch');
      }
      verifyReplyFacts(terminal.data,mode,before.current,before.other);
      const activity=new Map(packets.slice(0,-2).map(({data})=>[data.kind,data]));
      check(isDeepStrictEqual([...activity.values()],terminal.data.activity??[]),'save activity mismatch');
      accepted={result:terminal.data,proofDigest:digest(proof),correlationId,responseDigest:proof.responseDigest};
      const visible=Buffer.from([...packets.slice(0,-2),terminal].map(packet=>packet.text+'\n\n').join(''));
      return {body:visible,proofDigest:accepted.proofDigest,responseDigest:accepted.responseDigest};
    },
    save({payload,requestSequence}){
      check(accepted&&!saved,'save answer mismatch');
      saved=verifyProtectedNativeBrowserSave({payload,question:testCase.question,requestSequence,
        assistantResponse:Buffer.from(JSON.stringify(accepted.result)),inspectReply:reply=>({
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
      check(savedReceipt&&!restoredReceipt,'save receipt mismatch');
      restoredReceipt=verifyProtectedCertificateBrowserReceipt({row,expected:{...saved,updatedAt:savedReceipt.updatedAt},mode:'read'});
      return restoredReceipt;
    },
    confirmUnchanged(after){
      check(restoredReceipt&&digest(after)===beforeDigest,'save answer mismatch');
      return {caseId:testCase.id,scopeDigest:beforeDigest,proofDigest:accepted.proofDigest,responseDigest:accepted.responseDigest,
        correlationId:accepted.correlationId};
    },
  });
}

/** Use on both the saved turn and its reopened conversation in a fresh context. */
export async function verifyRenderedClubAttendanceBrowserTurn({dialog,expected}){
  const articles=dialog.getByRole('log',{name:'Assistant conversation'}).getByRole('article'),reply=articles.nth(1);
  const markdown=reply.locator('.nexus-message-markdown');
  await markdown.waitFor({state:'visible'});
  check(await articles.count()===2&&await articles.nth(0).getByText(expected.question,{exact:true}).isVisible(),
    'rendered attendance transcript mismatch');
  const normalize=value=>value.replace(/\s+/gu,' ').trim();
  const markdownLink=/\[([^\]]+)\]\(([^)]+)\)/gu;
  const answerLinks=Array.from(expected.answer.matchAll(markdownLink),match=>[match[1],match[2]]);
  const displayText=expected.answer.replace(markdownLink,'$1').replace(/[`*]/gu,'');
  check(normalize(await markdown.innerText())===normalize(displayText),'rendered attendance transcript mismatch');
  const sources=reply.getByRole('list',{name:'Sources'});
  const readLinks=element=>[...element.querySelectorAll('a')].map(link=>[link.textContent,link.getAttribute('href')]);
  check(isDeepStrictEqual(await markdown.evaluate(readLinks),answerLinks)
    &&(expected.display.citations.length?isDeepStrictEqual(await sources.evaluate(readLinks),expected.display.citations):!await sources.count()),
  'rendered attendance transcript mismatch');
  const activity=reply.locator('details:has(> summary span:text-is("Activity"))');
  check(await reply.locator('details').count()===1+expected.display.views.length&&await activity.count()===1,
    'rendered attendance activity mismatch');
  if(await activity.getAttribute('open')===null)await activity.locator('summary').click();
  const timeline=assistantActivityTimeline(expected.activity);
  if(timeline.length){
    const steps=await activity.getByRole('list',{name:'Observed assistant steps'}).evaluate(element=>
      [...element.querySelectorAll(':scope > li > span:not([aria-hidden])')].map(row=>[...row.children].map(node=>node.textContent)));
    check(isDeepStrictEqual(steps,timeline.map(step=>[assistantActivityStatus(step)+': ',step.label,step.detail])),
      'rendered attendance activity mismatch');
  }else{
    check(!await activity.getByRole('list',{name:'Observed assistant steps'}).count()
      &&await activity.getByText('No checks or tools were reported for this answer.',{exact:true}).isVisible(),
    'rendered attendance activity mismatch');
  }
  for(const view of expected.display.views){
    const summary=reply.getByText(view.title+' · '+view.total+' retrieved',{exact:true}),card=summary.locator('..');
    check(await summary.isVisible(),'rendered attendance transcript mismatch');
    if(await card.getAttribute('open')===null)await summary.click();
    const cells=await card.getByRole('table').evaluate(table=>[...table.rows].map(row=>[...row.cells].map(cell=>cell.textContent)));
    check(isDeepStrictEqual(cells,[view.columns,...view.rows])
      &&await card.getByRole('link',{name:'Open records',exact:true}).getAttribute('href')===view.url,'rendered attendance transcript mismatch');
  }
  return {requestSequence:expected.requestSequence,observedSteps:timeline.length,cards:expected.display.views.length};
}
