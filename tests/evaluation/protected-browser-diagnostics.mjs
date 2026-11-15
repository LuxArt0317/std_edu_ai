const categories=new Set([
  'invalid URL','invalid request body','invalid JSON body','missing response body','response limit','invalid resource origin',
  'invalid resource allowlist','invalid data route allowlist','invalid fixture config','release pin failed',
  'exact release could not be verified','Preview credential expired','invalid conversation reservation','invalid request signal','inherited Preview credential',
  'unapproved request origin','caller credential on a public resource','wrong fixture caller','unreserved conversation read',
  'unexpected assistant envelope','unreserved assistant turn or frame','unreserved conversation save','unapproved request operation',
  'save intent could not be verified and journaled','request could not reach the pinned deployment','unexpected redirect or response URL',
  'unexpected application status','unexpected application response','credential in response','invalid assistant stream correlation',
  'invalid assistant stream result','unreserved conversation in index','wrong conversation response','save stream binding',
  'save malformed assistant stream','save assistant abstained','save assistant clarification','save assistant handoff',
  'save unexpected assistant status','save assistant unverified','save unexpected proposed action','save envelope mismatch',
  'save message shape mismatch','save answer mismatch','save verification mismatch','save no completed activity',
  'save activity mismatch','save terminal activity mismatch','save fixture owner mismatch','save reserved row already present',
  'save journal write failed','save receipt not journaled','save receipt mismatch',
  'egress observation limit','invalid certificate response',
]);
const codes=new Set([...categories].map(category=>category.toLowerCase().replaceAll(' ','-')));
const paths=new Set(['/api/affairs-data','/api/affairs-assistant','/api/affairs-conversations']);
const methods=new Set(['GET','POST','OPTIONS']);
export class ProtectedBrowserDiagnostic extends Error{
  constructor(category,status){
    const safe=categories.has(category)?category:'unexpected failure';
    super('Protected browser transport: '+safe+'.');
    this.code=safe.toLowerCase().replaceAll(' ','-');
    if(Number.isInteger(status)&&status>=100&&status<=599)this.status=status;
  }
}
export const requireProtectedBrowser=(condition,category,status)=>{
  if(!condition)throw new ProtectedBrowserDiagnostic(category,status);
};

export function protectedBrowserDenial({origin,url,method,error}){
  let destination;
  try{destination=new URL(url);}catch{return null;}
  if(destination.origin!==origin||!destination.pathname.startsWith('/api/'))return null;
  const diagnostic=error instanceof ProtectedBrowserDiagnostic?error:new ProtectedBrowserDiagnostic();
  return {path:paths.has(destination.pathname)?destination.pathname:'/api/other',
    method:methods.has(method)?method:'other',code:codes.has(diagnostic.code)?diagnostic.code:'unexpected-failure',
    ...(Number.isInteger(diagnostic.status)&&diagnostic.status>=100&&diagnostic.status<=599?{status:diagnostic.status}:{})};
}
