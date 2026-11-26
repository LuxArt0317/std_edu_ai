import test from 'node:test';
import assert from 'node:assert/strict';
import handler from '../../api/affairs-data.ts';
const owner='10000000-0000-4000-8000-000000000001',token='fixture-auth-token-at-least-thirty-two-characters';
test('focused grades API accepts default transcript view, scopes reads to caller and rejects injected account filters',async()=>{
 const savedFetch=globalThis.fetch,savedUrl=process.env.VITE_SUPABASE_URL,savedKey=process.env.VITE_SUPABASE_PUBLISHABLE_KEY;const reads:URL[]=[];
 process.env.VITE_SUPABASE_URL='https://xiftudmvxphxcjtmfmib.supabase.co';process.env.VITE_SUPABASE_PUBLISHABLE_KEY='fixture-key';
 globalThis.fetch=async(input)=>{const url=new URL(String(input));if(url.pathname==='/auth/v1/user')return Response.json({id:owner,identities:[{provider:'google'}]});reads.push(url);return Response.json([]);};
 async function run(query:Record<string,string>){let code=0,body:any;const response:any={setHeader(){},status(value:number){code=value;return this;},json(value:any){body=value;}};await handler({method:'GET',headers:{authorization:'Bearer '+token},query} as any,response);return {code,body};}
 try{
  const value=await run({scope:'academic-grades'});assert.equal(value.code,200);assert.equal(value.body.academicGradesOnly,true);assert.equal(value.body.academicGradesView,'transcript');assert.equal(value.body.profile.userId,owner);assert.ok(reads.length>0);assert.ok(reads.every(url=>url.searchParams.get('user_id')==='eq.'+owner));assert.ok(reads.every(url=>url.pathname.includes('academic')));
  reads.length=0;assert.equal((await run({scope:'academic-grades',view:'current',user_id:'other'})).code,400);assert.equal(reads.length,0);
  assert.equal((await run({scope:'academic-grades',view:'invented'})).code,400);assert.equal(reads.length,0);
 }finally{globalThis.fetch=savedFetch;if(savedUrl===undefined)delete process.env.VITE_SUPABASE_URL;else process.env.VITE_SUPABASE_URL=savedUrl;if(savedKey===undefined)delete process.env.VITE_SUPABASE_PUBLISHABLE_KEY;else process.env.VITE_SUPABASE_PUBLISHABLE_KEY=savedKey;}
});
