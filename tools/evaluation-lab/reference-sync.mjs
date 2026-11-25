import {createHash} from 'node:crypto';
const fields=['question','expectedAnswer','domain','route','scope','endpoint','referenceOrigin'];
export const referenceFingerprint=entry=>createHash('sha256').update(JSON.stringify(Object.fromEntries(fields.map(key=>[key,entry[key]])))).digest('hex');

/** Version document-owned fields without erasing runs, custom cases or user flags. */
export function syncReferenceCases(state,incoming,{version,documentHash,at=new Date().toISOString()}){
  const changes=[];
  for(const source of incoming){
    const fingerprint=referenceFingerprint(source);
    const existing=state.cases.find(row=>row.id===source.id);
    if(!existing){state.cases.push({...source,referenceFingerprint:fingerprint});changes.push({id:source.id,kind:'added',version:1});continue;}
    if(existing.referenceFingerprint===fingerprint)continue;
    const changed=fields.some(field=>existing[field]!==source[field]);
    if(changed){
      state.referenceHistory??=[];
      state.referenceHistory.push({caseId:existing.id,version:existing.version,question:existing.question,expectedAnswer:existing.expectedAnswer,route:existing.route,scope:existing.scope,referenceOrigin:existing.referenceOrigin,replacedAt:at,reason:'Markdown source revision'});
      for(const field of fields)existing[field]=source[field];
      existing.version=(existing.version||1)+1;
      existing.updatedAt=at;
      changes.push({id:existing.id,kind:'updated',version:existing.version});
    }
    existing.referenceFingerprint=fingerprint;
  }
  state.faqImportVersion=version;
  state.faqDocumentHash=documentHash;
  state.faqImportedAt=at;
  state.faqLastSync={at,changes};
  return changes;
}
