/** Only evaluation configuration/proxying differs; request selection stays in chat. */
export function createLabChatTransport({model,reasoning,hosted=false,authorization,fetcher=fetch,onDispatch=()=>{}}){
  return {fetch:async(input,init={})=>{
    const requested=typeof input==='string'?input:input instanceof URL?input.href:input.url;
    const url=new URL(requested,globalThis.location?.origin||'http://127.0.0.1');
    const operation=url.pathname==='/api/research-assistant'?'run-public':url.pathname==='/api/affairs-assistant'?'run-account':null;
    if(!operation)return fetcher(input,init);
    const headers=new Headers(init.headers);if(hosted&&authorization)headers.set('Authorization',authorization);headers.set('X-STU-Evaluation-Model',model);headers.set('X-STU-Evaluation-Reasoning',reasoning);
    // Hosted evaluation endpoints require the existing admin identity; supplied
    // only as a transport header, never placed in the model request body.
    const target=hosted?'/api/affairs-data?resource=evaluation-lab&op='+operation:requested;
    onDispatch(url.pathname);
    const response=await fetcher(target,{...init,headers});
    if(response.ok&&response.headers.get('X-STU-Evaluation-Model')!==model)throw Error('The API did not acknowledge the selected model.');
    return response;
  }};
}
