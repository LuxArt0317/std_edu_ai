/** Latest attempt, never best score; old references and failed runs cannot pass. */
export function questionQuality(item,runs,model=''){
 const eligible=runs.filter(run=>run.caseId===item.id&&(!model||run.model===model));
 const current=eligible.filter(run=>run.caseVersion===item.version);
 const latest=rows=>rows.reduce((found,run)=>!found||String(run.createdAt||'')>=String(found.createdAt||'')?run:found,null);
 const run=latest(current),older=latest(eligible);
 if(!run)return {run:older,score:null,status:older?'outdated':'unrun',label:older?'Reference changed':'Not run',meetsTarget:false};
 if(run.error||!Number.isFinite(run.statusCode)||run.statusCode<200||run.statusCode>=300)return {run,score:null,status:'error',label:'Run failed',meetsTarget:false};
 const score=run.judge?.score;
 if(typeof score!=='number'||!Number.isFinite(score)||score<0||score>100)return {run,score:null,status:'unreviewed',label:'Awaiting AI review',meetsTarget:false};
 const unverified=run.response?.verification?.status==='unverified';
 return {run,score,status:'scored',meetsTarget:score>=70&&!unverified,
  label:unverified?'Not verified':score>=85?'Strong match':score>=70?'On target':score>=50?'Needs improvement':'Low match'};
}
export function qualityOverview(cases,runs,model=''){
 const active=cases.filter(item=>!item.archivedAt);
 const byId=new Map(cases.map(item=>[item.id,questionQuality(item,runs,model)]));
 const rows=active.map(item=>byId.get(item.id)),scored=rows.filter(row=>row.score!==null);
 return {byId,total:active.length,reviewed:scored.length,target:rows.filter(row=>row.meetsTarget).length,
  average:scored.length?Math.round(scored.reduce((sum,row)=>sum+row.score,0)/scored.length):null,
  unrun:rows.filter(row=>row.status==='unrun').length,unreviewed:rows.filter(row=>row.status==='unreviewed').length,
  errors:rows.filter(row=>row.status==='error').length,outdated:rows.filter(row=>row.status==='outdated').length};
}
export function matchesQuality(row,filter,min=0,max=100){
 if(filter==='all')return true;
 if(['unrun','unreviewed','error','outdated'].includes(filter))return row.status===filter;
 if(filter==='target')return row.meetsTarget;
 if(filter==='below70')return row.score!==null&&row.score<70;
 if(filter==='85plus')return row.score!==null&&row.score>=85;
 if(filter==='custom')return row.score!==null&&row.score>=min&&row.score<=max;
 return true;
}

export const qualityTone=row=>row.score===null?'neutral':row.meetsTarget?'good':row.score>=50?'mixed':'poor';
