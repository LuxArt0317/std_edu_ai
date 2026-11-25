/** Preserve existing homepage contact links; do not fetch the linked destination. */
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {load} from 'cheerio';
const pages=JSON.parse(await fs.readFile('src/features/public/mirror/pages.json','utf8'));
const page=pages.find(row=>row.route==='/'&&row.source==='https://www.stu.edu.tw/');
if(!page)throw Error('The homepage capture is not registered.');
const bytes=await fs.readFile('public'+page.file);
if(createHash('sha256').update(bytes).digest('hex')!==page.checksum)throw Error('Homepage communication capture checksum mismatch.');
const $=load(bytes.toString('utf8'));
const links=$('a[href]').map((_,element)=>{
 const node=$(element),url=node.attr('href')||'',label=node.text().replace(/\s+/gu,' ').trim();
 if(!['服務品質信箱','電子郵件'].includes(label))return null;
 let destination;try{destination=new URL(url);}catch{return null;}
 if(destination.protocol!=='https:'||destination.hostname!=='sites.google.com'||destination.pathname!=='/stu.edu.tw/stu-contacts/'||destination.username||destination.password||destination.search||destination.hash)return null;
 const local=pages.find(row=>row.source===url||row.aliases?.includes(url));
 return {label,url,external:true,destinationBodyRead:false,localRoute:local?.route||null};
}).toArray();
if(links.length!==2||new Set(links.map(row=>row.label)).size!==2)throw Error('The two published communication links could not be verified.');
const value={version:1,home:{title:page.title,url:page.route,source:page.source,capturedOn:page.capturedOn,checksum:page.checksum,captureFile:page.file},links,
 coverage:'Only the homepage anchor labels and destinations were read. No linked Google Sites body, form, recipient list, email address or delivery result was read or inferred.'};
await fs.writeFile('server/data/publicCommunicationSource.json',JSON.stringify(value,null,2)+'\n');
console.log(JSON.stringify({links:links.length,checksumVerified:true,externalRequests:0}));
