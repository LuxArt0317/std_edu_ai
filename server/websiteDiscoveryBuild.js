import {schoolServiceEntries} from '../src/features/public/affairs/studentServices.js';
import {readFile,readdir,writeFile,rename} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {load} from 'cheerio';
const hash=value=>createHash('sha256').update(value).digest('hex');
const publicUrl=value=>{if(typeof value!=='string'||!value.startsWith('/')||value.startsWith('//')||/[#\\\s]/u.test(value))return false;try{const decoded=decodeURIComponent(value);return !/^\/(?:api|app|auth|signin|school-affairs|dtm)(?:[/?]|$)/iu.test(decoded)&&!decoded.split('/').some(part=>part==='..'||part==='.');}catch{return false;}};
const sourceUrl=value=>{try{const u=new URL(value);return u.protocol==='https:'&&(u.hostname==='stu.edu.tw'||u.hostname.endsWith('.stu.edu.tw'))&&!u.username&&!u.password&&!/(?:login|signin|auth|logout)(?:[/.]|$)/iu.test(u.pathname)&&![...u.searchParams.keys()].some(k=>/token|password|secret|session|ticket/iu.test(k));}catch{return false;}};
/** Index source captures only; never evaluation references, questions or account data. */
export async function generateWebsiteDiscovery(root){
 const manifest=JSON.parse(await readFile(resolve(root,'src/features/public/mirror/pages.json'),'utf8')),documents=[];
 const add=(meta,text,locator)=>{if(typeof text!=='string'||!text.trim())return;const normalized=text.replace(/\s+/gu,' ').trim();for(let offset=0;offset<normalized.length;offset+=2400){const content=normalized.slice(offset,offset+2800);documents.push({id:'site:'+hash(meta.url+'\n'+meta.title+'\n'+locator+'\n'+offset+'\n'+content).slice(0,24),...meta,locator,content,partial:normalized.length>2800});}};
 for(const row of manifest){
  if(!sourceUrl(row.source)||!publicUrl(row.route)||!/^\/school-pages\/[a-f0-9]{20}\.html$/u.test(row.file))continue;
  const bytes=await readFile(resolve(root,'public'+row.file));if(bytes.length>4000000||hash(bytes)!==row.checksum)throw Error('Public discovery capture checksum mismatch: '+row.file);
  const $=load(bytes.toString('utf8'));$('script,style,noscript,nav,header,footer,form,iframe').remove();const main=$('main,article').first();
  const links=$('a[href]').map((_i,a)=>({title:$(a).text().replace(/\s+/gu,' ').trim().slice(0,180),url:$(a).attr('href')})).get().filter(link=>typeof link.url==='string'&&link.url.startsWith('/')&&!link.url.startsWith('//')&&!/[\\\s]/u.test(link.url)).slice(0,100);
  add({url:row.route,title:row.title,source:row.source,capturedOn:row.capturedOn,checksum:row.checksum,links},(main.length?main:$('body')).text(),'html:body');
 }
 const walk=async(value,file)=>{
  if(!value||typeof value!=='object')return;
  if(!Array.isArray(value)&&sourceUrl(value.source)&&publicUrl(value.url)&&/^[a-f0-9]{64}$/u.test(value.checksum??'')){
   // Only raw public text/pages/sections are indexed, not authored answer templates.
   const meta={url:value.url,title:value.title||file,source:value.source,capturedOn:value.capturedOn||null,checksum:value.checksum};
   if(value.url.startsWith('/school-assets/')){const bytes=await readFile(resolve(root,'public'+value.url));if(hash(bytes)!==value.checksum)throw Error('Public discovery document checksum mismatch: '+value.url);}
   if(typeof value.text==='string')add(meta,value.text,'source:text');
   for(const [index,page]of [...(Array.isArray(value.pages)?value.pages:[]),...(Array.isArray(value.sections)?value.sections:[])].entries())if(typeof page.text==='string')add(meta,page.text,page.locator||'source:section:'+index);
  }
  for(const child of Object.values(value))if(child&&typeof child==='object')await walk(child,file);
 };
 for(const file of (await readdir(resolve(root,'server/data'))).filter(name=>name.endsWith('.json')).sort())await walk(JSON.parse(await readFile(resolve(root,'server/data',file),'utf8')),file);
 if(!documents.length)throw Error('No source documents indexed.');
 for(const service of schoolServiceEntries){
  if(typeof service.localUrl!=='string'||!service.localUrl.startsWith('/')||service.localUrl.startsWith('//'))continue;
  const meta={url:service.localUrl,title:service.title,source:'stu.best service directory',capturedOn:null,checksum:hash(JSON.stringify(service))};
  add(meta,JSON.stringify({title:service.title,section:service.section,group:service.group,kind:service.kind,url:service.localUrl,scope:'Navigation only. This directory entry proves a destination, never personal records, eligibility, approval or completion. Account services require sign-in.'}),'directory:'+service.id);
 }
 try{await readFile(resolve(root,'server/websiteDiscovery.embeddings.json'));}catch(error){if(error.code!=='ENOENT')throw error;await writeFile(resolve(root,'server/websiteDiscovery.embeddings.json'),JSON.stringify({model:'text-embedding-3-small',dimensions:512,vectors:{}}));}
 const unique=[...new Map(documents.map(row=>[row.id,row])).values()];const target=resolve(root,'server/websiteDiscovery.generated.json');await writeFile(target+'.tmp',JSON.stringify({version:1,documents:unique}));await rename(target+'.tmp',target);return {chunks:unique.length,sources:new Set(unique.map(row=>row.url)).size};
}
