import assert from 'node:assert/strict';
import test from 'node:test';
import affairsData from '../../api/affairs-data.ts';
import {serveCurriculumPlan} from '../../server/curriculumPlanDocument.js';
import {answerCampusNavigation} from '../../server/schoolAffairsDirectory.js';
import {curriculumDocumentSource,curriculumPrograms,curriculumTable} from '../../src/features/public/affairs/curriculumPlans.js';

const scope='curriculum-plan';
const code='115101';
const bytes=Buffer.from('%PDF-1.4\n% Fixture\n%%EOF');
function capture() {
  const headers:Record<string,string>={};
  const result={status:0,body:undefined as unknown,headers};
  const response={
    status(status:number){result.status=status;return response;},
    json(body:unknown){result.body=body;},
    end(body:Buffer){result.body=body;},
    setHeader(key:string,value:string){headers[key]=value;},
  };
  return {result,response};
}

test('all captured curriculum tabs and archive tables resolve to allowlisted documents',()=>{
  assert.equal(curriculumPrograms.length,12);
  const codes=new Set<string>();
  for (const {code:program} of curriculumPrograms) {
    for(const archive of [false,true]) {
      const table=curriculumTable(program,archive);
      assert.ok(table);
      assert.equal(table.rows[0][1],archive?'105':'115');
      assert.match(table.hash,/^[a-f0-9]{64}$/);
      for (const row of table.rows) {
        assert.equal(row.length,12);
        for(const cell of row) {
          if(typeof cell==='string')continue;
          codes.add(cell.code);
          assert.equal(curriculumDocumentSource(cell.code),'https://info.stu.edu.tw/ACA/teacher/QryCoursedept/DownLoadFileori.asp?Sec='+cell.code);
        }
      }
    }
  }
  assert.equal(codes.size,1441);
});

test('public curriculum navigation links to the local lookup',()=>{
  for(const question of ['Where can I find historical curriculum plans?','歷年課程規劃表在哪裡？']) {
    const answer=answerCampusNavigation(question);
    assert.equal(answer?.citations[0].url,'/school-affairs/services/12-5');
    assert.equal(answer?.grounding.webSearched,false);
  }
});

test('the existing data endpoint denies malformed and unknown plan requests before auth',async()=>{
  for (const [method,query,status] of [
    ['POST',{scope,code},405],
    ['GET',{scope,code:['115101','115102']},400],
    ['GET',{scope:[scope,'unknown'],code},400],
    ['GET',{scope,code,resource:'conversations'},400],
    ['GET',{scope,code:'https://example.invalid'},404],
    ['GET',{scope,code:'999999'},404],
  ] as const) {
    const {response,result}=capture();
    await affairsData({method,query:{...query} as Record<string,string|string[]>,headers:{}},response);
    assert.equal(result.status,status);
    assert.equal(result.headers['Cache-Control'],'no-store');
  }
});

test('the viewer uses a fixed university path and returns only validated PDF bytes',async()=>{
  const {response,result}=capture();
  await serveCurriculumPlan({method:'GET',query:{scope,code}},response,async (input,init)=>{
    assert.equal(input,curriculumDocumentSource(code));
    assert.equal(init?.redirect,'error');
    assert.ok(init?.signal);
    assert.equal(init?.headers,undefined);
    return new Response(bytes,{headers:{'content-type':'application/octet-stream'}});
  });
  assert.equal(result.status,200);
  assert.deepEqual(result.body,bytes);
  assert.equal(result.headers['Content-Type'],'application/pdf');
  assert.equal(result.headers['Content-Disposition'],'inline; filename="curriculum-115101.pdf"');
  assert.equal(result.headers['X-Content-Type-Options'],'nosniff');
});

test('unavailable, forged and oversized downloads do not enter the PDF viewer',async()=>{
  const cases=[
    new Response(null,{status:404}),
    new Response('html',{headers:{'content-type':'application/pdf'}}),
    new Response(bytes,{headers:{'content-type':'text/html'}}),
    new Response(bytes,{headers:{'content-type':'application/pdf','content-length':'4500000'}}),
    new Response(new Uint8Array(4_400_001),{headers:{'content-type':'application/pdf'}}),
  ];
  for(const upstream of cases) {
    const {response,result}=capture();
    await serveCurriculumPlan({method:'GET',query:{scope,code}},response,async()=>upstream);
    assert.equal(result.status,502);
    assert.equal(result.headers['Cache-Control'],'no-store');
    assert.equal(result.headers['Content-Type'],undefined);
  }
});
