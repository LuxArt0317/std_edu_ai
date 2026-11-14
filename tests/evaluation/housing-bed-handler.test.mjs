import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createAffairsAssistantHandler} from '../../api/affairs-assistant.ts';
import {AffairsWorkspaceError} from '../../server/affairsWorkspace.js';
import {readHousingBedEvidence} from '../../server/accountHousingBedEvidence.js';
import {buildHousingBedNativeCases,gradeHousingBedNativeCase,housingBedNativeFixtureForCase} from './housing-bed-native-cases.mjs';

const project='https://xiftudmvxphxcjtmfmib.supabase.co';
const range=rows=>Response.json(rows,{headers:{'content-range':rows.length?'0-'+(rows.length-1)+'/'+rows.length:'*/0'}});
const id=index=>'34020000-0000-4000-8000-'+String(index).padStart(12,'0');

test('all housing questions exercise the real API and are graded against independent saved records',async()=>{
  const originalFetch=globalThis.fetch,originalKey=process.env.OPENAI_API_KEY;
  const failures=[],OriginalDate=Date;
  process.env.OPENAI_API_KEY='HOUSING_TEST_FIXTURE';
  try{
    for(const row of buildHousingBedNativeCases()){
      const fixture=housingBedNativeFixtureForCase(row),owner=fixture.ownerId;
      const caller={url:project,key:'HOUSING_TEST_KEY',token:'HOUSING_TEST_TOKEN',user:{id:owner}};
      const readTools=new Set(),events=[],errors=[],selectedFields=new Set();
      let housingRead=null,selection=null,statusCode=200,body=null;
      const response={setHeader(){},status(status){statusCode=status;return response;},json(value){body=value;},
        write(text){
          const match=/^event: (.+)\ndata: (.+)\n\n$/u.exec(text);
          assert.ok(match);
          const event=JSON.parse(match[2]);
          if(['result','error'].includes(match[1]))body=event;
          else events.push(event);
        },end(){}};
      const now=Date.parse(fixture.asOf);
      globalThis.Date=class FixtureDate extends OriginalDate {
        constructor(...args){super(...(args.length?args:[now]));}
        static now(){return now;}
      };
      globalThis.fetch=async(input,init)=>{
        try{
          const url=new URL(String(input)),resource=url.pathname.split('/').at(-1);
          if(url.origin===project){
            assert.equal(new Headers(init?.headers).get('authorization'),'Bearer '+caller.token);
            assert.equal(init?.method,'GET');
            if(resource==='affairs_students'){
              assert.equal(url.searchParams.get('user_id'),'eq.'+owner);
              return Response.json([{id:id(1),user_id:owner}]);
            }
            if(['affairs_housing_assignments','affairs_housing_periods'].includes(resource)){
              readTools.add('housing');
              const columns=url.searchParams.get('select').split(',');
              if(resource==='affairs_housing_assignments'){
                assert.equal(url.searchParams.get('user_id'),'eq.'+owner);
                for(const column of columns)selectedFields.add(column);
              }
              if(fixture.transportFailure)return new Response(null,{status:503});
              const source=resource==='affairs_housing_assignments'?fixture.assignments:fixture.periods.filter(item=>url.searchParams.get('id').includes(item.id));
              return range(source.map(item=>Object.fromEntries(columns.map(column=>[column,item[column]]))));
            }
            assert.equal(url.searchParams.get('student_id'),'eq.'+id(1));
            if(resource==='affairs_charges'){
              readTools.add('charges');
              return range(fixture.charges.map(item=>({id:id(2),student_id:id(1),label:item.label,amount_due:item.amountDue,
                amount_paid:item.amountPaid,currency:item.currency,source_mode:item.sourceMode})));
            }
            assert.equal(resource,'affairs_enrollments');
            readTools.add('courses');
            return range(fixture.courses.filter(item=>item.status==='enrolled').map((item,index)=>{
              const n=10+index*4;
              return {id:id(n),student_id:id(1),status:item.status,source_mode:'sample',section_id:id(n+1),student:{id:id(1),user_id:owner},
                section:{id:id(n+1),course_id:id(n+2),term_id:id(n+3),weekday:item.weekday,room:item.room,starts_at:item.startsAt,ends_at:item.endsAt,
                  course:{id:id(n+2),code:item.code,title:item.title},term:{id:id(n+3),label:item.term.label,starts_on:item.term.startsOn,ends_on:item.term.endsOn}}};
            }));
          }
          assert.equal(url.origin,'https://api.openai.com');
          const request=JSON.parse(String(init?.body)),packet=JSON.parse(request.input[0].content[0].text);
          assert.equal(request.text.format.name,'answer_evidence_review','These supported routes draft directly from their saved sources.');
          const claims=packet.evidence.filter(item=>item.id.startsWith('account:')).map(item=>{
            const data=JSON.parse(item.content);
            const jsonPaths=item.id==='account:housing'
              ?data.records.length?[...Object.keys(data.records[0]).map(field=>{
                const index=data.records.findIndex(record=>record[field]!=null);
                return '/records/'+Math.max(0,index)+'/'+field;
              }),...(data.readState==='partial'?['/readState']:[])]:['/readState']
              :item.id==='account:charges'?['/records/0/amountDue','/records/0/amountPaid']
                :['/records/0/code','/records/0/room','/calendar/records/next/day'];
            return {claim:'Checked the saved '+item.id+' evidence',evidenceId:item.id,jsonPaths,quotes:[],supported:true};
          });
          return Response.json({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify({supported:true,answersQuestion:true,claims})}]}]});
        }catch(error){errors.push(error);throw error;}
      };
      try{
        const unexpected=async()=>{const error=new Error('No broad snapshot or public search should run.');errors.push(error);throw error;};
        const handler=createAffairsAssistantHandler({
          verifyToken:async()=>{if(row.auth==='anonymous')throw new AffairsWorkspaceError('Sign in first.',401);return caller;},
          loadSnapshot:unexpected,publicResearch:unexpected,
          readers:{housingBed:async(account,options)=>{
            selection=options;
            const result=await readHousingBedEvidence(account,options);
            housingRead=JSON.parse(result.evidence.content);
            return result;
          }},
        });
        await handler({method:'POST',headers:{authorization:row.auth==='anonymous'?undefined:'Bearer '+caller.token},
          body:{question:row.question,route:row.route,history:row.history,stream:true}},response);
      }finally{globalThis.Date=OriginalDate;}
      assert.deepEqual(errors,[],row.id);
      const expected=row.observationExpectation;
      const tools=expected.tools.filter(tool=>readTools.has(tool));
      for(const tool of readTools)if(!tools.includes(tool))tools.push(tool);
      const housing=housingRead?{ownerId:owner,state:housingRead.readState,total:housingRead.counts.matching,complete:housingRead.complete,
        fields:[...selection.fields],records:housingRead.records}:null;
      const columns={dormitory:'dormitory',bunk:'bunk',accommodationFee:'accommodation_fee',deposit:'deposit',subsidyAmount:'subsidy_amount'};
      assert.deepEqual([...selectedFields],housing?['id','user_id','period_id','bed_number','version',...housing.fields.flatMap(field=>columns[field]?[columns[field]]:[])]:[],row.id);
      const observation={sourceRead:{ownerId:row.auth==='anonymous'?null:owner,tools,housing},writes:[],storage:[],publicResearch:[]};
      const envelope={statusCode,execution:'deterministic',fixtureKey:row.fixtureKey,events,body};
      const outcome=gradeHousingBedNativeCase(row,envelope,{observation});
      if(!outcome.passed)failures.push({id:row.id,failures:outcome.failures.map(item=>item.id),answer:body?.answer});
    }
  }finally{
    globalThis.fetch=originalFetch;
    if(originalKey===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=originalKey;
  }
  assert.deepEqual(failures,[]);
});
