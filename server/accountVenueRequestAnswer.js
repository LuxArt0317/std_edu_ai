import {isDeepStrictEqual} from 'node:util';
import {runAnswerVerification} from './answerVerification.js';
import {readFeeRemissionJson} from './feeRemissionContract.js';
import {venueRequestPlan} from './venueRequestIntent.js';
import {loadOwnAffairsCharges} from './affairsWorkspace.js';
import {accountEvidence} from './answerVerificationAccount.js';
import {formatSelectedChargeEvidence,selectedChargeAnswerLimits} from './selectedChargeEvidenceAnswer.js';
import {venueDate,venuePaths,venuePeriods} from '../src/features/public/affairs/venueContract.js';

const sourceId='account:venueRequests';
const origin='https://xiftudmvxphxcjtmfmib.supabase.co';
const uuid=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/u;
const columns=['id','user_id','venue','booking_date','period','status','created_at'];
const labels={submitted:['Submitted','已送出'],approved:['Approved','已核准'],declined:['Declined','未核准'],cancelled:['Cancelled','已取消']};
const periodTimes=new Map(venuePeriods);
const formatter=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
const deadlineError=()=>new Error('Venue request evidence is unavailable.');
const hasColumns=row=>row!==null&&typeof row==='object'&&!Array.isArray(row)&&Object.keys(row).length===columns.length&&columns.every(key=>Object.hasOwn(row,key));

function instant(value){
  if(typeof value!=='string')return null;
  const match=/^(20\d\d-\d\d-\d\d)T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.(\d{1,6}))?(?:Z|[+-]\d\d:\d\d)$/u.exec(value);
  const parsed=Date.parse(value);
  if(!match||!venueDate(match[1])||!Number.isFinite(parsed))return null;
  return BigInt(parsed)*1000n+BigInt((match[2]??'').padEnd(6,'0').slice(3));
}

async function readVenueEvidence({user:{id:owner},key,token,url},selection,deadline,observation){
  if(typeof owner!=='string'||!uuid.test(owner)||url!==origin||typeof key!=='string'||!key.trim()
    ||typeof token!=='string'||!token.trim()||!Number.isFinite(deadline))throw deadlineError();
  const limit=selection.countOnly||selection.id||selection.latest?1:12;
  const target=new URL('/rest/v1/affairs_venue_requests',origin);
  const query={select:columns.join(','),user_id:'eq.'+owner,
    ...(selection.id?{id:'eq.'+selection.id}:{}),...(selection.room?{venue:'eq.'+selection.room}:{}),
    ...(selection.period?{period:'eq.'+selection.period}:{}),...(selection.status?{status:'eq.'+selection.status}:{}),
    order:'created_at.desc,id.asc',limit:String(limit)};
  const dates=[...(selection.range?.from?['booking_date.gte.'+selection.range.from]:[]),
    ...(selection.range?.through?['booking_date.lte.'+selection.range.through]:[])];
  if(dates.length)query.and='('+dates.join(',')+')';
  target.search=new URLSearchParams(query).toString();
  const remaining=deadline-Date.now();
  if(remaining<=0)throw deadlineError();
  const response=await fetch(target,{method:'GET',redirect:'error',signal:AbortSignal.timeout(Math.min(6500,remaining)),
    headers:{apikey:key,Authorization:'Bearer '+token,Prefer:'count=exact'}});
  const range=/^(?:(\d+)-(\d+)|\*)\/(\d+)$/u.exec(response.headers.get('content-range')??'');
  const total=Number(range?.[3]);
  if(![200,206].includes(response.status)||!Number.isSafeInteger(total)||total<0||selection.id&&total>1){
    void response.body?.cancel().catch(()=>{});
    throw deadlineError();
  }
  const rows=await readFeeRemissionJson(response);
  if(Date.now()>=deadline||!Array.isArray(rows)||rows.length!==Math.min(limit,total)
    ||(rows.length?Number(range[1])!==0||Number(range[2])!==rows.length-1:range[1]!==undefined))throw deadlineError();
  const seen=new Set(),results=[];
  let previous;
  for(const row of rows){
    if(!hasColumns(row))throw deadlineError();
    const recorded=instant(row.created_at);
    if(row.user_id!==owner||typeof row.id!=='string'||!uuid.test(row.id)||seen.has(row.id)
      ||typeof row.venue!=='string'||!/^[A-Z0-9-]{2,10}$/u.test(row.venue)||!venueDate(row.booking_date)
      ||!periodTimes.has(row.period)||!Object.hasOwn(labels,row.status)||recorded===null
      ||selection.id&&row.id!==selection.id||selection.room&&row.venue!==selection.room
      ||selection.period&&row.period!==selection.period||selection.status&&row.status!==selection.status
      ||selection.range?.from&&row.booking_date<selection.range.from||selection.range?.through&&row.booking_date>selection.range.through
      ||previous&&(recorded>previous.recorded||recorded===previous.recorded&&row.id<=previous.id))throw deadlineError();
    previous={recorded,id:row.id};
    seen.add(row.id);
    if(!selection.countOnly)results.push({venue:row.venue,date:row.booking_date,period:row.period,status:row.status,
      ...(selection.submittedAt?{submittedAt:row.created_at}:{})});
  }
  const evidence={sourceId,selection,total,rows:results};
  observation?.record({method:'GET',url:target.href,ownerId:owner,total,rows},evidence);
  return {...evidence,checkedAt:new Date().toISOString()};
}

function reply(question,selection,evidence){
  const saved=evidence[0];
  if(evidence.length!==1||saved?.sourceId!==sourceId||!isDeepStrictEqual(saved.selection,selection))throw deadlineError();
  const zh=/\p{Script=Han}/u.test(question),say=(en,cn)=>zh?cn:en;
  const title=say('Open my venue requests','開啟我的場地申請'),url=venuePaths.apply;
  const {rows,total,checkedAt}=saved;
  const heading=[say('Room','場地'),say('Booking date','借用日期'),say('Period','節次'),say('Saved local status','站內申請狀態'),
    ...(selection.submittedAt?[say('Submitted at (Taipei time)','送出時間（臺北時間）')]:[])];
  const cells=rows.map(row=>[row.venue,row.date,row.period+' ('+periodTimes.get(row.period)+')',labels[row.status][zh?1:0],
    ...(selection.submittedAt?[formatter.format(new Date(row.submittedAt))]:[])]);
  const local=say('These are stu.best request records. A saved status does not confirm a university booking or room availability.',
    '這些是 stu.best 的場地申請紀錄，站內狀態無法確認校方借用結果或場地可用性。');
  const lines=[total?say('Matching saved venue requests: ','相符的站內場地申請筆數：')+total+'.'
    :say('No saved venue requests match this lookup.','沒有相符的站內場地申請。')];
  if(cells.length===1)lines.push(cells[0].map((value,index)=>heading[index]+': '+value).join(' · '));
  if(selection.latest&&rows.length)lines.push(say('Showing the latest request by its saved submission time.','依儲存的送出時間顯示最新一筆申請。'));
  else if(!selection.countOnly&&rows.length<total)lines.push(say('Showing '+rows.length+' of '+total+' matching requests.','顯示 '+total+' 筆中的 '+rows.length+' 筆。'));
  lines.push(local,'['+title+']('+url+')');
  return {status:'answered',answer:lines.join('\n\n'),
    citations:[{chunkId:sourceId,title,url,claim:say('Caller-owned venue request metadata','本人站內場地申請紀錄'),sourceName:'School Affairs',
      locator:null,effectiveAt:null,reviewedAt:checkedAt}],
    suggestedQuestions:[],grounding:{source:'account',webSearched:false,checkedAt},
    ...(rows.length>1?{views:[{id:'venue-requests',title:say('Saved venue requests','已儲存的場地申請'),url,columns:heading,
      rows:cells,total,checkedAt,note:local}]}:{})};
}

function pairReply(question,plan,evidence){
  const zh=/\p{Script=Han}/u.test(question);
  const venue=evidence.venue?reply(question,plan.selection,[evidence.venue]):null;
  if(!plan.feeQuestion)return venue;
  const fees=evidence.fees?formatSelectedChargeEvidence(evidence.fees,{language:zh?'zh-TW':'en'}):null;
  if(!venue&&!fees)return null;
  const venueMissing=zh?'目前無法查核你的場地申請紀錄。':'I couldn’t verify your saved venue requests.';
  const feeMissing=zh?'目前無法查核你的待繳費用。':'I couldn’t verify your saved fee balance.';
  const [first,second]=plan.feeFirst?[[fees,feeMissing],[venue,venueMissing]]:[[venue,venueMissing],[fees,feeMissing]];
  const sections=[first,second];
  const citations=sections.flatMap(([item])=>item?.citations??[]);
  const views=sections.flatMap(([item])=>item?.views??[]);
  const full=sections.map(([item,missing])=>item?.answer??missing).join('\n\n');
  const budget=selectedChargeAnswerLimits.answerCharacters;
  const feeLink=zh?'請在已儲存的費用頁面查看完整資料。':'Open the saved fee records for the full amount breakdown.';
  const answer=full.length<=budget?full:sections.map(([item,missing])=>item===fees&&fees?feeLink:item?.answer??missing).join('\n\n');
  return {status:'answered',answer,citations,suggestedQuestions:[],views,
    grounding:{source:'account',webSearched:false,checkedAt:venue?.grounding.checkedAt??JSON.parse(evidence.fees.content).checkedAt,
      ...(!venue||!fees?{degraded:true}:{})}};
}

export async function answerVenueRequests({account,plan,question,route,history,asOf,deadline,onProgress,observation}){
  const expected=venueRequestPlan(question,route,history,asOf);
  if(!expected||expected.selection.reason||!isDeepStrictEqual(plan,expected))throw deadlineError();
  const {url,key,token,user}=account;
  const caller=Object.freeze({url,key,token,user:Object.freeze({id:user.id})});
  const activity=[];
  const progress=step=>{
    const index=activity.findIndex(item=>item.kind===step.kind);
    if(index<0)activity.push(step);
    else activity[index]=step;
    try{onProgress?.(step);}catch{/* The client may disconnect. */}
  };
  const evidence={venue:null,fees:null};
  const loadFees=async()=>{
    const snapshot=await loadOwnAffairsCharges(caller,{deadline});
    const source=accountEvidence(snapshot,['charges'],{question:expected.feeQuestion,route:'/school-affairs/services/39-1',scopedReadOnly:true})
      .find(item=>item.id==='account:charges');
    // Validate the independent amount evidence before treating this source as healthy.
    formatSelectedChargeEvidence(source);
    return source;
  };
  const read=async attempt=>{
    const load=async (key,tool,label,reader)=>{
      if(evidence[key])return;
      evidence[key]=await reader().catch(()=>null);
      progress({kind:'account-read:'+tool+':'+attempt,label,status:evidence[key]?'complete':'unavailable',
        detail:evidence[key]?'Checked the selected records under this signed-in account.':'The selected records could not be read.'});
    };
    await Promise.all([
      load('venue','venueRequests','Checked saved venue requests',()=>readVenueEvidence(caller,expected.selection,deadline,observation)),
      ...(expected.feeQuestion?[load('fees','charges','Checked saved fee balance',loadFees)]:[]),
    ]);
    return {...evidence};
  };
  const first=await read(1);
  const format=result=>pairReply(question,expected,result);
  const initial=format(first)??{status:'abstained',answer:'',citations:[],grounding:{source:'account',webSearched:false}};
  let attempt=1;
  const result=await runAnswerVerification({
    question,initialAnswer:initial,deadline,onProgress:progress,
    loadEvidence:async({attempt:next})=>{attempt=next;return attempt===1?first:read(attempt);},
    verify:async({candidate,evidence:active})=>{
      const supported=format(active);
      if(!supported||attempt===1&&expected.feeQuestion&&(!active.venue||!active.fees))
        return {ok:false,reason:'evidence_unavailable'};
      const matches=isDeepStrictEqual(candidate,supported);
      if(matches)observation?.nativeVerified();
      return {ok:matches};
    },
    repair:async({evidence:active})=>format(active)??initial,
  });
  // Verification of a supported section cannot certify the failed section.
  if(expected.feeQuestion&&result.verification?.status==='verified'&&(!evidence.venue||!evidence.fees)){
    const scope=evidence.venue?'fees':'venue';
    return {...result,activity,verification:{status:'unverified',attempts:result.verification.attempts,reason:scope+'_evidence_unavailable'}};
  }
  return {...result,activity};
}
