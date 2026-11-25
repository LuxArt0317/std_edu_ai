import assert from 'node:assert/strict';
import test from 'node:test';
import {createResearchAssistantHandler} from '../../api/research-assistant.ts';

test('a saved public link correction reaches independent review without unnecessary web retrieval',async()=>{
 const previousFetch=globalThis.fetch,names=['OPENAI_API_KEY','VITE_SUPABASE_URL','VITE_SUPABASE_PUBLISHABLE_KEY'] as const;
 const previous=Object.fromEntries(names.map(name=>[name,process.env[name]]));
 process.env.OPENAI_API_KEY='unit-test';process.env.VITE_SUPABASE_URL='https://link-repair-unit.supabase.co';process.env.VITE_SUPABASE_PUBLISHABLE_KEY='unit-test';
 const operations:string[]=[];
 globalThis.fetch=async(url,options)=>{
  assert.equal(String(url),'https://api.openai.com/v1/responses');
  const request=JSON.parse(String(options?.body)),input=JSON.parse(request.input[0].content[0].text),operation=request.text.format.name;operations.push(operation);
  const source=input.evidence.find((row:any)=>JSON.parse(row.content).terminology);assert.ok(source);
  let output:any;
  if(operation==='compose_grounded_answer')output={status:'answered',answer:'[Housing applications](https://not-supplied.example/apply)',sourceIds:[source.id]};
  else if(operation==='correct_grounded_answer'){
   assert.ok(input.unsupportedClaims.some((value:string)=>value.includes(source.url)));
   output={status:'answered',answer:`[Housing applications](${source.url})`,sourceIds:[source.id]};
  }else{
   assert.equal(operation,'answer_evidence_review');assert.doesNotMatch(input.answer,/not-supplied/u);
   output={supported:true,answersQuestion:true,missingRequestedDetails:[],claims:[{claim:'Housing application link',supported:true,evidenceId:source.id,quotes:[],jsonPaths:['/localUrl']},{claim:'Source capture date',supported:true,evidenceId:source.id,quotes:[],jsonPaths:['/capturedOn']}]};
  }
  return Response.json({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify(output)}]}]});
 };
 try{
  let status=200,body:any;const response:any={status(code:number){status=code;return response;},json(value:any){body=value;},setHeader(){}};
  await createResearchAssistantHandler()({method:'POST',body:{question:'What are the dorm fees, and how do I apply (international students)?',route:'/'},headers:{'x-forwarded-for':'public-saved-link-recovery-unit'}},response);
  assert.equal(status,200);assert.deepEqual(operations,['compose_grounded_answer','correct_grounded_answer','answer_evidence_review']);
  assert.equal(body.verification.status,'verified');assert.equal(body.verification.attempts,1);
  assert.ok(body.activity.some((step:any)=>step.kind==='saved-source-link-correction'&&step.status==='complete'));
  assert.doesNotMatch(JSON.stringify(body),/not-supplied/u);
 }finally{globalThis.fetch=previousFetch;for(const name of names){if(previous[name]===undefined)delete process.env[name];else process.env[name]=previous[name];}}
});
