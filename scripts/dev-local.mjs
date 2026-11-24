/** Loopback-only Vite + Vercel-compatible Node handlers for manual development. */
import http from 'node:http';
import {access} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {createServer as createViteServer,loadEnv} from 'vite';
import {createEvaluationLab} from '../tools/evaluation-lab/server.mjs';
import {validateEvaluationModel} from '../tools/evaluation-lab/models.mjs';
import {withAssistantModel} from '../server/assistantModelConfig.js';

const root=fileURLToPath(new URL('../',import.meta.url));
const port=Number(process.env.LOCAL_PORT||5173);
if(!Number.isInteger(port)||port<1024||port>65535)throw new Error('Invalid LOCAL_PORT');
for(const [key,value] of Object.entries(loadEnv('development',root,'')))if(process.env[key]===undefined)process.env[key]=value;
// Production-sensitive variables downloaded by the CLI can be placeholders.
// Refuse them before React or a handler starts instead of presenting a broken UI.
const placeholders=new Set(['[encrypted]','[REDACTED]','[redacted]']);
const localUrl=process.env.VITE_SUPABASE_URL||process.env.NEXT_PUBLIC_SUPABASE_URL||process.env.SUPABASE_URL;
const localKey=process.env.VITE_SUPABASE_PUBLISHABLE_KEY||process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY||process.env.SUPABASE_PUBLISHABLE_KEY||process.env.SUPABASE_ANON_KEY;
let validUrl=false;
try{validUrl=new URL(localUrl).protocol==='https:';}catch{}
if(!validUrl||!localKey||placeholders.has(localKey))throw new Error('Configure valid local client Supabase settings in ignored .env.local; encrypted placeholders cannot be used.');
if(!process.env.OPENAI_API_KEY||placeholders.has(process.env.OPENAI_API_KEY))throw new Error('Configure the existing server-only model credential in ignored .env.local.');
process.env.VERCEL_ENV='development';
const {default:configFactory}=await import('../vite.config.ts');
const config=typeof configFactory==='function'?await configFactory({command:'serve',mode:'development'}):configFactory;
let vite;
const evaluationLab=createEvaluationLab(root);
const modules=new Map();
const server=http.createServer(async(req,res)=>{
  const url=new URL(req.url||'/',`http://127.0.0.1:${port}`);
  if(url.pathname.startsWith('/__evaluation_lab/'))return evaluationLab(req,res);
  if(url.pathname==='/evaluation-lab'||url.pathname==='/evaluation-lab/'){res.writeHead(302,{Location:'/tools/evaluation-lab/index.html'});res.end();return;}
  if(!url.pathname.startsWith('/api/'))return vite.middlewares(req,res);
  res.setHeader('X-STU-Local-Agent','hybrid-plan-react');
  res.setHeader('Cache-Control','no-store');
  res.status=code=>{res.statusCode=code;return res;};
  res.json=value=>{res.setHeader('Content-Type','application/json; charset=utf-8');res.end(JSON.stringify(value));return res;};
  res.send=value=>{res.end(typeof value==='object'?JSON.stringify(value):value);return res;};
  try{
    let route=url.pathname.slice(5);
    if(route==='affairs-conversations'){route='affairs-data';url.searchParams.set('resource','conversations');}
    if(!/^[a-z][a-z0-9-]*$/.test(route))return res.status(404).json({error:'Local API route not found.'});
    const filename=resolve(root,'api',route+'.ts');
    try{await access(filename);}catch{return res.status(404).json({error:'Local API route not found.'});}
    req.query={};
    for(const key of new Set(url.searchParams.keys())){const values=url.searchParams.getAll(key);req.query[key]=values.length>1?values:values[0];}
    if(!['GET','HEAD','OPTIONS'].includes(req.method)){
      const chunks=[];let size=0;
      for await(const chunk of req){size+=chunk.length;if(size>8*1024*1024)return res.status(413).json({error:'Request body too large.'});chunks.push(chunk);}
      const raw=Buffer.concat(chunks).toString('utf8');
      if(raw){try{req.body=JSON.parse(raw);}catch{return res.status(400).json({error:'Invalid JSON request body.'});}}
    }
    if(!modules.has(route))modules.set(route,import(pathToFileURL(filename).href));
    const {default:handler}=await modules.get(route);
    console.info(`[local-api] ${req.method} /api/${route}`);
    const selectedModel=req.headers['x-stu-evaluation-model'];
    if(selectedModel){
      if(req.headers.origin&&req.headers.origin!==url.origin)return res.status(403).json({error:'Model overrides require this same local origin.'});
      const model=await validateEvaluationModel(selectedModel);
      const reasoning=req.headers['x-stu-evaluation-reasoning']||'medium';
      if(!['low','medium','high'].includes(reasoning))return res.status(400).json({error:'Choose a valid reasoning effort.'});
      res.setHeader('X-STU-Evaluation-Model',model);
      await withAssistantModel({model,reasoning},()=>handler(req,res));
    }else await handler(req,res);
    if(!res.writableEnded)res.end();
  }catch(error){
    console.error('[local-api] handler failed',error?.code||error?.name||'Error');
    if(!res.headersSent)res.status(500).json({error:'Local API handler failed. Check the local server terminal.'});
    else if(!res.writableEnded)res.end();
  }
});
vite=await createViteServer({...config,root,configFile:false,server:{...config.server,proxy:undefined,middlewareMode:true,hmr:{server}}});
server.on('error',error=>{console.error('Local server failed:',error.code);process.exitCode=1;void vite.close();});
server.listen(port,'127.0.0.1',()=>console.info(`Updated local frontend and API: http://127.0.0.1:${port}\nAPI requests execute this checkout; OpenAI and Supabase remain online. Restart after server code changes.`));
for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>{server.close();server.closeAllConnections();void vite.close().finally(()=>process.exit());});
