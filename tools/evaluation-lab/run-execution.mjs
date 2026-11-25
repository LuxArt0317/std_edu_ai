/** Descriptive run metadata, never an authentication or authorization decision. */
export function sanitizeRunExecution(input){
 if(!input||!['website-assistant','api-only'].includes(input.client))return null;
 const shared={route:typeof input.route==='string'?input.route.slice(0,500):'',dispatched:Array.isArray(input.dispatched)?input.dispatched.filter(path=>['/api/affairs-assistant','/api/research-assistant'].includes(path)).slice(0,20):[]};
 return input.client==='api-only'?{client:'api-only',entryPoint:'api-only',...shared}:{client:'website-assistant',authenticated:input.authenticated===true,entryPoint:input.entryPoint==='school-affairs-client'?'school-affairs-client':'public-client',...shared};
}
