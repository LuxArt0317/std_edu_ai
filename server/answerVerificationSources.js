import { createHash } from 'node:crypto';
import captures from '../src/features/public/mirror/pages.json' with {type:'json'};
import { acquireHttpsSource, detectAndExtractSource } from './knowledgeAcquisition.js';
import { safeWebSource } from './schoolWebSearch.js';

const canonical=value=>{const url=safeWebSource(value);return url?url.replace(/\/$/,''):null;};
async function capturedSource(url,deadline,dependencies) {
  // Only exact, already-public captures in the versioned manifest qualify.
  // This never signs in, solves a challenge, or fetches arbitrary local paths.
  const capture=(dependencies.captures||captures).find(page=>[page.source,...(page.aliases||[])].some(value=>canonical(value)===canonical(url)));
  if(!capture || !/^\/school-pages\/[a-f0-9]{20}\.html$/.test(capture.file)
    || !/^[a-f0-9]{64}$/.test(capture.checksum) || !/^\d{4}-\d{2}-\d{2}$/.test(capture.capturedOn)
    || deadline-Date.now()<750)throw new Error('No verified public capture');
  const response=await (dependencies.fetchCapture||fetch)('https://stu.best'+capture.file,{redirect:'error',signal:AbortSignal.timeout(Math.min(5000,deadline-Date.now()))});
  if(!response.ok)throw new Error('Public capture unavailable');
  const bytes=new Uint8Array(await response.arrayBuffer());
  if(bytes.length>4_000_000||createHash('sha256').update(bytes).digest('hex')!==capture.checksum)throw new Error('Public capture checksum mismatch');
  const extracted=await detectAndExtractSource(bytes,'text/html',capture.source);
  return {capturedOn:capture.capturedOn,content:JSON.stringify({provenance:'Previously captured public school page; not a live source.',capturedOn:capture.capturedOn,originalSource:capture.source,content:extracted.sections.map(section=>section.content).join('\n').slice(0,14000)}),urls:[capture.route]};
}

/** Read cited contents independently; exact dated public captures can survive a source outage. */
export async function readVerificationSources(citations, deadline, dependencies={}) {
  const unique=[...new Map(citations.map(item=>[item.url,item])).values()].slice(0,4);
  const results=await Promise.allSettled(unique.map(async citation=>{
    const url=safeWebSource(citation.url);
    if(!url||deadline-Date.now()<1500)throw new Error('No public source');
    let contents;
    try {
      const acquired=await (dependencies.acquire||acquireHttpsSource)(url,{timeoutMs:Math.min(5000,deadline-Date.now())});
      const extracted=await detectAndExtractSource(acquired.bytes,acquired.mimeType,acquired.finalUrl);
      const content=extracted.sections.map(section=>section.content).join('\n').slice(0,16000);
      if(!content.trim())throw new Error('Source has no readable content');
      contents={content};
    }catch{
      contents=await capturedSource(url,deadline,dependencies);
    }
    return {id:citation.chunkId,...contents,url:citation.url,title:citation.title};
  }));
  const failures=results.filter(result=>result.status==='rejected');
  if(failures.length)console.warn('Answer verification source acquisition incomplete',{requested:unique.length,unavailable:failures.length});
  return results.filter(result=>result.status==='fulfilled').map(result=>result.value);
}
