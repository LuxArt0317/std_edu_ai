import { AffairsWorkspaceError, manageAffairsRecord, verifyAffairsToken } from '../server/affairsWorkspace.js';

type Request = {method?:string;headers:Record<string,string|string[]|undefined>;body?:unknown};
type Response = {status:(code:number)=>Response;json:(body:unknown)=>void;setHeader:(name:string,value:string)=>void};
const first=(value:string|string[]|undefined)=>Array.isArray(value)?value[0]:value;
export default async function handler(request:Request,response:Response) {
  response.setHeader('Cache-Control','no-store, max-age=0');
  response.setHeader('X-Content-Type-Options','nosniff');
  if(request.method!=='POST'){response.setHeader('Allow','POST');response.status(405).json({error:'Method not allowed'});return;}
  let body:unknown=request.body;
  if(typeof body==='string'){try{body=JSON.parse(body);}catch{body=null;}}
  const input=body&&typeof body==='object'&&!Array.isArray(body)?body as Record<string,unknown>:null;
  if(!input || typeof input.kind!=='string' || !input.payload || typeof input.payload!=='object'
    || Array.isArray(input.payload) || JSON.stringify(input).length>4000){response.status(400).json({error:'Invalid manager request.'});return;}
  try {
    const authorization=first(request.headers.authorization);
    const account=await verifyAffairsToken(authorization?.startsWith('Bearer ')?authorization.slice(7):'');
    const result=await manageAffairsRecord(account,input.kind,input.payload);
    response.status(200).json(result);
  } catch(error) {
    response.status(error instanceof AffairsWorkspaceError?error.status:503).json({error:error instanceof AffairsWorkspaceError?error.message:'School Affairs record could not be saved.'});
  }
}
