import assert from 'node:assert/strict';

const maximumBytes=2_000_000;
const mediaTypes=new Set(['application/json','application/problem+json','text/plain','text/html','text/event-stream','application/octet-stream']);
const platformCodes=new Set(['FUNCTION_INVOCATION_FAILED','FUNCTION_INVOCATION_TIMEOUT','FUNCTION_PAYLOAD_TOO_LARGE','FUNCTION_RESPONSE_PAYLOAD_TOO_LARGE',
  'EDGE_FUNCTION_INVOCATION_FAILED','EDGE_FUNCTION_INVOCATION_TIMEOUT','NO_RESPONSE_FROM_FUNCTION','DEPLOYMENT_NOT_FOUND','DEPLOYMENT_DISABLED','NOT_FOUND']);

/** Diagnose protocol failures without retaining response bodies, header parameters,
 * request URLs, request payloads, credentials or provider exception messages. */
export async function readNativeHttpResponse(response){
  const status=response.status;
  const rawType=response.headers.get('content-type')||'';
  const mime=rawType.split(';',1)[0].trim().toLowerCase();
  const contentType=mediaTypes.has(mime)?mime:rawType?'other':'missing';
  const headerCode=response.headers.get('x-vercel-error');
  const failure=code=>{
    const error=new assert.AssertionError({message:`Native API response: HTTP ${status}; content-type ${contentType}; diagnostic ${code}.`,operator:'valid bounded JSON response'});
    Object.assign(error,{status,contentType,diagnosticCode:code});
    return error;
  };
  const reader=response.body?.getReader(),chunks=[];
  let size=0;
  if(reader){
    try{
      while(true){
        const {done,value}=await reader.read();if(done)break;
        size+=value.byteLength;
        if(size>maximumBytes){void reader.cancel().catch(()=>{});throw failure('HTTP_RESPONSE_TOO_LARGE');}
        chunks.push(value);
      }
    }catch(error){if(error instanceof assert.AssertionError)throw error;throw failure('HTTP_RESPONSE_READ_FAILED');}
    finally{reader.releaseLock();}
  }
  const text=new TextDecoder().decode(Buffer.concat(chunks,size));
  try{return {status,contentType,body:JSON.parse(text)};}
  catch{
    const prefix=text.slice(0,4096);
    const observed=platformCodes.has(headerCode)?headerCode:[...platformCodes].find(code=>new RegExp(`(?:^|[^A-Z0-9_])${code}(?:$|[^A-Z0-9_])`).test(prefix));
    throw failure(observed||(contentType==='application/json'||contentType==='application/problem+json'?'INVALID_JSON_RESPONSE':'NON_JSON_RESPONSE'));
  }
}
