import assert from 'node:assert/strict';
import {test} from 'node:test';
import handler from '../../api/affairs-assistant.ts';

test('private endpoint refreshes records after rejection without repeating initialization or executing writes',async()=>{
  const saved={...process.env},original=globalThis.fetch;
  process.env.OPENAI_API_KEY='test-key';process.env.VITE_SUPABASE_URL='https://xiftudmvxphxcjtmfmib.supabase.co';process.env.VITE_SUPABASE_PUBLISHABLE_KEY='test-public';
  const userId='10000000-0000-4000-8000-000000000099',token='x'.repeat(40);
  let reads=0,reviews=0,repairs=0;const rpc:string[]=[];
  try {
    globalThis.fetch=async(input,init)=>{
      const url=new URL(String(input));
      if(url.hostname==='api.openai.com') {
        const body=JSON.parse(String(init?.body));const payload=JSON.parse(body.input[0].content[0].text);
        let result:unknown;
        if(body.text.format.name==='account_lookup_plan')result={tools:['charges','tasks'],publicTopics:[]};
        else if(body.text.format.name==='answer_evidence_review') {
          reviews++;result=reviews===1?{supported:false,answersQuestion:false,claims:[]}:
            {supported:true,answersQuestion:true,claims:[{claim:'NT$500 remains',supported:true,evidenceId:'account:charges',quotes:[],jsonPaths:['/records/0/amountDue','/records/0/amountPaid']},
              {claim:'No open tasks are saved',supported:true,evidenceId:'account:tasks',quotes:[],jsonPaths:['/records']}]};
        } else {
          assert.equal(body.text.format.name,'correct_grounded_answer');repairs++;
          assert.match(JSON.stringify(payload.evidence),/amountPaid\\":500/);
          assert.ok(payload.evidence.some((source:{id:string})=>source.id==='account:tasks'));
          result={status:'answered',answer:'Your sample tuition is NT$1,000, paid NT$500, so NT$500 remains. No open tasks are saved.',sourceIds:['account:charges','account:tasks']};
        }
        return Response.json({output:[{content:[{type:'output_text',text:JSON.stringify(result)}]}]});
      }
      assert.equal(url.hostname,'xiftudmvxphxcjtmfmib.supabase.co');
      assert.equal((init?.headers as Record<string,string>).Authorization,'Bearer '+token);
      if(url.pathname==='/auth/v1/user')return Response.json({id:userId,identities:[{provider:'google'}]});
      const table=url.pathname.split('/').at(-1)!;
      if(url.pathname.includes('/rpc/')) {rpc.push(table);return Response.json(null);}
      assert.ok(!init?.method||init.method==='GET');
      if(table==='affairs_profiles') {reads++;return Response.json([{user_id:userId,email:'test@example.invalid',display_name:'Synthetic',role:'student'}]);}
      if(table==='affairs_students')return Response.json([{id:'student',user_id:userId,source_mode:'sample'}]);
      if(table==='affairs_charges')return Response.json([{id:'charge',label:'Sample tuition',amount_due:1000,amount_paid:reads===1?400:500,currency:'TWD',source_mode:'sample'}]);
      return Response.json([]);
    };
    let body:any;const response={status(_code:number){return response;},json(value:unknown){body=value;},setHeader(){}};
    await handler({method:'POST',headers:{authorization:'Bearer '+token},body:{question:'What is my tuition balance and which tasks are open?'}},response);
    assert.equal(body.verification.status,'verified',JSON.stringify(body));assert.equal(body.verification.attempts,2);
    assert.match(body.answer,/NT\$500 remains/);assert.equal(reads,2);assert.equal(reviews,2);assert.equal(repairs,1);
    assert.deepEqual(rpc,['affairs_initialize_account','dtm_initialize_account']);
    assert.equal(body.proposedAction,undefined);
  } finally {
    globalThis.fetch=original;
    for(const key of ['OPENAI_API_KEY','VITE_SUPABASE_URL','VITE_SUPABASE_PUBLISHABLE_KEY'])if(saved[key]===undefined)delete process.env[key];else process.env[key]=saved[key];
  }
});
