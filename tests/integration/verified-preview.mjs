/** Explicit, credential-free preview gate shared by real-account acceptance tests. */
export function validatePreviewTarget(origin,{previewOrigin,expectedReleaseRevision}={}){
  let parsed;try{parsed=new URL(origin);}catch{throw new Error('An exact approved HTTPS preview origin is required.');}
  if(typeof origin!=='string'||origin!==parsed.origin||parsed.protocol!=='https:'||parsed.username||parsed.password||parsed.port||
    parsed.pathname!=='/'||parsed.search||parsed.hash||
    !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?-v1-d286\.vercel\.app$/.test(parsed.hostname)||
    typeof previewOrigin!=='string'||previewOrigin!==origin)
    throw new Error('The preview must exactly match PREVIEW_ORIGIN on the approved Vercel team; paths, ports and credentials are forbidden.');
  if(typeof expectedReleaseRevision!=='string'||!/^[0-9a-f]{40}$/.test(expectedReleaseRevision))
    throw new Error('Preview acceptance requires an explicit lowercase 40-hex EXPECTED_RELEASE_REVISION.');
  return Object.freeze({origin,expectedReleaseRevision});
}

/** Matches scripts/write-release-manifest.mjs; metadata is evidence, not a fallback SHA. */
export function validatePreviewManifest(value,expectedReleaseRevision){
  if(!value||typeof value!=='object'||Array.isArray(value)||
    Object.keys(value).sort().join(',')!=='builtAt,environment,revision,source,version'||
    value.version!==1||value.revision!==expectedReleaseRevision||!/^[0-9a-f]{40}$/.test(value.revision||'')||
    value.environment!=='preview'||value.source!=='vercel-git'||
    typeof value.builtAt!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value.builtAt)||
    !Number.isFinite(Date.parse(value.builtAt))||new Date(value.builtAt).toISOString()!==value.builtAt)
    throw new Error('Preview release metadata must identify the exact approved Vercel preview revision.');
  return Object.freeze({...value});
}

export async function verifyPreviewRelease(origin,{previewOrigin,expectedReleaseRevision,fetchImpl=globalThis.fetch}={}){
  const target=validatePreviewTarget(origin,{previewOrigin,expectedReleaseRevision});
  const manifestUrl=target.origin+'/release.json';
  let response;
  try{response=await fetchImpl(manifestUrl,{method:'GET',redirect:'error',credentials:'omit',cache:'no-store',
    headers:{Accept:'application/json'},signal:AbortSignal.timeout(8000)});}
  catch{throw new Error('Preview release preflight failed before credentials or fixtures; redirects and unavailable previews are not accepted.');}
  if(response.status!==200||response.redirected||response.url&&response.url!==manifestUrl){
    await response.body?.cancel().catch(()=>{});
    throw new Error('Preview release preflight requires HTTP 200 without redirects; protected previews must be made accessible before acceptance.');
  }
  if(!/^application\/json(?:\s*;|$)/i.test(response.headers.get('content-type')||'')){
    await response.body?.cancel().catch(()=>{});
    throw new Error('Preview release preflight returned a non-JSON response.');
  }
  // Bound decoded bytes as well as the fetch deadline. No authentication bypass
  // header, cookie, bearer token, environment credential, or owner session is used.
  const reader=response.body?.getReader();
  if(!reader)throw new Error('Preview release metadata is unavailable.');
  const chunks=[];let bytes=0;
  try{
    for(;;){
      const {value,done}=await reader.read();if(done)break;
      bytes+=value.byteLength;
      if(bytes>4096)throw new Error('Oversized release metadata.');
      chunks.push(value);
    }
    const joined=new Uint8Array(bytes);let offset=0;
    for(const chunk of chunks){joined.set(chunk,offset);offset+=chunk.byteLength;}
    const manifest=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(joined));
    return validatePreviewManifest(manifest,target.expectedReleaseRevision);
  }catch{throw new Error('Preview release metadata did not match the approved bounded manifest.');}
  finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
}
