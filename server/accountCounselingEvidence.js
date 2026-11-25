import {readCounseling} from './counseling.js';
import {counselingAppointmentsPath as url,counselingDate as date,counselingScope} from './counselingContract.js';
import {selectCounselingEvidence} from './counselingEvidenceIntent.js';
export {isCounselingEvidenceQuestion} from './counselingEvidenceIntent.js';
export const counselingEvidenceMaxBytes=16000;
const nativeLimit=50;
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/iu;
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&[Object.prototype,null].includes(Object.getPrototypeOf(value))
  &&Reflect.ownKeys(value).every(key=>typeof key==='string'&&Object.hasOwn(Object.getOwnPropertyDescriptor(value,key),'value'));
const exact=(value,keys)=>object(value)&&Object.keys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key));
const dense=value=>Array.isArray(value)&&Reflect.ownKeys(value).length===value.length+1&&Array.from({length:value.length},(_,index)=>Object.getOwnPropertyDescriptor(value,index)).every(item=>item&&Object.hasOwn(item,'value'));
function instant(value){
  if(typeof value!=='string'||value.length>40)return false;
  const match=/^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,6})?(Z|[+-](\d{2}):(\d{2}))$/u.exec(value);
  return Boolean(match&&date(match[1])&&Number(match[2])<=23&&Number(match[3])<=59&&Number(match[4])<=59&&(!match[6]||Number(match[6])<=15&&Number(match[7])<=59)&&Number.isFinite(Date.parse(value)));
}
const rules=[
  'Only the authenticated caller’s saved local counseling/psychological-assessment appointment metadata is included. It is not an official university booking or synchronization claim.',
  'preferredOn and preferredPeriod are requested preferences, never a confirmed scheduled date. scheduledAt is a separate literal nullable timestamp; retain its timezone offset. Null means no scheduled timestamp is saved in that row.',
  'Status is one of requested, scheduled, cancelled or closed. A cancelled/closed row may retain an old scheduledAt; that is not a current booking. Closed does not prove attendance, treatment, a diagnosis or completion of counseling.',
  'The native mine query returns at most 50 rows. Fewer than 50 establishes the complete returned own collection; exactly 50 means the total is unknown and additional rows may exist. A capped or omitted selection cannot prove full history or absence of other appointments.',
  'No coordinator/access/queue values, row IDs, student identity, consent, contact information, clinical content, topics, results, diagnosis or files are exposed. Lookup time is not an appointment timestamp.',
  'No appointment was booked, cancelled, rescheduled, updated or deleted. No clinical or file reader or write operation was invoked. Failed or denied reads do not establish no appointments.',
].join(' ');
function reply(readState,selection,records=[],returned=null,reason=null){
  const truncated=returned===null?null:returned===nativeLimit,omitted=returned===null?null:returned-records.length;
  const payload={collection:'counselingAppointments',checkedAt:new Date().toISOString(),readState,selection,
    collectionState:returned===null?'unavailable':returned===0?'empty':'records',
    counts:{returned,included:records.length,omitted,total:returned===null||truncated?null:returned,totalLowerBound:returned,nativeLimit,truncationPossible:truncated},
    complete:returned!==null&&!truncated&&omitted===0,records,provenance:{sourceMode:'saved_local',officialUniversityData:false,synchronized:false},
    capability:{appointmentMetadata:true,identity:false,clinicalContent:false,coordinatorAccess:false,documents:false,write:false},reason,rules};
  return {readState,reason,evidence:{id:'account:counselingAppointments',title:'Saved counseling appointment metadata',url,urls:[url],provenance:'saved_local',content:JSON.stringify(payload)}};
}
export function unavailableCounselingEvidence(reason){return reply('unavailable',null,[],null,reason);}
/** Validate the shared caller-owned response before any projection. */
async function readOwnCounselingRows(account,deadlineValue,read){
  const fail=reason=>({reason,rows:[]});
  if(!object(account)||!object(account.user)||typeof account.user.id!=='string'||!uuid.test(account.user.id)||account.url!=='https://xiftudmvxphxcjtmfmib.supabase.co'
    ||typeof account.key!=='string'||!account.key.trim()||typeof account.token!=='string'||!account.token.trim())return fail('unauthorized');
  if(![deadlineValue,account.requestDeadline].every(value=>value===undefined||Number.isFinite(value)))return fail('invalid_deadline');
  const deadline=Math.min(deadlineValue??Infinity,account.requestDeadline??Infinity,Date.now()+8000);
  if(deadline<=Date.now())return fail('deadline_exceeded');
  const captured=Object.freeze({url:account.url,key:account.key,token:account.token,user:Object.freeze({id:account.user.id}),requestDeadline:deadline});
  const query=Object.freeze({scope:counselingScope,view:'mine'}),timedOut=Symbol('deadline');
  let timer;
  try{
    const value=await Promise.race([Promise.resolve().then(()=>read(captured,query)),new Promise(resolve=>{timer=setTimeout(()=>resolve(timedOut),Math.max(1,deadline-Date.now()));})]);
    if(value===timedOut||Date.now()>=deadline)return fail('deadline_exceeded');
    if(!exact(value,['userId','available','canCoordinate','rows'])||value.userId!==captured.user.id||typeof value.available!=='boolean'||typeof value.canCoordinate!=='boolean'
      ||!dense(value.rows)||value.rows.length>nativeLimit)return fail('invalid_records');
    const ids=new Set();let open=0;
    for(const row of value.rows){
      if(!exact(row,['id','kind','status','preferred_on','preferred_period','scheduled_at','version','updated_at'])||typeof row.id!=='string'||!uuid.test(row.id)||ids.has(row.id.toLowerCase())
        ||!['counseling','assessment'].includes(row.kind)||!['requested','scheduled','cancelled','closed'].includes(row.status)
        ||!date(row.preferred_on)||!['morning','afternoon'].includes(row.preferred_period)||!(row.scheduled_at===null||instant(row.scheduled_at))
        ||row.status==='scheduled'&&row.scheduled_at===null||!Number.isSafeInteger(row.version)||row.version<1||row.version>1000000||!instant(row.updated_at))return fail('invalid_records');
      ids.add(row.id.toLowerCase());if(['requested','scheduled'].includes(row.status)&&++open>1)return fail('invalid_records');
    }
    return {reason:null,rows:value.rows};
  }catch(error){return fail(error?.status===401||error?.status===403?'access_denied':'read_failed');}finally{clearTimeout(timer);}
}

/** Own mine metadata only. The answer evidence omits executable selectors. */
export async function readCounselingEvidence(account,options={},dependencies={}){
  if(!object(options)||!object(dependencies)||dependencies.read!==undefined&&typeof dependencies.read!=='function')return unavailableCounselingEvidence('invalid_options');
  const selection=selectCounselingEvidence(options.question,options.route,options.history);
  if(!selection)return unavailableCounselingEvidence('unrelated_question');
  const fail=reason=>reply('unavailable',selection,[],null,reason);
  if(selection.reason)return fail(selection.reason);if(selection.operation)return fail('unsupported_operation');
  const {reason,rows}=await readOwnCounselingRows(account,options.deadline,dependencies.read??readCounseling);
  if(reason)return fail(reason);
  const included=[];
  for(const row of rows){
    included.push({kind:row.kind,status:row.status,preferredOn:row.preferred_on,preferredPeriod:row.preferred_period,scheduledAt:row.scheduled_at});
    if(Buffer.byteLength(JSON.stringify(reply('partial',selection,included,rows.length,'excerpted')),'utf8')>counselingEvidenceMaxBytes){included.pop();break;}
  }
  return reply(rows.length===0?'empty':rows.length===nativeLimit||included.length<rows.length?'partial':'ok',
    selection,included,rows.length,included.length<rows.length?'excerpted':null);
}

const taipeiDate=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'});
/** The local confirmation graph receives only target identity, eligibility and the displayed date. */
export async function readCounselingCancellationContext(account,selection,deadline){
  const {reason,rows}=await readOwnCounselingRows(account,deadline,readCounseling);
  if(reason)throw new Error('The appointment could not be checked.');
  const selected=rows.filter(row=>row.kind===selection.appointmentKind&&(!selection.id||row.id===selection.id)
    &&(selection.id||selection.date||row.status==='requested'||row.status==='scheduled'));
  return {capped:rows.length===nativeLimit,rows:selected.map(row=>({id:row.id,kind:row.kind,status:row.status,version:row.version,
    date:row.scheduled_at===null||row.status==='requested'?row.preferred_on:taipeiDate.format(new Date(row.scheduled_at))}))
    .filter(row=>!selection.date||row.date===selection.date)};
}
