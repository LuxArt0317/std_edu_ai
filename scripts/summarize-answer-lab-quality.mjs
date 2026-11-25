/** Offline audit: no answers/references leave the local store and no model calls. */
import fs from 'node:fs/promises';
const args=process.argv.slice(2),json=args.includes('--json'),at=args.indexOf('--producer');
const producer=at<0?null:args[at+1];if(at>=0&&(!producer||producer.startsWith('--')))throw Error('--producer requires a model ID');
const state=JSON.parse(await fs.readFile('.evaluation-lab/state.json','utf8'));
const rows=state.cases.filter(item=>!item.archivedAt).map(item=>{
 const runs=state.runs.filter(run=>run.caseId===item.id&&run.caseVersion===item.version&&(!producer||run.model===producer));
 const judged=runs.filter(run=>Number.isFinite(run.judge?.score)).sort((a,b)=>String(a.createdAt).localeCompare(String(b.createdAt)));
 const latest=judged.at(-1),best=judged.reduce((result,run)=>!result||run.judge.score>result.judge.score?run:result,null);
 return {caseId:item.id,scope:item.scope,version:item.version,answered:runs.some(run=>typeof run.response?.answer==='string'&&run.response.answer.trim()),
  latest:latest?{runId:latest.id,score:latest.judge.score,sourceVerification:latest.response?.verification?.status??null,producer:latest.model,grader:latest.judge.model}:null,
  best:best?{runId:best.id,score:best.judge.score,sourceVerification:best.response?.verification?.status??null,producer:best.model,grader:best.judge.model}:null};
});
const summary={producer,caseVersionPolicy:'Only runs for the current case version are compared.',total:rows.length,answered:rows.filter(row=>row.answered).length,
 bestAtLeast70:rows.filter(row=>row.best?.score>=70).length,latestAtLeast70:rows.filter(row=>row.latest?.score>=70).length,
 latestBelow70:rows.filter(row=>row.latest&&row.latest.score<70).map(row=>row.caseId),unjudged:rows.filter(row=>!row.latest).map(row=>row.caseId),
 warning:'A historical best does not prove current behavior. API scores do not prove browser or production acceptance.'};
console.log(JSON.stringify(json?{summary,rows}:summary,null,2));
