import {feeRemissionUuid as uuid} from './feeRemissionContract.js';

export const clearancePaths={apply:'/school-affairs/services/10-1',status:'/school-affairs/services/16-1'};
export const clearanceScope='graduation-clearance';
export const clearanceSubmit='submit_graduation_clearance';
export const clearanceManagerActions=['set_clearance_period','set_clearance_candidate','review_clearance_office'];
export const clearanceOffices={library:['圖書館典閱組','Library circulation'],academic:['教務處','Academic Affairs'],department:['系所','Department'],
  cashier:['出納組','Cashier'],career:['職涯發展暨校友服務中心','Career and alumni'],advisor:['指導教授','Advisor'],thesis:['圖書館論文審核','Library thesis review'],international:['僑外陸生暨住宿服務組','International and housing services']};
export const clearanceStatuses={pending:['待審核','Pending'],cleared:['符合','Cleared'],action_required:['待補辦','Action required']};
const fields={set_clearance_period:['term_id','opens_at','closes_at','expected_version'],
  set_clearance_candidate:['term_id','user_id','track','international','expected_version'],
  submit_graduation_clearance:['term_id','period_version','candidate_version','acknowledged'],
  review_clearance_office:['application_id','office','decision','note','expected_version']};
const exact=(row,keys)=>row&&typeof row==='object'&&!Array.isArray(row)&&Object.keys(row).length===keys.length&&keys.every(key=>Object.hasOwn(row,key));
const date=(value)=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}T/u.test(value)&&Number.isFinite(Date.parse(value));
const version=(value,min=1)=>Number.isInteger(value)&&value>=min&&value<=1000000;
const track=value=>value==='undergraduate'||value==='graduate';
const note=value=>typeof value==='string'&&!value.includes('\0')&&[...value].length<=1000;
const validPeriod=(start,end)=>date(start)&&date(end)&&Date.parse(start)<Date.parse(end)&&Date.parse(end)-Date.parse(start)<=366*86400000;
export function validClearanceAction(kind,body){
  if(typeof kind!=='string'||!Object.hasOwn(fields,kind)||!exact(body,['request_id',...fields[kind]])||
    !Object.keys(body).filter(key=>key.endsWith('_id')).every(key=>uuid(body[key]))||
    !Object.keys(body).filter(key=>key.endsWith('version')).every(key=>version(body[key],key==='expected_version'?0:1)))return false;
  if(kind===clearanceSubmit)return body.acknowledged===true;
  if(kind==='set_clearance_candidate')return track(body.track)&&typeof body.international==='boolean';
  if(kind==='set_clearance_period')return validPeriod(body.opens_at,body.closes_at)&&[body.opens_at,body.closes_at].every(value=>
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/u.test(value));
  return body.expected_version>0&&Object.hasOwn(clearanceOffices,body.office)&&Object.hasOwn(clearanceStatuses,body.decision)&&
    note(body.note)&&(body.decision!=='action_required'||body.note.trim().length>0);
}
const candidate=row=>exact(row,['track','international','version'])&&track(row.track)&&typeof row.international==='boolean'&&version(row.version);
const period=row=>exact(row,['termId','term','opensAt','closesAt','version','state','candidate'])&&uuid(row.termId)&&typeof row.term==='string'&&
  validPeriod(row.opensAt,row.closesAt)&&version(row.version)&&['scheduled','open','closed'].includes(row.state)&&(row.candidate===null||candidate(row.candidate));
const review=row=>exact(row,['office','status','note','reviewedAt','version'])&&Object.hasOwn(clearanceOffices,row.office)&&Object.hasOwn(clearanceStatuses,row.status)&&
  note(row.note)&&(row.status==='pending'?row.reviewedAt===null:date(row.reviewedAt))&&version(row.version);
const application=row=>exact(row,['id','termId','term','track','submittedAt','reviews'])&&uuid(row.id)&&uuid(row.termId)&&typeof row.term==='string'&&track(row.track)&&date(row.submittedAt)&&
  Array.isArray(row.reviews)&&row.reviews.length>=5&&row.reviews.length<=8&&row.reviews.every(review)&&new Set(row.reviews.map(item=>item.office)).size===row.reviews.length;
export function parseClearance(value,userId,view,term,target){
  const selected=view==='manage'?target??null:userId;
  if(!exact(value,['userId','targetId','terms','periods','applications'])||value.userId!==userId||value.targetId!==selected||
    !Array.isArray(value.terms)||!value.terms.every(row=>exact(row,['id','label'])&&uuid(row.id)&&typeof row.label==='string')||
    !Array.isArray(value.periods)||!value.periods.every(row=>period(row)&&(view==='student'?row.candidate!==null:row.termId===term))||
    !Array.isArray(value.applications)||!value.applications.every(row=>application(row)&&(view==='student'||row.termId===term))||
    (view==='student'&&value.terms.length>0)||(view==='manage'&&!selected&&value.applications.length>0))throw new Error('Invalid graduation clearance records.');
  return value;
}
export function parseClearanceReceipt(row,kind,payload){
  const valid=kind===clearanceSubmit?exact(row,['id','termId'])&&uuid(row.id)&&row.termId===payload.term_id:
    kind==='review_clearance_office'?exact(row,['id','office','version'])&&row.id===payload.application_id&&row.office===payload.office&&row.version===payload.expected_version+1:
      exact(row,['termId','version'])&&row.termId===payload.term_id&&row.version===payload.expected_version+1;
  if(!valid)throw new Error('Invalid graduation clearance receipt.');
  return row;
}
export function clearanceQuestion(question){
  const q=question.normalize('NFKC');
  if(/password|refresh_token|access_token|another student|別人的|密碼|替我|幫我送|\bsubmit my\b/iu.test(q))return null;
  if(!/\bgraduation clearance\b|畢業離校|離校(?:申請|手續|審核)/iu.test(q))return null;
  return /\b(?:status|pending|approved|my|outstanding|history)\b|狀態|進度|紀錄|查詢|我的|還差/iu.test(q)?'status':'apply';
}

export function clearanceDirectoryAnswer(question,view,signedIn=false){
  const zh=/[\u3400-\u9fff]/u.test(question),path=clearancePaths[view];
  const url=signedIn?path:'/school-affairs/login?next='+encodeURIComponent(path);
  const destination=view==='apply'?(zh?'畢業離校申請':'Graduation clearance application'):(zh?'畢業離校進度':'Graduation clearance status');
  const title=signedIn?destination:zh?'登入校務系統': 'Sign in to School Affairs';
  const answer=signedIn?'['+title+']('+url+')':zh?'['+title+']('+url+')後，即可開啟'+destination+'。'
    :'['+title+']('+url+') to open '+destination.toLowerCase()+'.';
  return {status:signedIn?'answered':'handoff',answer,citations:[{chunkId:'directory:graduation-clearance',title,url,claim:destination,
    sourceName:'School Affairs',locator:null,effectiveAt:null,reviewedAt:null}],suggestedQuestions:[],grounding:{source:'directory',webSearched:false}};
}
