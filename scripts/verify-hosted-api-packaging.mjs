import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,mkdir,symlink,rm,readdir} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {pathToFileURL} from 'node:url';
import ts from 'typescript';

// Execute compiled JavaScript, without the source .ts files that Vercel omits.
const root=process.cwd(),temporary=await mkdtemp(path.join(os.tmpdir(),'stu-api-package-'));

const files=[];
async function sourceFiles(directory){
 for(const item of await readdir(path.join(root,directory),{withFileTypes:true})){
  const name=path.join(directory,item.name);
  if(item.isDirectory())await sourceFiles(name);
  else if(item.isFile()&&/\.(?:[mc]?js|tsx?|json)$/.test(name)&&!/\.d\.(?:ts|mts|cts)$/.test(name))files.push(name);
 }
}
for(const directory of ['api','server','src','tools/evaluation-lab','tests/evaluation'])await sourceFiles(directory);
const originalFetch=globalThis.fetch;
const environmentKeys=['VITE_SUPABASE_URL','VITE_SUPABASE_PUBLISHABLE_KEY'];
const originalEnvironment=Object.fromEntries(environmentKeys.map(key=>[key,process.env[key]]));
try{
  await writeFile(path.join(temporary,'package.json'),'{"type":"module"}\n');
  await symlink(path.join(root,'node_modules'),path.join(temporary,'node_modules'),'dir');
  for(const name of files){
    const source=await readFile(path.join(root,name),'utf8');
    const typed=/\.tsx?$/.test(name),destination=path.join(temporary,typed?name.replace(/\.tsx?$/,'.js'):name);
    const code=typed?ts.transpileModule(source,{fileName:name,compilerOptions:{target:ts.ScriptTarget.ES2023,
      module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.ReactJSX}}).outputText:source;
    if((name.startsWith('api/')||name.startsWith('server/'))&&/(?:from\s*|import\s*\()(['\"])[^'\"]+\.ts\1/.test(code))throw Error('Source-only runtime import in '+name);
    await mkdir(path.dirname(destination),{recursive:true});await writeFile(destination,code);
  }
  globalThis.fetch=async()=>{throw Error('Packaging verification must not contact a provider.');};
  await import(pathToFileURL(path.join(temporary,'server/affairsAssistantRuntime.js')).href);
  const {default:handler}=await import(pathToFileURL(path.join(temporary,'api/affairs-data.js')).href);
  let status=0,body;
  const response={setHeader(){},status(value){status=value;return this;},json(value){body=value;return this;}};
  await handler({method:'GET',headers:{},query:{resource:'evaluation-lab',op:'state'}},response);
  assert.equal(status,401,JSON.stringify(body));
  // Traverse the actual hosted run-account branch, rather than merely importing
  // its target. All network responses below are local fixtures; unexpected calls fail.
  process.env.VITE_SUPABASE_URL='https://xiftudmvxphxcjtmfmib.supabase.co';
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY='packaging-fixture-not-a-credential';
  const observed=[];
  globalThis.fetch=async target=>{
    const url=String(target);observed.push(url);
    if(url==='https://xiftudmvxphxcjtmfmib.supabase.co/auth/v1/user')
      return Response.json({id:'00000000-0000-4000-8000-000000000001',email:'fixture@example.invalid',identities:[{provider:'google'}]});
    if(url==='https://xiftudmvxphxcjtmfmib.supabase.co/rest/v1/rpc/evaluation_lab_access')return Response.json(true);
    if(url==='https://api.openai.com/v1/models')return Response.json({data:[{id:'gpt-6-luna'}]});
    throw Error('Unexpected packaging fixture request: '+url);
  };
  status=0;body=undefined;
  await handler({method:'POST',headers:{authorization:'Bearer '+ 'fixture'.repeat(8),'x-stu-evaluation-model':'gpt-6-luna'},
    query:{resource:'evaluation-lab',op:'run-account'},body:{question:''}},response);
  assert.equal(status,400,JSON.stringify(body));
  assert.match(body.error,/Provide a question/u);
  assert.ok(observed.some(url=>url.endsWith('/rpc/evaluation_lab_access')));
  assert.equal(observed.length,3);
  // Exercise the generic tool's real handler loader with every TypeScript source absent.
  const apiTools=await import(pathToFileURL(path.join(temporary,'server/applicationApiTools.js')).href);
  const apiCatalog=await import(pathToFileURL(path.join(temporary,'server/applicationApiCatalog.generated.js')).href);
  for(const route of apiCatalog.applicationApiCatalog.filter(row=>!row.disabledReason))assert.equal(typeof await apiCatalog.loadApplicationApiHandler(route.slug),'function');
  const previousFixtureFetch=globalThis.fetch;
  globalThis.fetch=async(target,init)=>String(target).endsWith('/auth/v1/user')&&init?.headers?.Authorization==='Bearer packaging-denied-token'
    ?Response.json({error:'Denied fixture token'},{status:401}):previousFixtureFetch(target,init);
  const toolDenied=await apiTools.invokeApplicationApi({user:{id:'00000000-0000-4000-8000-000000000001'},token:'packaging-denied-token'},
    {operationId:'affairs-data.get',query:{scope:'student-profile'}},{deadline:Date.now()+5000});
  assert.equal(toolDenied.status,401);assert.equal(toolDenied.ok,false);
  console.log(JSON.stringify({compiledApiImport:true,sourceTypeScriptAbsent:true,publicAndAccountHandlersLinked:true,
    authenticatedHostedAccountDispatch:true,applicationApiHandlersLinked:true,applicationApiDenied:true,unauthenticatedDenied:true,providerCalls:0,fixtureRequests:observed.length}));
}finally{
  globalThis.fetch=originalFetch;
  for(const key of environmentKeys){if(originalEnvironment[key]===undefined)delete process.env[key];else process.env[key]=originalEnvironment[key];}
  await rm(temporary,{recursive:true,force:true});
}
