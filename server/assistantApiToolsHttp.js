import {verifyAffairsToken,AffairsWorkspaceError} from './affairsWorkspace.js';
import {applicationApiOperations,searchApplicationApis,describeApplicationApi,invokeApplicationApi,proposeApplicationApiAction,confirmApplicationApiAction,ApplicationApiToolError} from './applicationApiTools.js';
export function createAssistantApiToolsHandler({verify=verifyAffairsToken,invoke=invokeApplicationApi,propose=proposeApplicationApiAction,confirm=confirmApplicationApiAction}={}){
 return async(request,response)=>{
  response.setHeader('Cache-Control','no-store');response.setHeader('X-Content-Type-Options','nosniff');
  if(!['GET','POST'].includes(request.method??'')){response.setHeader('Allow','GET, POST');response.status(405).json({error:'Method not allowed'});return;}
  try{
   const raw=Array.isArray(request.headers.authorization)?request.headers.authorization[0]:request.headers.authorization;
   const account=await verify(raw?.startsWith('Bearer ')?raw.slice(7):'');
   if(request.method==='GET'){
    const id=request.query?.operationId,q=request.query?.q;if(Array.isArray(id)||Array.isArray(q))throw new ApplicationApiToolError('Use one operation ID or search query.');
    response.status(200).json(id?describeApplicationApi(id):q?{operations:searchApplicationApis(q)}:{operations:applicationApiOperations().map(({querySchema:_querySchema,bodySchema:_bodySchema,...operation})=>operation)});return;
   }
   let input=request.body;if(typeof input==='string'){try{input=JSON.parse(input);}catch{throw new ApplicationApiToolError('Provide JSON input.');}}
   if(!input||typeof input!=='object'||Array.isArray(input)||Buffer.byteLength(JSON.stringify(input))>30000)throw new ApplicationApiToolError('Provide a bounded JSON request.');
   const item=input,deadline=Date.now()+22000;
   if(item.action==='confirm'){
    if(Object.keys(item).some(k=>!['action','requestId','confirmationToken'].includes(k)))throw new ApplicationApiToolError('Invalid action confirmation.');
    response.status(200).json(await confirm(account,{requestId:item.requestId,confirmationToken:item.confirmationToken},{deadline}));return;
   }
   if(!['read','propose'].includes(item.action)||Object.keys(item).some(k=>!['action','operationId','query','body'].includes(k)))throw new ApplicationApiToolError('Choose read or propose.');
   const call={operationId:item.operationId,query:item.query,body:item.body};response.status(200).json(item.action==='read'?await invoke(account,call,{deadline}):await propose(account,call));
  }catch(error){response.status(error instanceof ApplicationApiToolError||error instanceof AffairsWorkspaceError?error.status:503).json({error:error instanceof ApplicationApiToolError||error instanceof AffairsWorkspaceError?error.message:'Application API tools are unavailable.'});}
 };
}
export default createAssistantApiToolsHandler();
