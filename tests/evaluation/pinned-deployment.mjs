/** Import-only, credential-free release checks. No request occurs until pin().
 * A release.json currently contains no deployment ID: this pins its complete
 * validated manifest and exact origin, never an invented Vercel identifier.
 */
const previewHost=/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?-v1-d286\.vercel\.app$/u;
const sha=/^[a-f0-9]{40}$/u;
const keys=['builtAt','environment','revision','source','version'];
const codes=new Set(['invalid_target','invalid_revision','invalid_options','unavailable','unexpected_response','invalid_manifest','revision_mismatch','deployment_changed','deadline','aborted','invalid_transition']);
export class PinnedDeploymentError extends Error{
  constructor(code){const safe=codes.has(code)?code:'unavailable';super('Pinned deployment check failed: '+safe+'.');this.name='PinnedDeploymentError';this.code=safe;}
}
const fail=code=>{throw new PinnedDeploymentError(code);};
function targetFor(origin,approvedPreviewOrigin){
  let url;try{url=new URL(origin);}catch{fail('invalid_target');}
  if(typeof origin!=='string'||origin!==url.origin||url.protocol!=='https:'||url.username||url.password||url.port||url.search||url.hash||url.pathname!=='/')fail('invalid_target');
  if(origin==='https://stu.best')return {origin,environment:'production'};
  if(!previewHost.test(url.hostname)||approvedPreviewOrigin!==origin)fail('invalid_target');
  return {origin,environment:'preview'};
}
function manifestFor(value,target,revision){
  if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).sort().join(',')!==keys.join(',')
    ||value.version!==1||value.source!=='vercel-git'||value.environment!==target.environment||!sha.test(value.revision??'')
    ||typeof value.builtAt!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value.builtAt)
    ||!Number.isFinite(Date.parse(value.builtAt))||new Date(value.builtAt).toISOString()!==value.builtAt)fail('invalid_manifest');
  if(value.revision!==revision)fail('revision_mismatch');
  return Object.freeze(Object.fromEntries(keys.map(key=>[key,value[key]])));
}
const sameManifest=(left,right)=>keys.every(key=>left[key]===right[key]);

/** All request checks are serial and fail closed after the first mismatch.
 * beforeRequest() must precede credentials/fixtures/provider I/O when used as a
 * preflight. Each provider request needs its own paired ticket and final check.
 * Neither a successful check nor an immutable-looking URL proves model quality.
 */
export function createPinnedDeploymentVerifier({origin,expectedRevision,approvedPreviewOrigin,timeoutMs=8000,signal,fetchImpl=globalThis.fetch}={}){
  const target=targetFor(origin,approvedPreviewOrigin);
  if(typeof expectedRevision!=='string'||!sha.test(expectedRevision))fail('invalid_revision');
  if(!Number.isInteger(timeoutMs)||timeoutMs<1||timeoutMs>8000||typeof fetchImpl!=='function'
    ||signal!==undefined&&!(signal instanceof AbortSignal))fail('invalid_options');
  let pinned=null,pending=null,busy=false,finished=false,failed=null,issued=0,completed=0,checks=0,rechecked=0;
  const proof=()=>Object.freeze({origin:target.origin,sourceRevision:expectedRevision,manifest:pinned,
    identityKind:'release-manifest',deploymentId:null,checked:checks,issued,completed,rechecked});
  const state=()=>Object.freeze({...proof(),status:failed?'failed':finished?'finished':pending?'request_pending':pinned?'pinned':'uninitialized',
    pendingRequest:pending?.requestIndex??null,failure:failed});
  function transition(condition){if(failed||finished||busy||!condition){failed??='invalid_transition';fail('invalid_transition');}}
  async function readManifest(){
    if(signal?.aborted)fail('aborted');
    const abort=new AbortController();let timer,reader,response;
    const aborted=()=>abort.abort();signal?.addEventListener('abort',aborted,{once:true});
    const deadline=new Promise((_,reject)=>{timer=setTimeout(()=>{abort.abort();reject(new PinnedDeploymentError('deadline'));},timeoutMs);});
    const external=new Promise((_,reject)=>{abort.signal.addEventListener('abort',()=>{
      if(signal?.aborted)reject(new PinnedDeploymentError('aborted'));
    },{once:true});});
    const read=async()=>{
      const url=target.origin+'/release.json';
      response=await fetchImpl(url,{method:'GET',redirect:'error',credentials:'omit',cache:'no-store',headers:{Accept:'application/json'},signal:abort.signal});
      if(abort.signal.aborted)fail(signal?.aborted?'aborted':'deadline');
      if(response.status!==200||response.redirected||response.url&&response.url!==url||!/^application\/json(?:\s*;|$)/iu.test(response.headers.get('content-type')||''))fail('unexpected_response');
      reader=response.body?.getReader();if(!reader)fail('unexpected_response');
      const parts=[];let length=0;
      for(;;){
        if(abort.signal.aborted)fail(signal?.aborted?'aborted':'deadline');
        const {value,done}=await reader.read();if(done)break;
        length+=value.byteLength;if(length>4096)fail('invalid_manifest');parts.push(value);
      }
      const bytes=new Uint8Array(length);let offset=0;for(const part of parts){bytes.set(part,offset);offset+=part.byteLength;}
      let value;try{value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch{fail('invalid_manifest');}
      return manifestFor(value,target,expectedRevision);
    };
    try{return await Promise.race([read(),deadline,external]);}
    catch(error){if(error instanceof PinnedDeploymentError&&codes.has(error.code))fail(error.code);fail(signal?.aborted?'aborted':'unavailable');}
    finally{
      clearTimeout(timer);signal?.removeEventListener('abort',aborted);abort.abort();
      // Cancellation is best effort and never extends the bounded check deadline.
      if(reader){void reader.cancel().catch(()=>{});try{reader.releaseLock();}catch{/* An aborted read may still be pending. */}}
      else if(response?.body)void response.body.cancel().catch(()=>{});
    }
  }
  async function checked(){
    busy=true;
    try{const current=await readManifest();if(failed)fail(failed);if(pinned&&!sameManifest(pinned,current))fail('deployment_changed');checks++;return current;}
    catch(error){failed=error instanceof PinnedDeploymentError&&codes.has(error.code)?error.code:'unavailable';fail(failed);}
    finally{busy=false;}
  }
  return Object.freeze({
    async pin(){transition(!pending);if(!pinned)pinned=await checked();return proof();},
    // A fixture transition is not a model request. Recheck before that write
    // without creating a ticket or crediting an assistant execution.
    async assertCurrent(){transition(pinned!==null&&!pending);await checked();rechecked++;return proof();},
    async beforeRequest(){transition(pinned!==null&&!pending);await checked();pending=Object.freeze({requestIndex:++issued,sourceRevision:expectedRevision});return pending;},
    async afterRequest(ticket){transition(pinned!==null&&pending!==null&&ticket===pending);await checked();pending=null;completed++;return proof();},
    async finish(){transition(pinned!==null&&!pending);await checked();finished=true;return proof();},
    status:state,
  });
}
