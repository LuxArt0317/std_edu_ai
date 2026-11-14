/** One caller-owned student scalar read. No initializer, identity/profile fields,
 * program/catalog read, enrollment lookup or year inference belongs here. */
import {AffairsWorkspaceError} from './affairsWorkspace.js';

export const ownAffairsStudyYearLimits=Object.freeze({rows:1,responseBytes:4096,deadlineMs:12000});
const origin='https://xiftudmvxphxcjtmfmib.supabase.co';
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&[Object.prototype,null].includes(Object.getPrototypeOf(value))
  &&Reflect.ownKeys(value).every(key=>typeof key==='string'&&Object.hasOwn(Object.getOwnPropertyDescriptor(value,key),'value'));
const exact=(value,fields)=>object(value)&&Object.keys(value).length===fields.length&&fields.every(field=>Object.hasOwn(value,field));
const uuid=value=>typeof value==='string'&&/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/u.test(value);
const fail=(message='The saved study year could not be verified.',status=503)=>{throw new AffairsWorkspaceError(message,status);};
const cancel=response=>{void response?.body?.cancel().catch(()=>{});};

async function boundedJson(response,signal){
  if(!response.body||Number(response.headers.get('content-length'))>ownAffairsStudyYearLimits.responseBytes){cancel(response);fail();}
  const reader=response.body.getReader(),decoder=new TextDecoder('utf-8',{fatal:true});let size=0,json='';
  const abort=()=>{void reader.cancel().catch(()=>{});};signal.addEventListener('abort',abort,{once:true});
  try{
    while(true){
      if(signal.aborted)fail();
      const {done,value}=await reader.read();
      if(signal.aborted)fail();
      if(done)return JSON.parse(json+decoder.decode());
      size+=value.byteLength;if(size>ownAffairsStudyYearLimits.responseBytes)fail();
      json+=decoder.decode(value,{stream:true});
    }
  }catch{void reader.cancel().catch(()=>{});fail();}finally{signal.removeEventListener('abort',abort);reader.releaseLock();}
}

/** Existing verified caller JWT only. A successful absence returns null;
 * denied/failed/malformed/duplicate reads throw and must not be called absence. */
export async function loadOwnAffairsStudyYear(account,options={},dependencies={}){
  if(!object(options)||Object.keys(options).some(key=>key!=='deadline')||!object(dependencies)||Object.keys(dependencies).some(key=>key!=='fetchImpl')
    ||dependencies.fetchImpl!==undefined&&typeof dependencies.fetchImpl!=='function')fail('Invalid study year read options.');
  if(!object(account)||!object(account.user)||!uuid(account.user.id)||account.url!==origin
    ||typeof account.key!=='string'||!account.key.trim()||typeof account.token!=='string'||!account.token.trim()
    ||/\p{Cc}/u.test(account.key+account.token))fail('Verified School Affairs access is required.',403);
  if(![options.deadline,account.requestDeadline].every(value=>value===undefined||Number.isFinite(value)))fail('Invalid study year read deadline.');
  const captured=Object.freeze({userId:account.user.id,key:account.key,token:account.token,
    deadline:Math.min(options.deadline??Infinity,account.requestDeadline??Infinity,Date.now()+ownAffairsStudyYearLimits.deadlineMs)});
  const fetchImpl=dependencies.fetchImpl??globalThis.fetch;
  if(typeof fetchImpl!=='function')fail();
  const remaining=captured.deadline-Date.now();if(remaining<=0)fail('The saved study year read deadline expired.');
  const target=new URL('/rest/v1/affairs_students',origin);
  target.searchParams.set('select','user_id,year_level,source_mode');target.searchParams.set('user_id','eq.'+captured.userId);target.searchParams.set('limit','1');
  const controller=new AbortController();let timer;
  try{
    return await Promise.race([
      Promise.resolve().then(async()=>{
        if(controller.signal.aborted||Date.now()>=captured.deadline)fail('The saved study year read deadline expired.');
        const response=await fetchImpl(target,{method:'GET',redirect:'error',headers:{apikey:captured.key,Authorization:'Bearer '+captured.token,Prefer:'count=exact'},signal:controller.signal});
        if(controller.signal.aborted||Date.now()>=captured.deadline){cancel(response);fail('The saved study year read deadline expired.');}
        if(!response.ok){cancel(response);fail('The saved study year read was not available.',[401,403].includes(response.status)?403:503);}
        if(![200,206].includes(response.status)){cancel(response);fail();}
        const rows=await boundedJson(response,controller.signal);
        if(controller.signal.aborted||Date.now()>=captured.deadline)fail('The saved study year read deadline expired.');
        if(!Array.isArray(rows)||rows.length>1||response.headers.get('content-range')!==(rows.length?'0-0/1':'*/0'))fail();
        const row=rows[0];
        if(row&&(!exact(row,['user_id','year_level','source_mode'])||row.user_id!==captured.userId
          ||!Number.isInteger(row.year_level)||row.year_level<1||row.year_level>8||!['sample','verified'].includes(row.source_mode)))fail();
        if(rows.length&&!row)fail();
        return {profile:{userId:captured.userId},checkedAt:new Date().toISOString(),source:'stu.best School Affairs',officialUniversityData:false,
          studentRecordFound:rows.length===1,student:row?{yearLevel:row.year_level,sourceMode:row.source_mode}:null};
      }),
      new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(new AffairsWorkspaceError('The saved study year read deadline expired.'));},remaining);}),
    ]);
  }catch(error){if(error instanceof AffairsWorkspaceError)throw error;fail();}finally{clearTimeout(timer);}
}
