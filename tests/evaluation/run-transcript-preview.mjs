import {newConversationId} from '../../src/services/assistantConversationId.js';
import {createHash,randomUUID} from 'node:crypto';
import {constants} from 'node:fs';
import {lstat,mkdir,open,readFile,realpath,rename,unlink} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {runTranscriptPreview} from './transcript-preview-run.mjs';
import {createTranscriptDurableJournal} from './transcript-durable-journal.mjs';

const root=fileURLToPath(new URL('../../',import.meta.url));
const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
const expectedRepo='LuxArt0317/std_edu_ai';
const preview=/^https:\/\/[a-z0-9](?:[a-z0-9-]*[a-z0-9])?-v1-d286\.vercel\.app$/u;
const revisionPattern=/^[a-f0-9]{40}$/u;
const fail=code=>{throw new Error('Transcript Preview entry point: '+code+'.');};

export function transcriptPreviewOptions(args){
  const values={};
  const keys={'--origin':'origin','--approved-preview-origin':'approvedPreviewOrigin','--revision':'sourceRevision','--transport-module':'transportModule'};
  for(let index=0;index<args.length;index+=2){
    const name=keys[args[index]],value=args[index+1];
    if(!Object.hasOwn(keys,args[index])||!value||value.startsWith('--')||Object.hasOwn(values,name))fail('invalid_options');
    values[name]=value;
  }
  if(!preview.test(values.origin??'')||values.approvedPreviewOrigin!==values.origin
    ||!revisionPattern.test(values.sourceRevision??'')||!values.transportModule)fail('invalid_options');
  return values;
}

async function privateDirectory(path,{existing=false}={}){
  await mkdir(path,{mode:0o700}).catch(error=>{if(!existing||error.code!=='EEXIST')throw error;});
  const stat=await lstat(path);
  if(!stat.isDirectory()||stat.isSymbolicLink()||stat.uid!==process.getuid()||(stat.mode&0o777)!==0o700||await realpath(path)!==path)
    fail('unsafe_report_directory');
}

async function createPrivateReportFile(directory){
  const path=join(directory,'report.json');
  let prior=null;
  return async report=>{
    const serialized=JSON.stringify(report,null,2)+'\n';
    if(Buffer.byteLength(serialized)>12*1024*1024)fail('report_too_large');
    if(prior!==null){
      const stat=await lstat(path);
      if(!stat.isFile()||stat.isSymbolicLink()||stat.nlink!==1||stat.uid!==process.getuid()||(stat.mode&0o777)!==0o600||stat.size>12*1024*1024)
        fail('unsafe_report_file');
      if(createHash('sha256').update(await readFile(path)).digest('hex')!==prior)fail('report_drift');
    }
    const target=prior===null?path:join(directory,'.report-'+randomUUID()+'.tmp');
    try{
      const file=await open(target,constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW|constants.O_WRONLY,0o600);
      try{await file.writeFile(serialized);await file.sync();}finally{await file.close();}
      if(prior!==null)await rename(target,path);
      const folder=await open(directory,constants.O_NOFOLLOW|constants.O_RDONLY);
      try{await folder.sync();}finally{await folder.close();}
      prior=createHash('sha256').update(serialized).digest('hex');
    }catch(error){
      if(target!==path&&error.code!=='EEXIST')await unlink(target).catch(()=>{});
      throw error;
    }
  };
}

async function exactSource(sourceRevision){
  const config=JSON.parse(await readFile(resolve(root,'deployment.json'),'utf8'));
  if(config.repository!==expectedRepo||config.supabase?.projectRef!=='xiftudmvxphxcjtmfmib'
    ||config.vercel?.teamSlug!=='v1-d286'||!['https://github.com/'+expectedRepo+'.git','git@github.com:'+expectedRepo+'.git'].includes(git('remote','get-url','origin'))
    ||git('rev-parse','HEAD')!==sourceRevision||git('status','--porcelain'))fail('unverified_checkout');

}

/**
 * Explicit operator entry point. The supplied module exports an already
 * authorized connection as fetchPreview. Its code and service session are
 * operator-provided. This entry point performs no credential discovery.
 */
export async function main(args=process.argv.slice(2)){
  const options=transcriptPreviewOptions(args);
  await exactSource(options.sourceRevision);
  if(git('check-ignore','artifacts/transcript-report-probe')!=='artifacts/transcript-report-probe')fail('unsafe_report_directory');
  const modulePath=await realpath(resolve(options.transportModule));
  const stat=await lstat(modulePath);
  if(!stat.isFile()||stat.uid!==process.getuid()||(stat.mode&0o022)!==0)fail('untrusted_transport_module');
  const {fetchPreview}=await import(pathToFileURL(modulePath).href);
  if(typeof fetchPreview!=='function')fail('invalid_transport_module');
  const runId=randomUUID(),conversationId=newConversationId(),base=resolve(root,'artifacts/assistant-evaluation');
  await privateDirectory(dirname(base),{existing:true});
  await privateDirectory(base,{existing:true});
  const directory=join(base,'transcript-'+runId);
  await privateDirectory(directory);
  const writeReport=await createPrivateReportFile(directory);
  const fixture=await import('./live-fixtures.mjs');
  const controller=new AbortController();
  const interrupt=()=>controller.abort();
  process.once('SIGINT',interrupt);process.once('SIGTERM',interrupt);
  try{
    const report=await runTranscriptPreview({...options,runId,conversationId,fetchImpl:fetchPreview,signal:controller.signal},{
      fixture,createJournal:binding=>createTranscriptDurableJournal({directory,binding}),
      async writeReport(document){
        if(git('rev-parse','HEAD')!==options.sourceRevision||git('status','--porcelain'))fail('checkout_changed');
        await writeReport(document);
      },
    });
    // Detailed answers and fixture metadata remain in the owner-only report.
    const collectionComplete=report.turns.length===4&&report.cleanup.verified&&report.failure===null
      &&report.assessment?.transportComplete===true;
    const pendingReviews=report.assessment?.results.filter(result=>result.independentReview?.status==='pending').length??0;
    return {runId,completed:report.turns.length,collectionComplete,cleanupVerified:report.cleanup.verified,phase:report.failure?.phase??null,
      transcriptPassed:report.assessment?.passed===true,pendingReviews,
      casesNotPassing:report.assessment?.results.filter(result=>!result.passed).map(result=>result.caseId)??[],
      releaseReady:false,report:join(directory,'report.json')};
  } finally {
    process.removeListener('SIGINT',interrupt);process.removeListener('SIGTERM',interrupt);
  }
}

if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){
  main().then(result=>{
    process.stdout.write(JSON.stringify(result)+'\n');
    if(!result.collectionComplete)process.exitCode=1;
  }).catch(error=>{
    process.stderr.write(error?.message?.startsWith('Transcript Preview entry point: ')?error.message+'\n':'Transcript Preview could not safely start or finish.\n');
    process.exitCode=1;
  });
}
