import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createAffairsAssistantHandler} from '../../api/affairs-assistant.ts';

const rejectedDraft={status:'answered',answer:'All software employers require a designation.',sourceIds:[]};
const rejectedReview={supported:false,answersQuestion:false,parts:[{id:1,kind:'factual',accepted:false,claims:[]}]};
const endpoint='https://api.openai.com/v1/responses';

async function ask(questions:string[],{providerAvailable=true}={}){
  const original=globalThis.fetch,oldKey=process.env.OPENAI_API_KEY;
  const outbound:string[]=[];
  if(providerAvailable)process.env.OPENAI_API_KEY='test-only-account-coaching';
  else delete process.env.OPENAI_API_KEY;
  const handler=createAffairsAssistantHandler({
    verifyToken:async()=>({url:'https://xiftudmvxphxcjtmfmib.supabase.co',key:'test-only',token:'test-only',
      user:{id:'17000000-0000-4000-8000-000000000001'}}),
    loadSnapshot:async()=>assert.fail('No account records are needed for these requests.'),
    publicResearch:async()=>assert.fail('No unrelated public research should run.'),
  });
  globalThis.fetch=async(input,init)=>{
    assert.equal(String(input),endpoint);
    const request=JSON.parse(String(init?.body)),operation=request.text.format.name;
    const payload=JSON.parse(request.input[0].content[0].text);
    assert.deepEqual(payload.evidence,[]);
    outbound.push(operation);
    if(operation==='answer_evidence_review'){
      return Response.json({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify(rejectedReview)}]}]});
    }
    assert.ok(['compose_grounded_answer','correct_grounded_answer'].includes(operation));
    return Response.json({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify(rejectedDraft)}]}]});
  };
  try{
    const results=[];
    for(const question of questions){
      let status=0,body:any;
      const response={setHeader(){},status(code:number){status=code;return response;},json(value:unknown){body=value;}};
      await handler({method:'POST',headers:{authorization:'Bearer TEST'},body:{question,route:'/dtm'}},response);
      assert.equal(status,200);
      results.push(body);
    }
    return {results,outbound};
  }finally{globalThis.fetch=original;if(oldKey===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=oldKey;}
}

test('record-free practice can use a guide when the model is unavailable',async()=>{
  const {results,outbound}=await ask([
    'How should I introduce myself in a presentation?',
    'How should I study?',
    '可以幫我準備面試嗎？',
  ],{providerAvailable:false});
  assert.deepEqual(outbound,[]);
  for(const answer of results){
    assert.equal(answer.status,'answered');
    assert.equal(answer.grounding.source,'general-guidance');
    assert.equal(answer.grounding.webSearched,false);
    assert.deepEqual(answer.citations,[]);
    assert.equal(answer.proposedAction,undefined);
  }
  assert.match(results[0].answer,/\[topic\].*\[one example\]/);
  assert.match(results[1].answer,/answering from memory/);
  assert.match(results[2].answer,/［實際做的工作］/);
});

test('an interview request for official school eligibility cannot use a record-free guide',async()=>{
  const {results:[answer],outbound}=await ask(['Can you help me prepare for an interview about official school eligibility?']);
  assert.deepEqual(outbound,['compose_grounded_answer','answer_evidence_review','correct_grounded_answer','answer_evidence_review']);
  assert.equal(answer.status,'abstained');
  assert.equal(answer.verification.status,'unverified');
  assert.equal(answer.verification.attempts,2);
  assert.doesNotMatch(answer.answer,/designation|qualified|Pick one real example/);
  assert.equal(answer.activity.some((step:{kind:string})=>step.kind==='general-coaching-guide'),false);
});
