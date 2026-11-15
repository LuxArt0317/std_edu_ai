import {isConversationId} from '../../src/services/assistantConversationId.js';

// The client uses the generated `stdedu` deployment stem. Branch aliases
// and other projects under the same team are outside the credential scope.
const previewOrigin=/^https:\/\/stdedu-[a-z0-9]{9}-v1-d286\.vercel\.app$/u;
const trustedHeader='x-vercel-trusted-oidc-idp-token';
const assistantPaths=new Set(['/api/affairs-assistant','/api/research-assistant']);
const allowedHeaders=new Set(['accept','authorization','content-type']);
const jwt=/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/u;
const team='v1-d286';
const project='std_edu_ai';

export const isEvaluationPreviewOrigin=value=>typeof value==='string'&&previewOrigin.test(value);

function fail(message){throw new Error('Protected Preview transport: '+message+'.');}

function developmentClaims(token){
  if(typeof token!=='string'||token.length>16384||!jwt.test(token))fail('an authorized Vercel Development token is required');
  let claims;
  try{claims=JSON.parse(Buffer.from(token.split('.')[1],'base64url').toString('utf8'));}
  catch{fail('invalid Vercel token');}
  const issuer='https://oidc.vercel.com';
  if(![issuer,issuer+'/'+team].includes(claims?.iss)||claims.aud!=='https://vercel.com/'+team
    ||claims.sub!==`owner:${team}:project:${project}:environment:development`
    ||claims.owner!==team||claims.project!==project||claims.environment!=='development'
    ||!Number.isSafeInteger(claims.exp)||!Number.isSafeInteger(claims.nbf)||claims.exp<=claims.nbf)
    fail('the token does not declare this client project and Development environment');
  return claims;
}

function matchesConversation(body,conversationId){
  if(Buffer.byteLength(body)>190000)return false;
  let value;
  try{value=JSON.parse(body);}catch{return false;}
  return value?.id===conversationId&&value.title==='Reported school assistant transcript';
}

/** Relay one operator-supplied identity only to the exact approved deployment.
 * Vercel validates the signature and trust rule. Caller Auth is independent. */
export function createTrustedPreviewFetch({origin,token,conversationId,fetchImpl=globalThis.fetch,now=Date.now}={}){
  if(!isEvaluationPreviewOrigin(origin)||typeof fetchImpl!=='function'||typeof now!=='function'
    ||conversationId!==undefined&&!isConversationId(conversationId))fail('invalid Preview target');
  const {nbf,exp}=developmentClaims(token);
  const assertCurrentToken=()=>{
    const seconds=Math.floor(now()/1000);
    if(!Number.isFinite(seconds)||seconds<nbf||seconds>=exp)fail('the Development token is outside its validity window');
  };
  assertCurrentToken();
  return async (input,init={})=>{
    assertCurrentToken();
    const raw=typeof input==='string'?input:input instanceof URL?input.href:null;
    let url,headers;
    try{url=new URL(raw);headers=new Headers(init.headers);}
    catch{fail('invalid request');}
    if(url.origin!==origin||raw!==origin+url.pathname+url.search||url.search.length>4096
      ||[...headers.keys()].some(key=>!allowedHeaders.has(key))
      ||init.signal!==undefined&&!(init.signal instanceof AbortSignal)||init.signal?.aborted)fail('request is outside the approved run');
    const method=init.method??'GET';
    const auth=headers.get('authorization');
    const caller=typeof auth==='string'&&auth.startsWith('Bearer ')&&auth.length<=16384&&jwt.test(auth.slice(7));
    const get=method==='GET'&&init.body===undefined&&!headers.has('content-type');
    const manifest=get&&url.pathname==='/release.json'&&!url.search&&!headers.has('authorization');
    const readback=get&&url.pathname==='/api/affairs-data'&&caller&&(!conversationId||!url.search);
    const post=method==='POST'&&!url.search&&headers.get('content-type')==='application/json'&&typeof init.body==='string';
    const assistant=post&&(conversationId?caller&&url.pathname==='/api/affairs-assistant':(!auth||caller)&&assistantPaths.has(url.pathname))
      &&Buffer.byteLength(init.body)<=60000;
    const conversation=conversationId&&caller&&url.pathname==='/api/affairs-conversations'
      &&(get&&url.search==='?id='+conversationId||post&&matchesConversation(init.body,conversationId));
    if(!manifest&&!readback&&!assistant&&!conversation)fail('unapproved request operation');
    headers.set(trustedHeader,token);
    let response;
    try{response=await fetchImpl(url,{method,headers,body:init.body,signal:init.signal,redirect:'error',credentials:'omit',cache:'no-store'});}
    catch{fail('request could not reach the pinned Preview');}
    if(response.redirected||response.url&&response.url!==url.href||response.status>=300&&response.status<400){
      void response.body?.cancel().catch(()=>{});
      fail('the Preview returned an unexpected redirect');
    }
    return response;
  };
}
