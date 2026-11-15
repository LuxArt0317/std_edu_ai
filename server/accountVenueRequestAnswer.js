import {isDeepStrictEqual} from 'node:util';
import {runAnswerVerification} from './answerVerification.js';
import {readFeeRemissionJson} from './feeRemissionContract.js';
import {venueRequestSelection} from './venueRequestIntent.js';
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

async function readVenueEvidence({user:{id:owner},key,token,url},selection,deadline){
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
  return {sourceId,selection,total,rows:results,checkedAt:new Date().toISOString()};
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

export async function answerVenueRequests({account,selection,question,route,history,asOf,deadline,onProgress}){
  const expected=venueRequestSelection(question,route,history,asOf);
  if(!expected||expected.reason||!isDeepStrictEqual(selection,expected))throw deadlineError();
  const {url,key,token,user}=account;
  const caller=Object.freeze({url,key,token,user:Object.freeze({id:user.id})});
  const activity=[];
  const progress=step=>{
    const index=activity.findIndex(item=>item.kind===step.kind);
    if(index<0)activity.push(step);
    else activity[index]=step;
    try{onProgress?.(step);}catch{/* The client may disconnect. */}
  };
  const read=async attempt=>{
    const saved=await readVenueEvidence(caller,expected,deadline).catch(()=>null);
    progress({kind:'account-read:venueRequests:'+attempt,label:'Checked saved venue requests',status:saved?'complete':'unavailable',
      detail:saved?'Checked the selected requests under this signed-in account.':'The selected requests could not be read.'});
    return saved?[saved]:[];
  };
  const first=await read(1);
  const format=result=>reply(question,expected,result);
  const initial=first.length?format(first):{status:'abstained',answer:'',citations:[],grounding:{source:'account',webSearched:false}};
  const result=await runAnswerVerification({
    question,initialAnswer:initial,deadline,onProgress:progress,
    loadEvidence:async({attempt})=>attempt===1?first:read(attempt),
    verify:async({candidate,evidence})=>evidence.length
      ?{ok:isDeepStrictEqual(candidate,format(evidence))}:{ok:false,reason:'evidence_unavailable'},
    repair:async({evidence})=>evidence.length?format(evidence):initial,
  });
  return {...result,activity};
}
