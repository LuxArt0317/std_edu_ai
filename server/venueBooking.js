import {load} from 'cheerio';
import {readSchoolHtml} from './readSchoolHtml.js';
import {readFeeRemissionJson} from './feeRemissionContract.js';
import {AffairsWorkspaceError,schoolAffairsDatabaseConfiguration} from './affairsWorkspace.js';
import {moveVenueDate,venueCode,venueDate,venuePaths,venuePeriods,venueWeek} from '../src/features/public/affairs/venueContract.js';

const source='https://info.stu.edu.tw/SWD/placeborrow/qryClassroomAtLoginPage.asp';
const lookup=new URL('ajax/GetPlaceData.asp',source).href;
const tidy=text=>text.replace(/\s+/gu,' ').trim();
const slotPattern=/^T[1-7][M1-4N5-8EABCD]$/;
const invalid=()=>new AffairsWorkspaceError('請檢查場地或日期。',400);
export const venueActions=['submit_venue_request','cancel_venue_request','review_venue_request'];

async function sourceSession(fetchSource,signal) {
  const response=await fetchSource(source,{redirect:'error',signal});
  const cookies=response.headers.getSetCookie().map(value=>value.split(';',1)[0]).join('; ');
  const html=await readSchoolHtml(response);
  const $=load(html);
  const csrf=$('input[name="CSRF_TOKEN"]').val();
  const type=html.match(/"ajaxType":\s*"([A-Za-z0-9+/=]{5,120})"/)?.[1];
  if(typeof csrf!=='string'||!/^\d{3,30}$/.test(csrf)||!type)throw Error('Venue source changed.');
  const send=(url,fields)=>fetchSource(url,{method:'POST',body:new URLSearchParams(fields),
    headers:{Cookie:cookies,Referer:source,'X-Requested-With':'XMLHttpRequest'},redirect:'error',signal});
  return {csrf,type,send};
}

async function sourceVenues(session,term){
  const result=await session.send(lookup,{ajaxType:session.type,term});
  if(!result.ok)throw Error('Venue lookup unavailable.');
  const rows=await readFeeRemissionJson(result);
  if(!Array.isArray(rows)||rows.length>500)throw Error('Invalid venue list.');
  const seen=new Set();
  return rows.flatMap(item=>{
    if(!venueCode(item?.value)||typeof item.label!=='string'||typeof item.sname!=='string'||
      !item.label.startsWith(item.value+' ')||item.label.length>200||item.sname.length>200||seen.has(item.value))return [];
    seen.add(item.value);
    return [{code:item.value,label:tidy(item.label),description:tidy(item.sname)}];
  }).slice(0,40);
}

export function parseVenueWeek(html,code,week){
  const $=load(html),table=$('#tblOfficeHour');
  const titles=$('script').toArray().flatMap(script=>[...$(script).text().matchAll(/\$\('#classroomTitle'\)\.html\(\s*'場地[:：]\s*([A-Z0-9-]{2,10})\s+-/g)].map(match=>match[1]));
  const dates=table.find('thead tr').eq(1).find('th').slice(1).map((_,cell)=>{
    const parts=tidy($(cell).text()).split('/');
    return parts.length===3?parts[0]+'-'+parts[1].padStart(2,'0')+'-'+parts[2].padStart(2,'0'):'';
  }).get();
  const rows=table.children('tbody').children('tr').toArray();
  if(table.length!==1||titles.length!==1||titles[0]!==code||
    dates.length!==7||dates.some((date,i)=>date!==moveVenueDate(week,i))||rows.length!==15)throw Error('Unexpected venue schedule.');
  const occupied=[];
  rows.forEach((row,index)=>{
    const cells=$(row).children('td').toArray();
    const period=venuePeriods[index][0];
    if(cells.length!==7||tidy($(row).children('th').text())!==period+' ('+venuePeriods[index][1]+')')throw Error('Invalid venue periods.');
    cells.forEach((cell,day)=>{
      const id='T'+(day+1)+period;
      if($(cell).attr('id')!==id)throw Error('Invalid venue schedule cell.');
      if(tidy($(cell).text())||$(cell).find('img,[title]').length)occupied.push(id);
    });
  });
  return occupied;
}

async function database(path,{method='GET',body,account,writer=false}={}){
  const {url,key}=account??schoolAffairsDatabaseConfiguration();
  const apiKey=writer?(process.env.SUPABASE_SECRET_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY):key;
  if(!apiKey)throw new AffairsWorkspaceError('Venue storage unavailable.');
  const token=account?.token||(apiKey.startsWith('eyJ')?apiKey:null);
  const response=await fetch(url+'/rest/v1/'+path,{method,redirect:'error',signal:AbortSignal.timeout(6500),headers:{
    apikey:apiKey,...(token?{Authorization:'Bearer '+token}:{}),...(body?{'Content-Type':'application/json'}:{}),
    ...(writer?{Prefer:'resolution=merge-duplicates,return=minimal'}:{})},...(body?{body:JSON.stringify(body)}:{})});
  if(!response.ok){
    void response.body?.cancel().catch(()=>{});
    const status=[400,401,403,404,409].includes(response.status)?response.status:503;
    throw new AffairsWorkspaceError(status===409?'時段已更新或已有申請。請重新查詢。':'場地資料暫時無法處理。',status);
  }
  return writer?null:readFeeRemissionJson(response);
}

async function refreshVenueWeek(code,week,fetchSource){
  const session=await sourceSession(fetchSource,AbortSignal.timeout(9000));
  const selected=(await sourceVenues(session,code)).find(row=>row.code===code);
  if(!selected)throw new AffairsWorkspaceError('找不到場地。',404);
  const sourceDate=date=>date.replaceAll('-','/').replace(/\/0/g,'/');
  const result=await session.send(source,{place:code,placeComment:selected.description,
    hidStartDate:sourceDate(week),hidEndDate:sourceDate(moveVenueDate(week,6)),CSRF_TOKEN:session.csrf});
  const occupied=parseVenueWeek(await readSchoolHtml(result),code,week);
  const value={venue:code,week,label:selected.label,description:selected.description,occupied,checked_at:new Date().toISOString()};
  await database('affairs_venue_weeks?on_conflict=venue,week',{method:'POST',writer:true,body:value});
  return value;
}

const pending=new Map();
export async function readVenueWeek(code,week,{fetchSource=fetch}={}){
  if(!venueCode(code)||!venueDate(week)||venueWeek(week)!==week||Math.abs(Date.parse(week)-Date.parse(venueWeek()))>370*86400000)throw invalid();
  const key=code+'|'+week;
  const query=new URLSearchParams({venue:'eq.'+code,week:'eq.'+week,limit:'1'});
  const saved=(await database('affairs_venue_weeks?'+query))[0];
  let row=saved;
  if(!saved||Date.now()-Date.parse(saved.checked_at)>15*60000){
    if(!pending.has(key)&&pending.size<8)pending.set(key,refreshVenueWeek(code,week,fetchSource).finally(()=>pending.delete(key)));
    const refresh=pending.get(key);
    if(!refresh&&!saved)throw new AffairsWorkspaceError('場地查詢忙碌中。');
    try{if(refresh)row=await refresh;}catch(error){if(!saved)throw error;}
  }
  const checkedAt=Date.parse(row?.checked_at);
  if(!row||row.venue!==code||row.week!==week||!Number.isFinite(checkedAt)||!Array.isArray(row.occupied)||row.occupied.some(slot=>!slotPattern.test(slot)))throw Error('Invalid saved venue schedule.');
  const local=await database('rpc/affairs_venue_approved_slots',{method:'POST',body:{p_venue:code,p_week:week}});
  if(!Array.isArray(local)||local.some(slot=>!slotPattern.test(slot)))throw Error('Invalid approved venue slots.');
  return {...row,checked_at:new Date(checkedAt).toISOString(),local,fresh:Date.now()-checkedAt<=30*60000};
}

export async function serveVenue(request,response){
  response.setHeader('Cache-Control','no-store');
  response.setHeader('X-Content-Type-Options','nosniff');
  if(request.method!=='GET'){response.setHeader('Allow','GET');response.status(405).json({error:'Method not allowed.'});return;}
  const {scope,term,code,week,...extra}=request.query??{};
  try{
    if(Object.keys(extra).length)throw invalid();
    if(scope==='venue-search'&&typeof term==='string'&&/^[\p{L}\p{N} -]{2,10}$/u.test(term.trim())&&code===undefined&&week===undefined){
      const session=await sourceSession(fetch,AbortSignal.timeout(9000));
      response.status(200).json({venues:await sourceVenues(session,term.trim())});return;
    }
    if(scope==='venue-schedule'&&term===undefined&&venueCode(code)&&venueDate(week)){
      response.status(200).json(await readVenueWeek(code,week));return;
    }
    throw invalid();
  }catch(error){
    const status=error instanceof AffairsWorkspaceError?error.status:503;
    response.status(status).json({error:error instanceof AffairsWorkspaceError?error.message:'場地時段暫時無法查詢。'});
  }
}

const uuid=value=>typeof value==='string'&&/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(value);
export async function readVenueRequests(account,query){
  const {scope,view,answer,...extra}=query;
  if(scope!=='venue-requests'||!['mine','manage'].includes(view)||Object.keys(extra).length||
    (answer!==undefined&&(view!=='mine'||!['en','zh'].includes(answer))))throw invalid();
  const rows=await database('rpc/affairs_read_venue_requests',{method:'POST',account,body:{p_manage:view==='manage'}});
  if(!Array.isArray(rows)||(view==='mine'&&rows.some(row=>row.user_id!==account.user.id)))throw Error('Invalid venue requests.');
  if(!answer)return {userId:account.user.id,rows};
  const zh=answer==='zh',titles={submitted:'已送出',approved:'已核准',declined:'未核准',cancelled:'已取消'};
  const lines=rows.slice(0,10).map(row=>`- ${row.venue} · ${row.booking_date} · ${row.period} · ${zh?titles[row.status]:row.status}`);
  const text=lines.length?lines.join('\n'):(zh?'沒有已儲存的站內場地申請。':'You have no saved venue requests on stu.best.');
  return {status:'answered',answer:text+`\n\n[${zh?'我的場地申請':'My venue requests'}](${venuePaths.apply})`,
    citations:[],suggestedQuestions:[],grounding:{source:'account',webSearched:false},
    activity:[{kind:'venue-booking',label:'Checked your venue requests',detail:zh?'已查詢站內申請。':'Read your saved request statuses.',status:'complete'}]};
}

export async function changeVenueRequest(account,action,payload){
  const keys=action==='submit_venue_request'?['request_id','venue','booking_date','period','purpose','confirmed']:
    action==='cancel_venue_request'?['request_id','id','version']:['request_id','id','version','status','note'];
  if(!venueActions.includes(action)||!payload||typeof payload!=='object'||Array.isArray(payload)||
    Object.keys(payload).length!==keys.length||!keys.every(key=>Object.hasOwn(payload,key))||!uuid(payload.request_id))throw invalid();
  if(action==='submit_venue_request'){
    if(!venueCode(payload.venue)||!venueDate(payload.booking_date)||!venuePeriods.some(([period])=>period===payload.period)||
      typeof payload.purpose!=='string'||!payload.purpose.trim()||[...payload.purpose].length>600||payload.confirmed!==true)throw invalid();
  }else if(!uuid(payload.id)||!Number.isInteger(payload.version)||payload.version<1||payload.version>3||
    (action==='review_venue_request'&&(!['approved','declined'].includes(payload.status)||typeof payload.note!=='string'||[...payload.note].length>600)))throw invalid();
  return database('rpc/affairs_change_venue_request',{method:'POST',account,body:{p_action:action,p_payload:payload}});
}

export async function answerVenue(question,selection){
  const zh=/[\u3400-\u9fff]/u.test(question);
  const title=zh?'場地借用':'Venue booking';
  let answer,url=venuePaths[selection.view==='apply'?'apply':'schedule'],status='answered';
  if(selection.view==='mine'){
    url='/school-affairs/login?next='+encodeURIComponent(venuePaths.apply);
    answer=zh?'登入後可查詢自己的場地申請。':'Sign in to see your own venue requests.';
    status='handoff';
  }else if(selection.view==='apply'){
    answer=zh?'請先查詢場地和時段，再送出 stu.best 場地申請。':'Check the room and period, then submit a stu.best venue request.';
  }else if(selection.code&&selection.date){
    const week=venueWeek(selection.date);
    url=venuePaths.schedule+'?'+new URLSearchParams({code:selection.code,week});
    try{
      const data=await readVenueWeek(selection.code,week);
      if(!data.fresh)throw Error('Stale schedule.');
      const day=Math.round((Date.parse(selection.date)-Date.parse(week))/86400000)+1;
      const occupied=new Set([...data.occupied,...data.local]);
      const free=venuePeriods.filter(([period])=>!occupied.has('T'+day+period)).map(([period,time])=>period+' ('+time+')');
      const label=zh?'未顯示占用時段':'Periods with no recorded occupancy';
      answer=`${selection.code} · ${selection.date}\n\n${label}: ${free.join(', ')||(zh?'無':'none')}.`;
    }catch{answer=zh?'目前無法確認場地時段。':'The room schedule could not be confirmed.';status='handoff';}
  }else{
    if(selection.code)url=venuePaths.schedule+'?'+new URLSearchParams({code:selection.code,week:venueWeek()});
    answer=zh?'輸入場地代碼即可查詢每週使用狀況。':'Enter a room code to see its weekly schedule. Include an ISO date to check a specific day.';
  }
  return {status,answer:answer+`\n\n[${title}](${url})`,citations:[],suggestedQuestions:[],
    grounding:{source:'directory',webSearched:false},
    activity:[{kind:'venue-booking',label:'Checked venue booking',detail:title,status:status==='answered'?'complete':'unavailable'}]};
}
