import {createHash} from 'node:crypto';
const canonical=value=>value instanceof Date?value.toISOString():Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
export const labDigest=value=>createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
const copy=value=>structuredClone(value);
function rows(state,key){
 const list=state?.[key];if(!Array.isArray(list)||list.some(row=>!row||typeof row.id!=='string'||!row.id)||new Set(list.map(row=>row.id)).size!==list.length)throw Error('Invalid or duplicate '+key+' IDs');
 return list;
}
const judges=run=>[...(Array.isArray(run.judgeHistory)?run.judgeHistory:[]),...(run.judge?[run.judge]:[])];
const unique=list=>[...new Map(list.map(row=>[labDigest(row),copy(row)])).values()];
const runIdentity=run=>Object.fromEntries(Object.entries(run).filter(([key])=>!['judge','judgeHistory','revision','updatedAt'].includes(key)));
/** Cloud is authoritative on collisions. Conflicts are explicit and block application. */
export function mergeEvaluationLabStates(local,cloud){
 const localCases=rows(local,'cases'),cloudCases=rows(cloud,'cases'),localRuns=rows(local,'runs'),cloudRuns=rows(cloud,'runs');
 const result=copy(cloud),conflicts=[],warnings=[],stats={addedCases:0,addedRuns:0,mergedJudgeEntries:0};
 const caseMap=new Map(cloudCases.map(row=>[row.id,copy(row)]));
 for(const incoming of localCases){
  const current=caseMap.get(incoming.id);
  if(!current){caseMap.set(incoming.id,copy(incoming));stats.addedCases++;continue;}
  if(labDigest(current)!==labDigest(incoming))conflicts.push({kind:'case',id:incoming.id,reason:'same_id_different_case',cloudVersion:current.version??null,localVersion:incoming.version??null,cloudFingerprint:current.referenceFingerprint??null,localFingerprint:incoming.referenceFingerprint??null,cloudDigest:labDigest(current),localDigest:labDigest(incoming)});
 }
 const runMap=new Map(cloudRuns.map(row=>[row.id,copy(row)]));
 for(const incoming of localRuns){
  const current=runMap.get(incoming.id);
  if(!current){
   const parent=caseMap.get(incoming.caseId),version=incoming.caseVersion;
   let reason;
   if(!parent)reason='run_case_missing';
   else if(!Number.isSafeInteger(version)||version<1||!Number.isSafeInteger(parent.version)||version>parent.version)reason='run_case_version_invalid';
   else if(version===parent.version){
    if(['question','expectedAnswer','expected'].some(key=>labDigest(incoming[key]??null)!==labDigest(parent[key]??null)))reason='run_current_reference_mismatch';
   }else{
    const history=[...(cloud.referenceHistory||[]),...(local.referenceHistory||[])].filter(row=>row.caseId===incoming.caseId&&row.version===version);
    if(history.length&& !history.some(row=>['question','expectedAnswer','expected'].filter(key=>key in row).every(key=>labDigest(incoming[key]??null)===labDigest(row[key]??null))))reason='run_historical_reference_mismatch';
    if(!history.length)warnings.push({kind:'historical-run',id:incoming.id,reason:'reference_history_unavailable',caseVersion:version,currentVersion:parent.version});
   }
   if(reason){conflicts.push({kind:'run',id:incoming.id,reason,localDigest:labDigest(incoming)});continue;}
   runMap.set(incoming.id,copy(incoming));stats.addedRuns++;continue;
  }
  if(labDigest(runIdentity(current))!==labDigest(runIdentity(incoming))){conflicts.push({kind:'run',id:incoming.id,reason:'same_id_different_run',cloudDigest:labDigest(current),localDigest:labDigest(incoming)});continue;}
  const history=unique([...judges(current),...judges(incoming)]);
  stats.mergedJudgeEntries+=history.length-unique(judges(current)).length;
  if(history.length){
   current.judgeHistory=history;
   // A missing/ambiguous timestamp cannot displace the cloud's selected judge.
   const dated=history.filter(judge=>typeof judge.createdAt==='string'&&Number.isFinite(Date.parse(judge.createdAt)));
   const newest=dated.sort((a,b)=>Date.parse(b.createdAt)-Date.parse(a.createdAt))[0];
   if(newest&&(!current.judge||Number.isFinite(Date.parse(current.judge.createdAt))&&Date.parse(newest.createdAt)>Date.parse(current.judge.createdAt)))current.judge=copy(newest);
  }
 }
 result.cases=[...caseMap.values()];result.runs=[...runMap.values()];
 if(Array.isArray(local.referenceHistory)||Array.isArray(cloud.referenceHistory))result.referenceHistory=unique([...(cloud.referenceHistory||[]),...(local.referenceHistory||[])]);
 return {state:result,conflicts,warnings,stats,canApply:conflicts.length===0};
}

/** Match database RPC limits on encoded attachment content, not decoded file bytes. */
export function validateLabAttachments(images){
 if(!Array.isArray(images))throw Error('Invalid attachment collection');
 const ids=new Set();let total=0;
 for(const image of images){
  if(typeof image?.id!=='string'||ids.has(image.id)||typeof image.content!=='string'||!/^[A-Za-z0-9+/]+={0,2}$/u.test(image.content))throw Error('Invalid attachment encoding or duplicate ID');
  ids.add(image.id);const bytes=Buffer.byteLength(image.content);
  if(bytes<32||bytes>2000000)throw Error('Attachment exceeds database item limit');
  total+=bytes;
 }
 if(total>50000000)throw Error('Attachments exceed database workspace limit');
 return {items:images.length,encodedBytes:total};
}
