import assert from 'node:assert/strict';
import test from 'node:test';
import {createResearchAssistantHandler} from '../../api/research-assistant.ts';

test('public communication composition, source audit and correction share the same guidance mode',async()=>{
 const nativeFetch=globalThis.fetch,names=['OPENAI_API_KEY','VITE_SUPABASE_URL','VITE_SUPABASE_PUBLISHABLE_KEY'] as const;
 const saved=Object.fromEntries(names.map(name=>[name,process.env[name]]));
 process.env.OPENAI_API_KEY='unit-test';process.env.VITE_SUPABASE_URL='https://guidance-unit.supabase.co';process.env.VITE_SUPABASE_PUBLISHABLE_KEY='unit-test';
 const requests:Array<{name:string;input:any;schema:any}>=[];let reviews=0;
 globalThis.fetch=async(url,options)=>{
  assert.equal(String(url),'https://api.openai.com/v1/responses','No private records, sends or new source search are needed for this correction.');
  const request=JSON.parse(String(options?.body)),input=JSON.parse(request.input[0].content[0].text),name=request.text.format.name;
  requests.push({name,input,schema:request.text.format.schema});
  if(['compose_grounded_answer','correct_grounded_answer'].includes(name)){
   assert.match(request.instructions,/does not establish that the whole website lacks it/u);
   assert.match(request.instructions,/relevant source-backed alternatives/u);
  }
  const source=input.evidence.find((row:any)=>row.id.startsWith('public-page:communication-links:'));
  assert.ok(source);const metadata=JSON.parse(source.content),index=metadata.links.findIndex((link:any)=>link.label==='服務品質信箱');assert.ok(index>=0);
  let result:any;
  if(name==='compose_grounded_answer')result={status:'answered',answer:'All students receive every site announcement.',sourceIds:[source.id]};
  else if(name==='correct_grounded_answer')result={status:'answered',answer:`[服務品質信箱](${metadata.links[index].url})\n\nWho should receive your message?`,sourceIds:[source.id]};
  else{
   assert.equal(name,'answer_evidence_review');reviews++;
   result={supported:reviews>1,answersQuestion:true,parts:input.answerParts.map((part:any)=>{
    const question=part.text.includes('?'),snapshot=part.text.startsWith('Source snapshot:'),accepted=reviews>1||snapshot;
    return{id:part.id,kind:question?'clarification':'factual',accepted:question||accepted,claims:question?[]:[{claim:part.text,supported:accepted,evidenceId:source.id,quotes:[],jsonPaths:[snapshot?'/capturedOn':`/links/${index}/url`]}]};
   })};
  }
  return Response.json({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify(result)}]}]});
 };
 try{
  const handler=createResearchAssistantHandler();let status=200,body:any;
  const response:any={status(code:number){status=code;return response;},json(value:any){body=value;},setHeader(){}};
  await handler({method:'POST',body:{question:'Can the website provide a way to communicate with students?',route:'/'},headers:{'x-forwarded-for':'guidance-mode-unit'}},response);
  assert.equal(status,200);assert.equal(body.verification.status,'verified');assert.equal(body.verification.attempts,2);
  assert.match(body.answer,/Who should receive/u);assert.doesNotMatch(body.answer,/All students receive every/u);
  assert.deepEqual(requests.map(request=>request.name),['compose_grounded_answer','answer_evidence_review','correct_grounded_answer','answer_evidence_review']);
  for(const request of requests.filter(row=>row.name!=='answer_evidence_review'))assert.equal(request.input.responseIntent,'mixed');
  for(const request of requests.filter(row=>row.name==='answer_evidence_review'))assert.ok(request.schema.properties.parts);
 }finally{globalThis.fetch=nativeFetch;for(const name of names){if(saved[name]===undefined)delete process.env[name];else process.env[name]=saved[name];}}
});
