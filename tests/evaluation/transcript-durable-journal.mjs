/** Private local commitments only. No network, credentials, raw transcript,
 * automatic replay, recovery writer or claim of remote quiescence. */
import {createHash,randomUUID} from 'node:crypto';
import {constants} from 'node:fs';
import {lstat,mkdir,open,realpath,rename} from 'node:fs/promises';
import {dirname,isAbsolute,join,resolve} from 'node:path';

const uuid=value=>typeof value==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u.test(value);
const sha=(value,length=64)=>typeof value==='string'&&new RegExp('^[a-f0-9]{'+length+'}$','u').test(value);
const codes=new Set(['invalid_configuration','invalid_data','invalid_state','invalid_commitment','invalid_receipt','unsafe_path','existing_journal','journal_drift','persistence_failed']);
export class TranscriptJournalError extends Error{
  constructor(code){const safe=codes.has(code)?code:'persistence_failed';super('Transcript journal failed: '+safe+'.');this.name='TranscriptJournalError';this.code=safe;}
}
const fail=code=>{throw new TranscriptJournalError(code);};
const plain=value=>value!==null&&typeof value==='object'&&Object.getPrototypeOf(value)===Object.prototype;
const exact=(value,keys)=>plain(value)&&Object.keys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key));
function canonical(value,maximum=131072){
  let nodes=0,characters=0;
  const visit=(item,depth)=>{
    if(++nodes>40000||depth>30)fail('invalid_data');
    if(typeof item==='string'){characters+=item.length;if(characters>maximum)fail('invalid_data');return item;}
    if(item===null||typeof item==='boolean'||typeof item==='number'&&Number.isFinite(item))return item;
    if(!item||typeof item!=='object'||Object.getOwnPropertySymbols(item).length)fail('invalid_data');
    const descriptors=Object.getOwnPropertyDescriptors(item);
    if(Object.values(descriptors).some(row=>!Object.hasOwn(row,'value')))fail('invalid_data');
    if(Array.isArray(item)){
      if(Object.getPrototypeOf(item)!==Array.prototype||item.length>2048||Object.keys(descriptors).length!==item.length+1)fail('invalid_data');
      return Array.from({length:item.length},(_,index)=>{
        if(!descriptors[index]?.enumerable)fail('invalid_data');return visit(descriptors[index].value,depth+1);
      });
    }
    if(!plain(item)||Object.keys(descriptors).length>256)fail('invalid_data');
    return Object.fromEntries(Object.keys(descriptors).sort().map(key=>{
      if(key.length>300||!descriptors[key].enumerable)fail('invalid_data');return [key,visit(descriptors[key].value,depth+1)];
    }));
  };
  const text=JSON.stringify(visit(value,0));if(Buffer.byteLength(text)>maximum)fail('invalid_data');return text;
}
const copy=value=>JSON.parse(canonical(value));
const digest=value=>createHash('sha256').update(canonical(value,2_100_000)).digest('hex');
const equal=(a,b)=>canonical(a)===canonical(b);
const caseIds=['account:reproduction-record-overview','account:reproduction-current-courses-year','account:reproduction-remaining-balance','account:reproduction-interview-help'];
const bindingKeys=['runId','ownerId','conversationId','sourceRevision','suiteHash'];
function checkedBinding(raw){
  const value=copy(raw);
  if(!exact(value,bindingKeys)||![value.runId,value.ownerId,value.conversationId].every(uuid)
    ||new Set([value.runId,value.ownerId,value.conversationId]).size!==3||!sha(value.sourceRevision,40)||!sha(value.suiteHash))fail('invalid_configuration');
  return value;
}
const transportKeys=['operation','requestIndex','requestHash','sourceRevision'];
const saveKeys=['ownerId','conversationId','title','expectedVersion','messageDigest'];
function pendingRecord(raw,binding){
  const value=copy(raw),assistant=value.operation==='assistant';
  if(!exact(value,[...transportKeys,...(assistant?['turnId','caseId']:saveKeys)])||!['assistant','conversation_save'].includes(value.operation)
    ||!Number.isSafeInteger(value.requestIndex)||value.requestIndex<1||value.requestIndex>32||!sha(value.requestHash)||value.sourceRevision!==binding.sourceRevision)fail('invalid_commitment');
  if(assistant){const n=Number(value.turnId?.slice(5));if(value.turnId!=='turn-'+n||n<1||n>4||caseIds[n-1]!==value.caseId)fail('invalid_commitment');}
  else if(value.ownerId!==binding.ownerId||value.conversationId!==binding.conversationId||typeof value.title!=='string'||!value.title.trim()||value.title!==value.title.trim()
    ||value.title.length>100||/[\p{Cc}\p{Cs}]/u.test(value.title)||!Number.isInteger(value.expectedVersion)||value.expectedVersion<1||value.expectedVersion>4||!sha(value.messageDigest))fail('invalid_commitment');
  return value;
}
function receivedRecord(raw,pending){
  const value=copy(raw);
  if(pending.operation==='conversation_save'){
    if(!exact(value,[...saveKeys,'requestHash','sourceRevision'])||Object.keys(value).some(key=>value[key]!==pending[key]))fail('invalid_receipt');
  }else{
    const keys=[...transportKeys,'turnId','caseId','statusCode','correlationId','responseHash','eventCount'];
    if(!exact(value,keys)||[...transportKeys,'turnId','caseId'].some(key=>value[key]!==pending[key])||!Number.isInteger(value.statusCode)
      ||value.statusCode<200||value.statusCode>599||value.statusCode>=300&&value.statusCode<400||!sha(value.responseHash)
      ||!Number.isInteger(value.eventCount)||value.eventCount<0||value.eventCount>100||value.correlationId!==null&&!uuid(value.correlationId)
      ||value.statusCode===200&&!uuid(value.correlationId))fail('invalid_receipt');
  }
  return value;
}
const terminalPhases=new Set(['assistant','conversation_save','conversation_read','fixture','journal','deployment','cleanup','eval_abort']);
const terminalCodes=new Set(['invalid_configuration','invalid_request','invalid_state','journal_failed','deployment_failed','transport_failed','response_failed','cancelled',
  'invalid_turn','truncated_turn','conversation_already_exists','invalid_commitment','readback_mismatch','reconciliation_required','persistence_failed','fixture_failed','failed','unclassified_failure']);
function checkedTerminal(raw,state){
  const value=copy(raw),pending=state.entries.at(-1);
  if(!plain(value)||Object.keys(value).some(key=>!['phase','code','disposition','requestHash'].includes(key))||!terminalPhases.has(value.phase)
    ||!['not_sent','uncertain','received'].includes(value.disposition))fail('invalid_data');
  const requestHash=value.requestHash??(pending&&!pending.received?pending.pending.requestHash:null);
  if(requestHash!==null&&(!sha(requestHash)||!state.entries.some(row=>row.pending.requestHash===requestHash)))fail('invalid_data');
  return {phase:value.phase,code:terminalCodes.has(value.code)?value.code:'unclassified_failure',disposition:value.disposition,requestHash};
}
function checkedState(raw,binding){
  const state=copy(raw);
  if(!exact(state,['version','binding','revision','entries','terminal'])||state.version!==1||!equal(state.binding,binding)||!Array.isArray(state.entries)||state.entries.length>8)fail('journal_drift');
  let previous=0,assistants=0,saves=0,title=null;const hashes=new Set();
  for(let index=0;index<state.entries.length;index++){
    const entry=state.entries[index];if(!exact(entry,['pending','received']))fail('journal_drift');
    const p=pendingRecord(entry.pending,binding);
    if(p.requestIndex<=previous||hashes.has(p.requestHash)||index<state.entries.length-1&&entry.received===null)fail('journal_drift');
    previous=p.requestIndex;hashes.add(p.requestHash);
    if(p.operation==='assistant'){if(p.turnId!=='turn-'+(++assistants))fail('journal_drift');}
    else{if(p.expectedVersion!==++saves||title!==null&&title!==p.title)fail('journal_drift');title=p.title;}
    if(entry.received!==null)receivedRecord(entry.received,p);
  }
  if(state.terminal!==null&&!equal(state.terminal,checkedTerminal(state.terminal,state)))fail('journal_drift');
  if(state.revision!==state.entries.length+state.entries.filter(row=>row.received!==null).length+(state.terminal?1:0))fail('journal_drift');
  return state;
}
async function directoryFor(directory,create){
  if(typeof directory!=='string'||!isAbsolute(directory)||typeof process.getuid!=='function')fail('invalid_configuration');
  const path=resolve(directory);let created=false;if(create)try{await mkdir(path,{mode:0o700});created=true;}catch(error){if(error.code!=='EEXIST')throw error;}
  const stat=await lstat(path);
  if(!stat.isDirectory()||stat.isSymbolicLink()||stat.uid!==process.getuid()||(stat.mode&0o7777)!==0o700)fail('unsafe_path');
  if(created){let parent;try{parent=await open(await realpath(dirname(path)),constants.O_RDONLY|constants.O_NOFOLLOW);await parent.sync();}finally{await parent?.close();}}
  return {path:await realpath(path),dev:stat.dev,ino:stat.ino};
}
async function checkDirectory(directory){
  const stat=await lstat(directory.path);if(!stat.isDirectory()||stat.isSymbolicLink()||stat.dev!==directory.dev||stat.ino!==directory.ino
    ||stat.uid!==process.getuid()||(stat.mode&0o7777)!==0o700)fail('unsafe_path');
}
const fileName=runId=>'transcript-journal-'+runId+'.json';
function checkedFile(stat){if(!stat.isFile()||stat.nlink!==1||stat.uid!==process.getuid()||(stat.mode&0o7777)!==0o600||stat.size>131072)fail('unsafe_path');}
async function readFileState(directory,binding){
  await checkDirectory(directory);let handle;
  try{
    handle=await open(join(directory.path,fileName(binding.runId)),constants.O_RDONLY|constants.O_NOFOLLOW);const before=await handle.stat();checkedFile(before);
    const buffer=Buffer.alloc(131073);let size=0;
    for(;;){const {bytesRead}=await handle.read(buffer,size,buffer.length-size,size);if(!bytesRead)break;size+=bytesRead;if(size>131072)fail('unsafe_path');}
    const after=await handle.stat();checkedFile(after);if(size!==before.size||after.size!==before.size||after.mtimeMs!==before.mtimeMs||after.ctimeMs!==before.ctimeMs)fail('journal_drift');
    const state=checkedState(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(buffer.subarray(0,size))),binding);
    return {state,identity:{dev:after.dev,ino:after.ino}};
  }finally{await handle?.close();}
}
const sameIdentity=(a,b)=>a.dev===b.dev&&a.ino===b.ino;
async function syncDirectory(directory){let handle;try{handle=await open(directory.path,constants.O_RDONLY|constants.O_NOFOLLOW);await handle.sync();}finally{await handle?.close();}}
const safeError=error=>error instanceof TranscriptJournalError?error:new TranscriptJournalError(error?.code==='EEXIST'?'existing_journal':'persistence_failed');

/** Recovery reads metadata only. There is intentionally no reopen/resume writer. */
export async function readTranscriptDurableJournal({directory,binding}={}){
  try{const captured=checkedBinding(binding),folder=await directoryFor(directory,false);return (await readFileState(folder,captured)).state;}catch(error){throw safeError(error);}
}
export async function createTranscriptDurableJournal({directory,binding}={}){
  let folder,captured,state,identity;
  try{
    captured=checkedBinding(binding);folder=await directoryFor(directory,true);
    state={version:1,binding:captured,revision:0,entries:[],terminal:null};
    let handle;try{handle=await open(join(folder.path,fileName(captured.runId)),constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);
      await handle.writeFile(canonical(state)+'\n');await handle.sync();}finally{await handle?.close();}
    await syncDirectory(folder);const actual=await readFileState(folder,captured);if(!equal(actual.state,state))fail('journal_drift');identity=actual.identity;
  }catch(error){throw safeError(error);}
  let busy=false,closed=false,broken=false;
  const status=()=>Object.freeze({version:1,revision:state.revision,entries:state.entries.length,pending:state.entries.some(row=>row.received===null),terminal:state.terminal!==null,closed,broken,replayAllowed:false});
  const enter=()=>{if(busy||closed||broken)fail('invalid_state');busy=true;};
  async function current(){const actual=await readFileState(folder,captured);if(!sameIdentity(actual.identity,identity)||!equal(actual.state,state))fail('journal_drift');return actual.state;}
  async function persist(next){
    next=checkedState(next,captured);await current();const temporary=join(folder.path,'.'+fileName(captured.runId)+'.'+randomUUID()+'.tmp');
    let handle;try{handle=await open(temporary,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);await handle.writeFile(canonical(next)+'\n');await handle.sync();}
    finally{await handle?.close();}
    await current();await rename(temporary,join(folder.path,fileName(captured.runId)));await syncDirectory(folder);
    const actual=await readFileState(folder,captured);if(!equal(actual.state,next))fail('journal_drift');state=next;identity=actual.identity;
  }
  async function mutate(make){
    enter();try{await persist(make());return status();}catch(error){broken=true;throw safeError(error);}finally{busy=false;}
  }
  return Object.freeze({status,binding:Object.freeze(copy(captured)),
    async read(){enter();try{return copy(await current());}catch(error){broken=true;throw safeError(error);}finally{busy=false;}},
    pending(raw){const record=pendingRecord(raw,captured);return mutate(()=>{
      if(state.terminal||state.entries.at(-1)?.received===null)fail('invalid_state');
      return {...state,revision:state.revision+1,entries:[...state.entries,{pending:record,received:null}]};
    });},
    received(raw){
      // Inspect accessors before reading any caller property. The body is used
      // only to compute a commitment and never enters the durable document.
      const value=JSON.parse(canonical(raw,2_100_000));
      return mutate(()=>{
        const entry=state.entries.at(-1);if(state.terminal||!entry||entry.received!==null)fail('invalid_state');let received;
        if(entry.pending.operation==='assistant'){
          if(!exact(value,['operation','turnId','caseId','receipt'])||value.operation!=='assistant'||value.turnId!==entry.pending.turnId||value.caseId!==entry.pending.caseId)fail('invalid_receipt');
          const r=value.receipt;
          if(!plain(r)||Object.keys(r).some(key=>!['statusCode','body','events','correlationId',...transportKeys,'disposition','deploymentVerified','persistenceVerified','modelAcceptance'].includes(key))
            ||r.operation!=='assistant'||r.requestIndex!==entry.pending.requestIndex||r.requestHash!==entry.pending.requestHash||r.sourceRevision!==captured.sourceRevision
            ||r.disposition!=='received'||r.deploymentVerified!==true||r.persistenceVerified!==false||r.modelAcceptance!==false||!plain(r.body)||!Array.isArray(r.events))fail('invalid_receipt');
          received={...entry.pending,statusCode:r.statusCode,correlationId:r.correlationId??null,eventCount:r.events.length,
            responseHash:digest({statusCode:r.statusCode,body:r.body,events:r.events,correlationId:r.correlationId??null})};
        }else received=value;
        received=receivedRecord(received,entry.pending);
        return {...state,revision:state.revision+1,entries:[...state.entries.slice(0,-1),{pending:entry.pending,received}]};
      });
    },
    terminal(raw){const value=copy(raw);return mutate(()=>{
      if(state.terminal)fail('invalid_state');return {...state,revision:state.revision+1,terminal:checkedTerminal(value,state)};
    });},
    close(){if(busy)fail('invalid_state');closed=true;},
  });
}
