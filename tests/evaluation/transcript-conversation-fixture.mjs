import {createHash} from 'node:crypto';
import {verifyTranscriptConversationRow} from './transcript-conversation-save.mjs';

// Injected reserved PostgreSQL connection only. No network, credentials, Auth
// deletion, fixture initialization or automatic recovery is performed here.
const uuid=value=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(value);
const plain=value=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&[Object.prototype,null].includes(Object.getPrototypeOf(value))
  &&Reflect.ownKeys(value).every(key=>typeof key==='string'&&Object.hasOwn(Object.getOwnPropertyDescriptor(value,key),'value'));
const exact=(value,keys)=>plain(value)&&Object.keys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key));
const hex=(value,n)=>typeof value==='string'&&new RegExp('^[a-f0-9]{'+n+'}$','u').test(value);
const fail=code=>{throw Object.assign(new Error('Transcript fixture '+code+'.'),{name:'TranscriptConversationFixtureError',code});};
const requireValue=(condition,code='invalid_configuration')=>{if(!condition)fail(code);};
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const stamp=value=>typeof value==='string'&&/^\d{4}-\d\d-\d\d[T ]\d\d:\d\d:\d\d(?:\.\d{1,6})?(?:Z|[+-]\d\d(?::?\d\d)?)$/u.test(value)&&Number.isFinite(Date.parse(value));
function stable(value,depth=0,budget={nodes:0}){
  if(++budget.nodes>20000||depth>24)fail('invalid_rows');
  if(value===null||typeof value==='boolean')return value;
  if(typeof value==='number'){requireValue(Number.isFinite(value),'invalid_rows');return value;}
  if(typeof value==='string'){requireValue(value.length<=190000,'invalid_rows');return value;}
  if(Array.isArray(value)){
    requireValue(Object.getPrototypeOf(value)===Array.prototype&&value.length<=2000&&Reflect.ownKeys(value).length===value.length+1,'invalid_rows');
    return Array.from({length:value.length},(_,index)=>{const d=Object.getOwnPropertyDescriptor(value,index);requireValue(d&&Object.hasOwn(d,'value'),'invalid_rows');return stable(d.value,depth+1,budget);});
  }
  requireValue(plain(value)&&Object.keys(value).length<=500,'invalid_rows');
  return Object.fromEntries(Object.keys(value).sort().map(key=>[key,stable(value[key],depth+1,budget)]));
}
function bounded(value){const copy=stable(value);requireValue(Buffer.byteLength(JSON.stringify(copy))<=250000,'invalid_rows');return copy;}
const digest=value=>createHash('sha256').update(JSON.stringify(stable(value))).digest('hex');
const rowKeys=['id','user_id','title','messages','version','created_at','updated_at'];
const pendingKeys=['ownerId','conversationId','title','expectedVersion','messageDigest','operation','requestIndex','requestHash','sourceRevision'];
const receivedKeys=['ownerId','conversationId','title','expectedVersion','messageDigest','requestHash','sourceRevision'];

export function createTranscriptConversationFixture({runId,owners,conversationId,journal,sql,assertLease,persist}={}){
  requireValue(uuid(runId)&&uuid(conversationId)&&Array.isArray(owners)&&owners.length===2&&typeof journal?.read==='function'
    &&typeof sql?.unsafe==='function'&&typeof assertLease==='function'&&typeof persist==='function');
  const ownerBindings=owners.map(row=>{
    requireValue(exact(row,['id','email'])&&uuid(row.id)&&typeof row.email==='string'&&/^[a-z0-9][a-z0-9._+-]{0,230}@example\.invalid$/u.test(row.email));
    return Object.freeze({...row});
  });
  const ownerIds=ownerBindings.map(row=>row.id),ownerId=ownerIds[0];
  requireValue(new Set([runId,conversationId,...ownerIds]).size===4&&new Set(ownerBindings.map(row=>row.email)).size===2);
  const readJournal=journal.read.bind(journal),execute=sql.unsafe.bind(sql),lease=assertLease,save=persist;
  let binding=null,reserved=false,busy=false,deletion=null,cleaned=false,lastRecovery=null,cleanedView=null,observed=null;
  const query=async(text,params=[])=>{try{return await execute(text,params);}catch{fail('query_failed');}};
  async function snapshot(){
    let doc;try{doc=bounded(await readJournal());}catch{fail('journal_invalid');}
    requireValue(exact(doc,['version','binding','revision','entries','terminal'])&&doc.version===1&&Number.isSafeInteger(doc.revision)&&doc.revision>=0
      &&exact(doc.binding,['runId','ownerId','conversationId','sourceRevision','suiteHash'])&&doc.binding.runId===runId&&doc.binding.ownerId===ownerId&&doc.binding.conversationId===conversationId
      &&hex(doc.binding.sourceRevision,40)&&hex(doc.binding.suiteHash,64)&&Array.isArray(doc.entries)&&doc.entries.length<=16,'journal_invalid');
    const nextBinding=doc.binding;if(binding)requireValue(same(binding,nextBinding),'journal_changed');else binding=nextBinding;
    const saves=[];let previousIndex=0;
    for(const entry of doc.entries){
      requireValue(exact(entry,['pending','received'])&&plain(entry.pending),'journal_invalid');
      const p=entry.pending;
      requireValue(Number.isSafeInteger(p.requestIndex)&&p.requestIndex>previousIndex&&hex(p.requestHash,64)&&p.sourceRevision===binding.sourceRevision,'journal_invalid');previousIndex=p.requestIndex;
      if(p.operation!=='conversation_save'){
        requireValue(p.operation==='assistant','journal_invalid');continue;
      }
      requireValue(exact(p,pendingKeys)&&p.ownerId===ownerId&&p.conversationId===conversationId&&p.expectedVersion===saves.length+1&&p.expectedVersion<=4
        &&typeof p.title==='string'&&p.title===p.title.trim()&&p.title.length>0&&p.title.length<=100&&hex(p.messageDigest,64),'journal_invalid');
      if(saves.length)requireValue(saves.at(-1).received!==null&&p.title===saves[0].pending.title,'journal_invalid');
      if(entry.received!==null)requireValue(exact(entry.received,receivedKeys)&&receivedKeys.every(key=>entry.received[key]===p[key]),'journal_invalid');
      saves.push(entry);
    }
    return {binding,saves,revision:doc.revision};
  }
  async function persistState(phase,view){
    const record={version:1,binding:{...binding},ownerIds:[...ownerIds],conversationId,phase,journalRevision:view.revision,
      saves:view.saves.map(entry=>({pending:{...entry.pending},received:entry.received&&{...entry.received}})),observed:observed&&{...observed},deletion:deletion&&{...deletion}};
    try{await save(structuredClone(record));}catch{fail('ledger_failed');}lastRecovery=record;
  }
  async function unchangedJournal(view){requireValue(same(view,await snapshot()),'journal_changed');}
  async function guard({identities=true}={}){
    try{requireValue(await lease()===true,'lease_lost');}catch{fail('lease_lost');}
    const locks=await query("select 1 as held from pg_locks where locktype='advisory' and pid=pg_backend_pid() and classid=23101314 and objid=115100 and objsubid=2 and granted");
    requireValue(Array.isArray(locks)&&locks.length===1&&locks[0]?.held===1,'lease_lost');
    if(!identities)return;
    const rows=await query("select u.id,u.email,u.raw_user_meta_data->>'assistant_evaluation_run' as run_marker,p.role,exists(select 1 from auth.identities i where i.user_id=u.id and i.provider='google') as google from auth.users u join public.affairs_profiles p on p.user_id=u.id where u.id=any($1::uuid[]) order by u.id for share of u,p",[ownerIds]);
    requireValue(Array.isArray(rows)&&rows.length===2&&new Set(rows.map(row=>row.id)).size===2&&rows.every(row=>exact(row,['id','email','run_marker','role','google'])
      &&row.run_marker===runId&&row.role==='student'&&row.google===true&&ownerBindings.some(owner=>row.id===owner.id&&row.email===owner.email)),'identity_mismatch');
  }
  async function rows(lock=false){
    const result=await query('select id,user_id,title,messages,version,created_at::text as created_at,updated_at::text as updated_at from public.affairs_conversations where user_id=any($1::uuid[]) or id=$2::uuid order by id limit 3'+(lock?' for update':''),[ownerIds,conversationId]);
    requireValue(Array.isArray(result)&&result.length<=1,'unexpected_conversations');
    return result.map(row=>{
      requireValue(exact(row,rowKeys),'invalid_rows');const copy=bounded(row);
      requireValue(copy.id===conversationId&&copy.user_id===ownerId&&stamp(copy.created_at)&&stamp(copy.updated_at)&&Date.parse(copy.updated_at)>=Date.parse(copy.created_at),'unexpected_conversations');return copy;
    });
  }
  async function zeroActions(){
    const result=await query('select user_id,request_id from private.affairs_assistant_operations where user_id=any($1::uuid[]) limit 1',[ownerIds]);
    requireValue(Array.isArray(result)&&result.length===0,'unexpected_actions');
  }
  function match(view,current,{allowDeleted=false}={}){
    const latest=view.saves.at(-1)?.pending;
    if(!latest){requireValue(current.length===0,'unexpected_conversations');return {version:0,messageDigest:null};}
    if(!current.length&&allowDeleted&&deletion&&deletion.expectedVersion===latest.expectedVersion&&deletion.messageDigest===latest.messageDigest)return {version:latest.expectedVersion,messageDigest:latest.messageDigest};
    try{verifyTranscriptConversationRow(latest,current);}catch{fail('reconciliation_required');}
    if(observed)requireValue(current[0].created_at===observed.createdAt&&(current[0].version!==observed.version||digest(current[0])===observed.rowDigest),'reconciliation_required');
    return {version:latest.expectedVersion,messageDigest:latest.messageDigest};
  }
  async function transaction(work){
    await query('begin');
    try{
      await query("set local statement_timeout='15s'");await query("set local lock_timeout='3s'");await query("set local idle_in_transaction_session_timeout='15s'");
      const value=await work();await query('commit');return value;
    }catch(error){try{await query('rollback');}catch{/* Intent and reserved IDs remain for independent recovery. */}throw error;}
  }
  async function exclusive(work){requireValue(!busy,'busy');busy=true;try{return await work();}finally{busy=false;}}
  return Object.freeze({
    async reserve(){return exclusive(async()=>{
      requireValue(!reserved&&!cleaned,'invalid_state');const view=await snapshot();requireValue(view.saves.length===0,'journal_not_empty');
      await persistState('reserved',view);
      await transaction(async()=>{await guard();requireValue((await rows(true)).length===0,'conversation_exists');await zeroActions();await unchangedJournal(view);});reserved=true;
      return Object.freeze({ownerId,conversationId});
    });},
    async readback(){return exclusive(async()=>{
      requireValue(reserved&&!cleaned&&!deletion,'invalid_state');const view=await snapshot();await guard();const current=await rows();await zeroActions();const result=match(view,current);
      if(current.length)observed={version:current[0].version,rowDigest:digest(current[0]),createdAt:current[0].created_at,updatedAt:current[0].updated_at};
      await unchangedJournal(view);await persistState('observed',view);return Object.freeze(result);
    });},
    async cleanup(){return exclusive(async()=>{
      requireValue(reserved,'invalid_state');const view=await snapshot();
      await transaction(async()=>{
        await guard();for(const id of [...ownerIds].sort())await query("select pg_advisory_xact_lock(hashtextextended('affairs-chat:'||$1::text,0))",[id]);
        const current=await rows(true);await zeroActions();await unchangedJournal(view);match(view,current,{allowDeleted:true});
        if(current.length){
          const row=current[0];if(deletion)requireValue(deletion.rowDigest===digest(row),'reconciliation_required');
          deletion={expectedVersion:row.version,messageDigest:view.saves.at(-1).pending.messageDigest,rowDigest:digest(row),createdAt:row.created_at,updatedAt:row.updated_at};
          await persistState('deleting',view);
          const removed=await query('delete from public.affairs_conversations where id=$1::uuid and user_id=$2::uuid and title is not distinct from $3::text and messages is not distinct from $4::jsonb and version=$5::integer and created_at=$6::timestamptz and updated_at=$7::timestamptz returning id,user_id',
            [conversationId,ownerId,row.title,JSON.stringify(row.messages),row.version,row.created_at,row.updated_at]);
          requireValue(Array.isArray(removed)&&removed.length===1&&exact(removed[0],['id','user_id'])&&removed[0].id===conversationId&&removed[0].user_id===ownerId,'delete_mismatch');
        }
        requireValue((await rows()).length===0,'cleanup_not_empty');await zeroActions();await unchangedJournal(view);
      });
      cleaned=true;cleanedView=view;await persistState('deleted',view);return {verified:true,conversationRows:0};
    });},
    async verifyAbsent(){return exclusive(async()=>{requireValue(cleaned,'invalid_state');await unchangedJournal(cleanedView);await guard({identities:false});requireValue((await rows()).length===0,'cleanup_not_empty');await zeroActions();await unchangedJournal(cleanedView);return {verified:true,conversationRows:0};});},
    recovery:()=>lastRecovery&&structuredClone(lastRecovery),
  });
}
