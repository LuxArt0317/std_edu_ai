import {isDeepStrictEqual} from 'node:util';
import {clubMembershipPath} from '../../server/clubMembershipIntent.js';
import {schoolSubjectRecordsPath} from '../../src/features/public/affairs/studentServices.js';
import {verifyProtectedCertificateBrowserReceipt,verifyProtectedNativeBrowserSave} from './certificate-browser-turn.mjs';
import {parseProtectedGraphBrowserPackets} from './club-attendance-browser-turn.mjs';
import {requireProtectedBrowser as check} from './protected-browser-diagnostics.mjs';

export const clubMembershipBrowserProfile='club-membership';
export const clubMembershipBrowserBootstrap='/api/affairs-data?scope=club-student&view=my-memberships&page=1';
const question='Which clubs am I a member of, and which memberships are active?';
export const clubMembershipBrowserCases=Object.freeze([
  {id:'client:club-student:record',mode:'record',role:'A',question},
  {id:'client:club-student:multipart',mode:'multipart',role:'A',question:question+' Also show my current semester subjects.'},
  {id:'client:club-student:empty',mode:'empty',role:'B',question},
  {id:'client:club-student:foreign',mode:'foreign',role:'A',question:'Show another student’s club student records.'},
].map(item=>Object.freeze({...item,route:clubMembershipPath})));
const need=value=>check(value,'club membership evidence mismatch');
const note='The status is for the club itself. The saved membership gives your role.';
const clubTitle='My club memberships',courseTitle='Current subjects';
const link=(title,url)=>'['+title+']('+url+')';
const cite=(chunkId,title,url)=>({chunkId,title,url,sourceName:'School Affairs'});
const today=instant=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(instant));

export function gradeClubMembershipBrowserAnswer({testCase,observation,peer},{statusCode,body,requestPath}){
  need(requestPath==='/api/affairs-assistant'&&statusCode===200);
  if(testCase.mode==='foreign'){
    need(observation.workspace.rows.length>0&&peer.workspace.rows.length>0
      &&isDeepStrictEqual(body,{status:'handoff',answer:'I can’t access another student’s club records.',
        citations:[],suggestedQuestions:[],grounding:{source:'directory',webSearched:false}}));
    return {passed:true,checks:[{id:'club-membership.foreign-denied',passed:true}]};
  }
  const {workspace,terms}=observation;
  const isCompound=testCase.mode==='multipart';
  const rows=workspace.rows.map(row=>[row.name,row.role_label,row.active?'Active':'Inactive']);
  need(body?.status==='answered'
    &&isDeepStrictEqual(body.verification,{status:'verified',attempts:1})&&body.grounding?.source==='account'
    &&body.grounding.webSearched===false&&!body.grounding.degraded&&!body.proposedAction
    &&Array.isArray(body.activity)&&typeof body.answer==='string'&&body.answer.length<=12000
    &&Number.isFinite(Date.parse(body.grounding.checkedAt)));
  const clubParagraphs=rows.length
    ?[rows.map(([title,role,status])=>'- '+title+' · '+role+' · Club status: '+status).join('\n'),note]
    :['I found no club memberships saved for your account.'];
  const expected=[...clubParagraphs,link(clubTitle,clubMembershipPath)];
  const citations=[cite('account:clubMemberships',clubTitle,clubMembershipPath)];
  if(isCompound){
    const day=today(body.grounding.checkedAt);
    const current=terms.filter(row=>row.termStartsOn<=day&&day<=row.termEndsOn);
    need(current.length>0&&current.length<terms.length);
    const subjects=current.map(row=>row.code+' · '+row.title+' ('+row.term+')'+(row.sourceMode==='sample'?' (sample data)':''));
    expected.push(['**Current subjects**',...subjects].join('  \n  '),link('Open your School Affairs subjects',schoolSubjectRecordsPath));
    citations.push(cite('account:courses',courseTitle,schoolSubjectRecordsPath));
  }
  need(body.answer===expected.join('\n\n')&&isDeepStrictEqual(body.citations,citations));
  const readSteps=body.activity.filter(step=>step.kind?.startsWith('account-read:')).map(({kind,status})=>[kind,status]).sort();
  need(isDeepStrictEqual(readSteps,[['account-read:clubMemberships:1','complete'],...(isCompound?[['account-read:courses:1','complete']]:[])])
    &&isDeepStrictEqual(body.activity.filter(step=>!step.kind?.startsWith('account-read:')).map(({kind,status})=>[kind,status]),
      [['verification-1','complete']]));
  const views=body.views??[];
  need(isDeepStrictEqual(views,rows.length?[{id:'club-memberships',title:clubTitle,url:clubMembershipPath,columns:['Club','Your role','Club status'],
    rows,total:rows.length,checkedAt:body.grounding.checkedAt,note}]:[]));
  const forbidden=[observation.ownerId,peer.ownerId,...workspace.rows.map(row=>row.id),
    ...peer.workspace.rows.flatMap(row=>[row.id,row.name,row.role_label]),...terms.flatMap(row=>[row.id,row.student_id])];
  need(forbidden.every(value=>value&&!JSON.stringify(body).includes(value)));
  return {passed:true,checks:[{id:'club-membership.owned-roles-and-status',passed:true},
    ...(isCompound?[{id:'club-membership.current-subjects',passed:true}]:[])]};
}

export function createProtectedClubMembershipBrowserTurn({bound,origin}){
  const grade=body=>gradeClubMembershipBrowserAnswer(bound,{statusCode:200,requestPath:'/api/affairs-assistant',body});
  let requested=false,accepted,saved,savedReceipt;
  return Object.freeze({
    request({payload,frameUrl,ownerId}){
      need(!requested&&payload?.question===bound.testCase.question&&payload.route===bound.testCase.route
        &&frameUrl===origin+bound.testCase.route&&ownerId===bound.observation.ownerId);
      requested=true;
      return payload;
    },
    receive({bytes}){
      need(requested&&!accepted);
      const packets=parseProtectedGraphBrowserPackets(bytes),terminal=packets.pop();
      need(terminal?.type==='result'&&packets.every(packet=>packet.type==='progress'));
      grade(terminal.data);
      const progress=new Map(packets.map(({data})=>[data.kind,data]));
      need(isDeepStrictEqual([...progress.values()],terminal.data.activity??[]));
      accepted=terminal.data;
      return {body:bytes,terminalBytes:Buffer.from(JSON.stringify(accepted))};
    },
    save({payload,requestSequence}){
      need(accepted&&!saved);
      saved=verifyProtectedNativeBrowserSave({payload,question:bound.testCase.question,requestSequence,
        assistantResponse:Buffer.from(JSON.stringify(accepted)),inspectReply:reply=>({
          citations:reply.citations.map(({title,url})=>[title,url]),views:reply.views??[],
        })});
      return saved;
    },
    receiveSave(row){
      need(saved&&!savedReceipt);
      savedReceipt=verifyProtectedCertificateBrowserReceipt({row,expected:saved,mode:'save'});
      return savedReceipt;
    },
    receiveRestore(row){
      need(savedReceipt);
      return verifyProtectedCertificateBrowserReceipt({row,expected:{...saved,updatedAt:savedReceipt.updatedAt},mode:'read'});
    },
  });
}
