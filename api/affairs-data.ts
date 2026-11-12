import { AffairsWorkspaceError, loadAffairsSnapshot, verifyAffairsToken } from '../server/affairsWorkspace.js';
import conversations from '../server/assistantConversations.js';
import { loadCourseCatalog } from '../server/courseCatalog.js';

type Request = {method?:string;headers:Record<string,string|string[]|undefined>;body?:unknown;query?:Record<string,string|string[]|undefined>};
type Response = {status:(code:number)=>Response;json:(body:unknown)=>void;setHeader:(name:string,value:string)=>void};
const first=(value:string|string[]|undefined)=>Array.isArray(value)?value[0]:value;
export default async function handler(request:Request,response:Response) {
  if(first(request.query?.resource)==='conversations')return conversations(request,response);
  response.setHeader('Cache-Control','no-store, max-age=0');
  response.setHeader('X-Content-Type-Options','nosniff');
  if(request.method!=='GET'){response.setHeader('Allow','GET');response.status(405).json({error:'Method not allowed'});return;}
  try {
    const authorization=first(request.headers.authorization);
    const account=await verifyAffairsToken(authorization?.startsWith('Bearer ')?authorization.slice(7):'');
    const snapshot=first(request.query?.scope)==='catalog'
      ? await loadCourseCatalog(account,request.query)
      : await loadAffairsSnapshot(account,first(request.query?.scope)==='admin');
    response.status(200).json(snapshot);
  } catch(error) {
    response.status(error instanceof AffairsWorkspaceError?error.status:503).json({error:error instanceof AffairsWorkspaceError?error.message:'School Affairs records could not be loaded.'});
  }
}
