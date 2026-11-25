import {readFile,realpath,stat} from 'node:fs/promises';
import {resolve,sep} from 'node:path';
import {load} from 'cheerio';
import {createHash} from 'node:crypto';
import {publicPageForRoute,loadPublicPageContext} from '../../server/publicPageContext.js';
import captures from '../../src/features/public/mirror/pages.json' with {type:'json'};
import prospectus from '../../server/data/ipiac115.json' with {type:'json'};

export const publicJudgeMethodVersion='public-source-context-v1';
const registered=[...captures,{route:prospectus.url,source:prospectus.source,title:prospectus.title,file:prospectus.captureFile,checksum:prospectus.captureChecksum,capturedOn:prospectus.capturedOn}];
const maxSources=4,maxCharacters=24000,maxIdentifiers=24,maxBytes=4000000;
function identifier(value){
 if(typeof value!=='string'||value.length>4096||/[\s\\\u0000-\u001f\u007f]/u.test(value))return null;
 if(/(?:^|\/)(?:\.|%2e){1,2}(?:\/|$)/iu.test(value)||/%(?:2f|5c)/iu.test(value))return null;
 if(value.startsWith('/')&&!value.startsWith('//'))return value.split('#')[0];
 try{const url=new URL(value);if(url.username||url.password||url.port||url.protocol!=='https:')return null;
  if(url.hostname==='stu.best')return url.pathname+url.search;
  // Original URLs are identifiers only when explicitly registered, never fetch targets.
  const matches=registered.filter(page=>page.source===value||page.aliases?.includes(value));
  return matches.length===1?matches[0].route:null;
 }catch{return null;}
}
function selectedIdentifiers(run){
 const values=[];
 for(const citation of Array.isArray(run?.response?.citations)?run.response.citations.slice(0,maxIdentifiers):[])if(typeof citation?.url==='string')values.push(citation.url);
 const answer=typeof run?.response?.answer==='string'?run.response.answer.slice(0,32000):'';
 for(const match of answer.matchAll(/\[[^\]\n]{0,1000}\]\(([^\s()]+)\)/gu)){values.push(match[1]);if(values.length>=maxIdentifiers)break;}
 return [...new Set(values)].slice(0,maxIdentifiers);
}
async function hostedBytes(page,deadline){
 const url='https://stu.best'+page.file;
 const response=await fetch(url,{redirect:'error',signal:AbortSignal.timeout(Math.max(1,deadline-Date.now())),headers:{Accept:'text/html'}});
 if(!response.ok||response.redirected||(response.url&&response.url!==url)||Number(response.headers.get('content-length'))>maxBytes||!response.body)throw Error('capture_response');
 const reader=response.body.getReader(),parts=[];let length=0;
 try{while(true){if(Date.now()>=deadline)throw Error('capture_deadline');const {done,value}=await reader.read();if(done)break;length+=value.byteLength;if(length>maxBytes)throw Error('capture_size');parts.push(Buffer.from(value));}}
 catch(error){await reader.cancel().catch(()=>{});throw error;}
 return Buffer.concat(parts,length);
}
/** Reconstruct public evidence from deployed server registrations, not run flags or supplied excerpts.
 * This does not attest which evidence was retrieved when the historical answer was generated.
 * No arbitrary network requests or private/native record reads occur. Hosted missing files
 * may use only fixed stu.best registered static paths, with identical checksum validation.
 */
export async function resolvePublicJudgeEvidence(root,run,{deadline=Date.now()+5000}={}){
 const result={methodVersion:publicJudgeMethodVersion,reconstructedAt:new Date().toISOString(),
  provenance:'Independently reconstructed from currently registered checksum-pinned public captures; not proof of original retrieval or current policy.',
  sources:[],destinationMappings:[],unresolved:[]};
 if(run?.scope!=='public')return {...result,scope:'not_public'};
 deadline=Math.min(deadline,Date.now()+5000);
 if(!Number.isFinite(deadline))return {...result,scope:'public',unresolved:[{reason:'invalid_deadline'}]};
 let publicRoot;try{publicRoot=await realpath(resolve(root,'public'));}catch{/* Hosted static files may live outside the function filesystem. */}
 const hosted=['production','preview'].includes(process.env.VERCEL_ENV);
 const seen=new Set();let remaining=maxCharacters;
 for(const value of selectedIdentifiers(run)){
  if(Date.now()>=deadline){result.unresolved.push({reason:'deadline'});break;}
  const route=identifier(value),page=route&&publicPageForRoute(route);
  if(!page){result.unresolved.push({identifier:value,reason:'not_registered_public_capture'});continue;}
  if(seen.has(page.route))continue;
  seen.add(page.route);
  if(result.sources.length>=maxSources){result.unresolved.push({identifier:value,reason:'source_limit'});continue;}
  try{
   if(!/^\/school-pages\/[a-f0-9]{20}\.html$/u.test(page.file))throw Error('capture_file');
   let bytes,transport='local-filesystem';
   try{
    if(!publicRoot)throw Object.assign(Error('capture_missing'),{code:'ENOENT'});
    const filename=await realpath(resolve(publicRoot,'.'+page.file));
    if(!filename.startsWith(publicRoot+sep))throw Error('capture_file');
    const info=await stat(filename);if(!info.isFile()||info.size>maxBytes)throw Error('capture_size');
    bytes=await readFile(filename,{signal:AbortSignal.timeout(Math.max(1,Math.min(4000,deadline-Date.now())))});
   }catch(error){
    if(!hosted||!['ENOENT','ENOTDIR'].includes(error.code))throw error;
    bytes=await hostedBytes(page,deadline);transport='pinned-stu-best-static';
   }
   if(bytes.length>maxBytes||createHash('sha256').update(bytes).digest('hex')!==page.checksum)throw Error('capture_integrity');
   const context=await loadPublicPageContext(page.route,deadline,{captures:[page],fetchCapture:async()=>new Response(bytes,{headers:{'content-type':'text/html'}})});
   if(!context?.contentAvailable)throw Error('capture_unreadable');
   const metadata=JSON.parse(context.evidence.content);
   // The shared prose extractor omits HTML pre blocks used by searchable PDF captures.
   // Read literal blocks only after the same byte/hash check; never trust generated run excerpts.
   const $=load(bytes.toString('utf8'));
   const pre=$('main section pre').toArray().map(node=>({locator:$(node).closest('section').attr('id')||'pre',text:$(node).text().trim()})).filter(row=>row.text);
   const literal=pre.length?pre.map(row=>row.locator+'\n'+row.text).join('\n\n'):metadata.excerpt;
   const excerpt=literal.slice(0,Math.min(6000,remaining));remaining-=excerpt.length;
   result.sources.push({id:context.evidence.id,url:page.route,originalSource:page.source,title:page.title,
    checksum:page.checksum,capturedOn:page.capturedOn,transport,locator:pre.length?'Checksum-verified main section pre blocks (section IDs inline)':'Checksum-verified saved HTML text',excerpt,
    excerptTruncated:pre.length?excerpt.length<literal.length:metadata.excerptTruncated||excerpt.length<literal.length,
    coverage:'Selected public snapshot text only; excerpt absence does not establish site-wide absence or personal eligibility.'});
   result.destinationMappings.push({localUrl:page.route,originalUrl:page.source,identifier:value,contentAvailable:true});
  }catch{result.unresolved.push({identifier:value,reason:'capture_unavailable_or_integrity_failed'});}
 }
 return {...result,scope:'public'};
}
