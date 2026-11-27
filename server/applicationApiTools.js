import {academicSourceRecords} from './academicSourcePolicy.js';
import {signApiReview,validApiReview,signApiReceipt,verifiedApiReceipt,apiReviewRpc} from './applicationApiReviewStore.js';
import {applicationApiCatalog,loadApplicationApiHandler} from './applicationApiCatalog.generated.js';
import {createHash,randomBytes,randomUUID,timingSafeEqual} from 'node:crypto';
import {mkdir,open,readFile,writeFile,rename,unlink,lstat,chmod,readdir} from 'node:fs/promises';
import {isAbsolute,join} from 'node:path';
const plain=v=>v!==null&&typeof v==='object'&&!Array.isArray(v)&&[Object.prototype,null].includes(Object.getPrototypeOf(v));
const uuid=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/iu;
const secretKey=/^(?:authorization|cookie|set-cookie|password|passwd|secret|api[_-]?key|apikey|access[_-]?token|refresh[_-]?token|service[_-]?role[_-]?key|credential|confirmationToken)$/iu;
export class ApplicationApiToolError extends Error{constructor(message,status=400){super(message);this.status=status;}}
function fail(message,status=400){throw new ApplicationApiToolError(message,status);}
export function requireApiToolCaller(account){if(!plain(account)||!uuid.test(account.user?.id??'')||typeof account.token!=='string'||!account.token.trim())fail('Sign in before using application API tools.',401);return account;}
function cleanInput(value,depth=0){
 if(depth>12)fail('API input is nested too deeply.');
 if(value===null||typeof value==='boolean'||typeof value==='number'&&Number.isFinite(value))return value;
 if(typeof value==='string'){if(value.length>12000)fail('API input string is too long.');return value;}
 if(Array.isArray(value)){if(value.length>200)fail('Too many API input items.');return value.map(v=>cleanInput(v,depth+1));}
 if(!plain(value)||Reflect.ownKeys(value).length>100)fail('API input must be bounded JSON.');
 const out={};for(const key of Reflect.ownKeys(value)){const desc=Object.getOwnPropertyDescriptor(value,key);if(typeof key!=='string'||!desc||!Object.hasOwn(desc,'value')||['__proto__','constructor','prototype'].includes(key)||secretKey.test(key)||key.length>100)fail('Credentials and transport overrides are not API arguments.');out[key]=cleanInput(desc.value,depth+1);}return out;
}
function validateSchema(value,schema,label){
 if(!schema)return;
 if(schema.anyOf){if(!schema.anyOf.some(s=>{try{validateSchema(value,s,label);return true;}catch{return false;}}))fail(label+' has an unsupported value.');return;}
 if(schema.enum&&!schema.enum.includes(value))fail(label+' is not an allowed value.');
 const type=Array.isArray(value)?'array':value===null?'null':typeof value;
 if(schema.type&&schema.type!==type&&!(schema.type==='integer'&&type==='number'&&Number.isInteger(value)))fail(label+' must be '+schema.type+'.');
 if(type==='object'){for(const key of schema.required??[])if(!Object.hasOwn(value,key))fail(label+'.'+key+' is required.');for(const [key,item]of Object.entries(value)){
   const next=schema.properties?.[key];if(!next&&schema.additionalProperties===false)fail(label+'.'+key+' is not allowed.');validateSchema(item,next??(plain(schema.additionalProperties)?schema.additionalProperties:null),label+'.'+key);}}
 if(type==='array'){if(schema.maxItems!==undefined&&value.length>schema.maxItems)fail(label+' has too many items.');for(const item of value)validateSchema(item,schema.items,label+'[]');}
 if(type==='string'){if(schema.maxLength!==undefined&&value.length>schema.maxLength||schema.minLength!==undefined&&value.length<schema.minLength)fail(label+' has an invalid length.');if(schema.pattern&&!new RegExp(schema.pattern,'u').test(value))fail(label+' has an invalid format.');}
}
export function applicationApiOperations(catalog=applicationApiCatalog){return catalog.flatMap(route=>route.methods.map(method=>({id:route.slug+'.'+method.toLowerCase(),path:route.path,method,description:route.description,readOnly:route.readMethods.includes(method),callable:!route.disabledReason,unavailableReason:route.disabledReason,scopeHints:route.scopeHints,queryFields:route.queryFields,kindHints:route.kindHints??[],querySchema:route.querySchema,bodySchema:route.bodySchema,sourceHash:route.sourceHash,handlerSlug:route.aliasOf??route.slug,fixedQuery:route.fixedQuery??{}})));}
export function searchApplicationApis(query='',{catalog=applicationApiCatalog,limit=8}={}){
 const words=String(query).normalize('NFKC').toLowerCase().match(/[\p{L}\p{N}_-]+/gu)?.slice(0,24)??[];
 return applicationApiOperations(catalog).map(item=>({item,score:words.reduce((s,w)=>s+(JSON.stringify(item).toLowerCase().includes(w)?1:0),0)})).sort((a,b)=>b.score-a.score||a.item.id.localeCompare(b.item.id)).slice(0,Math.max(1,Math.min(20,limit))).map(({item})=>({id:item.id,method:item.method,path:item.path,description:item.description,readOnly:item.readOnly,callable:item.callable,unavailableReason:item.unavailableReason,scopeHints:item.scopeHints}));
}
export function describeApplicationApi(id,{catalog=applicationApiCatalog}={}){const operation=applicationApiOperations(catalog).find(item=>item.id===id);if(!operation)fail('Unknown application API operation.',404);return operation;}
export function validateApplicationApiCall(input,{catalog=applicationApiCatalog}={}){
 if(!plain(input)||Object.keys(input).some(k=>!['operationId','query','body'].includes(k))||typeof input.operationId!=='string')fail('Select an application API operation and JSON arguments.');
 const operation=describeApplicationApi(input.operationId,{catalog});if(!operation.callable)fail(operation.unavailableReason,403);
 const query=cleanInput(input.query??{}),body=cleanInput(input.body??{});if(!plain(query)||!plain(body))fail('Query and body must be objects.');
 for(const [key,value]of Object.entries(operation.fixedQuery)){if(Object.hasOwn(query,key)&&query[key]!==value)fail('A registered API alias selector cannot be overridden.');query[key]=value;}
 for(const [key,value]of Object.entries(query))if(!/^[a-zA-Z_][a-zA-Z0-9_-]{0,79}$/u.test(key)||!(typeof value==='string'||Array.isArray(value)&&value.length<=10&&value.every(v=>typeof v==='string')))fail('Query values must be strings or string arrays.');
 if(operation.path==='/api/affairs-data'&&(Array.isArray(query.resource)?query.resource:[query.resource]).some(resource=>['assistant-api-tools','evaluation-lab'].includes(resource)))fail('Assistant/control-plane resources cannot be called recursively.',403);
 validateSchema(query,operation.querySchema,'query');validateSchema(body,operation.bodySchema,'body');if(operation.method==='GET'&&Object.keys(body).length)fail('GET requests cannot contain a body.');
 const call={operationId:operation.id,query,body};if(Buffer.byteLength(JSON.stringify(call))>24000)fail('API arguments exceed the tool budget.',413);return {operation,call};
}
export function redactApiToolValue(value,account={},budget=24000){
 let redactions=0,truncated=false,remaining=budget;
 function walk(v,depth=0){
  if(remaining<100||depth>10){truncated=true;return '[Omitted: response limit]';}
  if(typeof v==='string'){
   let text=v.replace(/Bearer\s+[A-Za-z0-9._~-]+|\bsk-[A-Za-z0-9_-]{12,}|\beyJ[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/gu,()=>{redactions++;return '[credential redacted]';});
   for(const secret of [account.token,account.key])if(typeof secret==='string'&&secret.length>10&&text.includes(secret)){text=text.split(secret).join('[credential redacted]');redactions++;}
   text=text.replace(/https?:\/\/[^\s"<>]+/gu,url=>{try{const u=new URL(url);if(u.username||u.password||[...u.searchParams.keys()].some(k=>/token|signature|credential|api.?key|x-amz|x-goog/iu.test(k))){redactions++;return '[temporary private URL omitted]';}}catch{/* Non-URL literals remain data. */}return url;});
   if(text.startsWith('data:')){redactions++;return '[Inline file omitted]';}
   const cap=Math.max(0,Math.min(4000,Math.floor(remaining/3)));if(text.length>cap){text=text.slice(0,cap)+' [truncated]';truncated=true;}remaining-=Buffer.byteLength(text)+8;return text;
  }
  if(v===null||typeof v==='boolean'||typeof v==='number'){remaining-=20;return v;}
  if(Array.isArray(v)){if(v.length>50)truncated=true;return v.slice(0,50).map(x=>walk(x,depth+1));}
  if(plain(v)){const out={};for(const [key,item]of Object.entries(v).slice(0,100)){if(secretKey.test(key)){redactions++;continue;}if(remaining<100){truncated=true;break;}remaining-=Buffer.byteLength(key)+8;out[key]=walk(item,depth+1);}return out;}
  return '[Unsupported value omitted]';
 }
 const data=walk(value);return {data,truncated,redactions};
}
export async function invokeApplicationApi(account,input,{deadline=Date.now()+15000,catalog=applicationApiCatalog,loadHandler=loadApplicationApiHandler,allowReviewedWrite=false}={}){
 requireApiToolCaller(account);const {operation,call}=validateApplicationApiCall(input,{catalog});if(!operation.readOnly&&!allowReviewedWrite)fail('Review and confirm this action before it can run.',409);
 if(!Number.isFinite(deadline)||deadline<=Date.now())fail('API tool deadline expired.',408);
 const handler=await loadHandler(operation.handlerSlug);if(typeof handler!=='function')fail('API handler is unavailable.',503);
 let status=200,payload,finished=false,binary=false,timer;
 const response={status(code){if(!Number.isInteger(code)||code<100||code>599)fail('Invalid API response.',502);status=code;return response;},setHeader(){},json(value){if(finished)fail('API sent multiple responses.',502);finished=true;payload=value;return response;},send(value){if(finished)fail('API sent multiple responses.',502);finished=true;payload=value;return response;},end(value){finished=true;binary=value!==undefined;},write(){fail('Streaming endpoints are not callable as application tools.',400);}};
 const request={method:operation.method,headers:{authorization:'Bearer '+account.token,'content-type':'application/json','x-stu-assistant-tool-call':'1'},query:structuredClone(call.query),body:operation.method==='GET'?undefined:structuredClone(call.body),url:operation.path,socket:{remoteAddress:'127.0.0.1'}};
 try{await Promise.race([Promise.resolve().then(()=>handler(request,response)),new Promise((_,reject)=>{timer=setTimeout(()=>reject(new ApplicationApiToolError('API response time limit reached; action outcome may be unknown. Check records before retrying.',504)),Math.max(1,deadline-Date.now()));})]);}
 finally{clearTimeout(timer);}
 if(!finished)fail('The API returned no response.',502);
 const bounded=redactApiToolValue(binary?{binaryOmitted:true,message:'Open the native page to view or download this private file.'}:academicSourceRecords(payload),account);
 return {operationId:operation.id,path:operation.path,method:operation.method,status,ok:status>=200&&status<300,...bounded};
}
async function actionRoot(){const root=process.env.ASSISTANT_API_ACTION_STORE;if(process.env.VERCEL||!root||!isAbsolute(root))fail('A durable action store must be configured before API mutations can be reviewed.',503);await mkdir(root,{recursive:true,mode:0o700});const stat=await lstat(root);if(stat.isSymbolicLink()||!stat.isDirectory())fail('Invalid action store.',503);await chmod(root,0o700);return root;}
function actionPath(root,id){if(!uuid.test(id))fail('Invalid action review ID.');return join(root,id+'.json');}
export async function proposeApplicationApiAction(account,input,{catalog=applicationApiCatalog,now=Date.now()}={}){
 requireApiToolCaller(account);const {operation,call}=validateApplicationApiCall(input,{catalog});if(operation.readOnly)fail('This operation is read-only; use the read tool.');
 const id=randomUUID(),token=randomBytes(32).toString('base64url'),expiresAt=now+10*60*1000;
 const record={version:1,id,userId:account.user.id,tokenHash:createHash('sha256').update(token).digest('hex'),call,sourceHash:operation.sourceHash,expiresAt,state:'pending'};
 if(process.env.ASSISTANT_API_ACTION_STORE&&!process.env.VERCEL){
  const root=await actionRoot();if((await readdir(root)).filter(name=>name.endsWith('.json')).length>=1000)fail('The action review store is full; retire completed reviews before continuing.',429);
  const file=await open(actionPath(root,id),'wx',0o600);try{await file.writeFile(JSON.stringify(record));}finally{await file.close();}
 }else await apiReviewRpc(account,'assistant_api_create_review',{p_record:signApiReview(record)});
 return {kind:'invoke_application_api',requestId:id,label:`${operation.method} ${operation.path}`,url:'/school-affairs',payload:{confirmationToken:token,review:JSON.stringify({operationId:operation.id,method:operation.method,path:operation.path,query:call.query,body:call.body},null,2),expiresAt:String(expiresAt)}};
}
export async function confirmApplicationApiAction(account,{requestId,confirmationToken},{deadline=Date.now()+20000,catalog=applicationApiCatalog,loadHandler=loadApplicationApiHandler}={}){
 requireApiToolCaller(account);if(typeof confirmationToken!=='string'||!/^[a-zA-Z0-9_-]{43}$/u.test(confirmationToken)||!uuid.test(requestId))fail('Invalid action confirmation.');
 if(!process.env.ASSISTANT_API_ACTION_STORE||process.env.VERCEL){
  const claimed=await apiReviewRpc(account,'assistant_api_claim_review',{p_id:requestId,p_token_hash:createHash('sha256').update(confirmationToken).digest('hex')},deadline);
  if(claimed?.status==='completed')return verifiedApiReceipt(account.user.id,requestId,claimed.receipt);
  const record=claimed?.record;
  if(claimed?.status!=='claimed'||!validApiReview(record)||record.userId!==account.user.id||record.id!==requestId)fail('The API review signature could not be verified.',403);
  const finish=(state,receipt=null)=>apiReviewRpc(account,'assistant_api_finish_review',{p_id:requestId,p_state:state,p_receipt:receipt},Math.max(deadline,Date.now()+4000));
  let result;
  try{
   const operation=describeApplicationApi(record.call.operationId,{catalog});
   if(record.expiresAt<Date.now()||record.sourceHash!==operation.sourceHash){await finish('failed');fail('This review expired or the API changed. Request a fresh review.',409);}
   result=await invokeApplicationApi(account,record.call,{deadline,catalog,loadHandler,allowReviewedWrite:true});
   if(!result.ok){await finish('failed');fail('The API rejected the reviewed request (HTTP '+result.status+').',result.status);}
   const receipt={id:requestId,kind:'invoke_application_api',summary:`${operation.method} ${operation.path} returned HTTP ${result.status}`,result};
   await finish('completed',signApiReceipt(account.user.id,requestId,receipt));return receipt;
  }catch(error){if(result===undefined)await finish('outcome_unknown').catch(()=>{});throw error;}
 }
 const root=await actionRoot(),path=actionPath(root,requestId);let lock;
 try{lock=await open(path+'.lock','wx',0o600);}catch(error){if(error.code==='EEXIST')fail('This action is already running. Check its status before trying again.',409);throw error;}
 try{
  let record;try{record=JSON.parse(await readFile(path,'utf8'));}catch{fail('Action review is unavailable.',404);}
  const hash=createHash('sha256').update(confirmationToken).digest();if(record.userId!==account.user.id||typeof record.tokenHash!=='string'||record.tokenHash.length!==64||!timingSafeEqual(hash,Buffer.from(record.tokenHash,'hex')))fail('Action review is unavailable.',403);
  if(record.state==='completed')return record.receipt;
  if(record.state!=='pending')fail('The previous execution outcome needs inspection; it will not be repeated automatically.',409);
  const operation=describeApplicationApi(record.call.operationId,{catalog});if(record.expiresAt<Date.now()||record.sourceHash!==operation.sourceHash)fail('This review expired or the API changed. Ask for a new review.',409);
  async function save(){await writeFile(path+'.tmp',JSON.stringify(record),{mode:0o600});await rename(path+'.tmp',path);}
  record.state='executing';await save();
  try{
   const result=await invokeApplicationApi(account,record.call,{deadline,catalog,loadHandler,allowReviewedWrite:true});record.state=result.ok?'completed':'failed';record.result=result;
   if(result.ok)record.receipt={id:requestId,kind:'invoke_application_api',summary:`${operation.method} ${operation.path} returned HTTP ${result.status}`,result};await save();
   if(!result.ok)fail('The API rejected the action (HTTP '+result.status+'). Check its validation or permissions before requesting a new review.',result.status);
   return record.receipt;
  }catch(error){if(record.state==='executing'){record.state='outcome_unknown';await save();}throw error;}
 }finally{await lock.close();await unlink(path+'.lock').catch(()=>{});}
}
