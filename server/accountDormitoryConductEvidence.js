import {loadDormitoryConduct,dormitoryConductPath} from './dormitoryConduct.js';
import {selectDormitoryConductEvidence} from './dormitoryConductEvidenceIntent.js';
export {isDormitoryConductEvidenceQuestion} from './dormitoryConductEvidenceIntent.js';

export const dormitoryConductEvidenceMaxBytes=6000;
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/iu;
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&[Object.prototype,null].includes(Object.getPrototypeOf(value))
  &&Reflect.ownKeys(value).every(key=>typeof key==='string'&&Object.hasOwn(Object.getOwnPropertyDescriptor(value,key),'value'));
const exact=(value,keys)=>object(value)&&Object.keys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key));
const rules=[
  'This is only the signed-in caller’s saved local_demo dormitory-conduct notice metadata at service 34-2, separate from housing beds/applications and general student conduct at 38-1.',
  'A saved result empty means this local notice explicitly says empty. It does not prove an official university clear record, eligibility, absence of misconduct or lack of historical events.',
  'A saved result unknown is explicitly unknown. A missing metadata record is not a saved empty result. A failed or denied read proves neither missing metadata nor an empty conduct record.',
  'No detailed conduct entries, reasons, dates, penalties, official clearance, downloadable document or certificates are available from this source. Do not substitute housing or general conduct facts.',
  'No account identity, admin metadata, editing version, authorization change or write is exposed or performed.',
].join(' ');
function reply(readState,selection,metadataState='unavailable',record=null,reason=null){
  const payload={collection:'dormitoryConduct',checkedAt:new Date().toISOString(),readState,selection,metadataState,
    provenance:{sourceMode:'local_demo',officialUniversityData:false,synchronized:false},
    counts:{metadataRecords:metadataState==='unavailable'?null:metadataState==='missing'?0:1},record,
    capability:{readNotice:true,detailedEntries:false,officialClearance:false,document:false,write:false},reason,rules};
  return {readState,reason,evidence:{id:'account:dormitoryConduct',title:'Saved dormitory-conduct notice',url:dormitoryConductPath,
    urls:[dormitoryConductPath],provenance:'local_demo',content:JSON.stringify(payload)}};
}
export function unavailableDormitoryConductEvidence(reason){return reply('unavailable',null,'unavailable',null,reason);}

/** Fixed personal reader, never the admin target-user or mutation APIs. */
export async function readDormitoryConductEvidence(account,options={},dependencies={}){
  if(!object(options)||!object(dependencies))return unavailableDormitoryConductEvidence('invalid_options');
  const selection=selectDormitoryConductEvidence(options.question,options.route,options.history);
  if(!selection)return unavailableDormitoryConductEvidence('unrelated_question');
  const fail=reason=>reply('unavailable',selection,'unavailable',null,reason);
  if(selection.reason)return fail(selection.reason);
  if(selection.operation)return fail('unsupported_operation');
  if(!object(account)||!object(account.user)||typeof account.user.id!=='string'||!uuid.test(account.user.id)||account.url!=='https://xiftudmvxphxcjtmfmib.supabase.co'
    ||typeof account.key!=='string'||!account.key.trim()||typeof account.token!=='string'||!account.token.trim())return fail('unauthorized');
  if(![options.deadline,account.requestDeadline].every(value=>value===undefined||Number.isFinite(value)))return fail('invalid_deadline');
  const deadline=Math.min(options.deadline??Infinity,account.requestDeadline??Infinity,Date.now()+8000);
  if(deadline<=Date.now())return fail('deadline_exceeded');
  const captured=Object.freeze({url:account.url,key:account.key,token:account.token,user:Object.freeze({id:account.user.id}),requestDeadline:deadline});
  const read=dependencies.load??loadDormitoryConduct,timedOut=Symbol('deadline');let timer;
  try{
    const value=await Promise.race([Promise.resolve().then(()=>read(captured)),new Promise(resolve=>{timer=setTimeout(()=>resolve(timedOut),Math.max(1,deadline-Date.now()));})]);
    if(value===timedOut||Date.now()>=deadline)return fail('deadline_exceeded');
    if(!exact(value,['snapshot']))return fail('invalid_records');
    if(value.snapshot===null)return reply('ok',selection,'missing',null);
    const row=value.snapshot;
    if(!exact(row,['userId','sourceMode','version','result'])||row.userId!==captured.user.id||row.sourceMode!=='local_demo'
      ||!Number.isSafeInteger(row.version)||row.version<1||row.version>999999999||!['empty','unknown'].includes(row.result))return fail('invalid_records');
    return reply('ok',selection,'saved',{result:row.result});
  }catch(error){return fail(error?.status===401||error?.status===403?'access_denied':'read_failed');}
  finally{clearTimeout(timer);}
}
