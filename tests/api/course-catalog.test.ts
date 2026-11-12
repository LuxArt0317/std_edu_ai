import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFile} from 'node:fs/promises';
import {normalizeCatalogQuery,normalizeCourseOffering,loadCourseCatalog,manageCourseCatalog} from '../../server/courseCatalog.js';
import {newCourseOffering,catalogCell,courseCatalogColumns} from '../../src/features/public/affairs/courseCatalogModel.js';
import dataHandler from '../../api/affairs-data.ts';
import manageHandler from '../../api/affairs-manage.ts';
import {answerCampusNavigation} from '../../server/schoolAffairsDirectory.js';
import {answerPrivateAffairsQuestion} from '../../server/affairsAnswer.js';
import {newCourseSyllabus,normalizeCourseSyllabus} from '../../src/features/public/affairs/courseSyllabusModel.js';

const account={user:{id:'catalog-reader'},token:'caller-token',url:'https://xiftudmvxphxcjtmfmib.supabase.co',key:'public-test-key'};
const record={...newCourseOffering(),id:'cc120000-0000-4000-8000-000000000099',term_code:'1151',term_label:'115學年度上學期',department_code:'01',department_name:'資訊管理系',classification_code:'IMU',admission_code:'1',course_code:'QA01',course_name:'範例課程',instructor:'示範教師',capacity:50,credits:3,meetings:[{weekday:1,periods:['1','2']}],published:true};
const payload={id:record.id,request_id:'cc120000-0000-4000-8000-000000000098',expected_version:0,record};

test('catalog normalizes every visible filter and preserves literal keyword searches',()=>{
  const query=normalizeCatalogQuery({yr:'1151',dep:'01',ref1:'IMU',admissionType:'1',credit:'3',grd:'一',prog:'PU031',required:'true',e_course:'false',english_taught:'true',foreign_language:'false',immersion:'false',weekdays:'1,2,1',periods:'晨,1,A',keyword:'  SQL_%  ',instructor:'示範',sort:'credits',direction:'desc',page:'2',page_size:'25'});
  assert.deepEqual(query,{p_filters:{yr:'1151',dep:'01',ref1:'IMU',admissionType:'1',credit:'3',grd:'一',prog:'PU031',required:'true',e_course:'false',english_taught:'true',foreign_language:'false',immersion:'false',keyword:'SQL_%',instructor:'示範',id:'',weekdays:['1','2'],periods:['晨','1','A']},p_page:2,p_page_size:25,p_sort:'credits',p_direction:'desc'});
  for(const bad of [{weekdays:'8'},{periods:'9'},{required:'yes'},{credit:'NaN'},{page:'-1'},{page_size:'101'},{sort:'course_code;drop table x'},{direction:'sideways'},{id:'another-user'},{keyword:'x'.repeat(161)}]) assert.throws(()=>normalizeCatalogQuery(bad),/Invalid/);
});

test('catalog admin validation retains sample provenance and strips row metadata before receipts',()=>{
  const clean=normalizeCourseOffering({...record,created_at:'2026-11-12',updated_at:'2026-11-12'});
  assert.equal(clean.course_name,record.course_name);
  for(const key of ['id','version','source_mode','created_at','updated_at']) assert.equal(key in clean,false);
  for(const bad of [{secret:'must not persist'},{source_mode:'verified'},{credits:NaN},{capacity:-1},{enrolled_count:51},{program_codes:['invalid,code']},{meetings:[{weekday:1,periods:['9']}]},{meetings:[{weekday:1,periods:['1'],private_note:'must not persist'}]}]) assert.throws(()=>normalizeCourseOffering({...record,...bad}),/Invalid|Unknown|sample|exceed/);
});

test('catalog RPC reads and writes use caller authorization and propagate optimistic conflicts',async()=>{
  const original=globalThis.fetch;const calls:Array<{url:string;body:Record<string,unknown>}>=[];
  globalThis.fetch=async(input,init)=>{
    assert.equal(new Headers(init?.headers).get('Authorization'),'Bearer caller-token');
    calls.push({url:String(input),body:JSON.parse(String(init?.body))});
    return new Response(JSON.stringify(String(input).endsWith('affairs_catalog_search')?{rows:[record],total:1,can_manage:false,terms:[]}:{id:record.id,version:1}),{status:200});
  };
  try {
    const result=await loadCourseCatalog(account,{dep:'01'});assert.equal(result.total,1);assert.equal(result.page_size,100);
    await manageCourseCatalog(account,'save_course_offering',payload);
    assert.equal(calls[0].url.endsWith('/rpc/affairs_catalog_search'),true);assert.equal(calls[1].url.endsWith('/rpc/affairs_catalog_manage'),true);
    assert.equal('source_mode' in ((calls[1].body.p_payload as {record:Record<string,unknown>}).record),false);
    globalThis.fetch=async()=>new Response(JSON.stringify({message:'conflict'}),{status:409});
    await assert.rejects(manageCourseCatalog(account,'delete_course_offering',payload),{status:409});
    globalThis.fetch=async()=>new Response('{}',{status:403});
    await assert.rejects(manageCourseCatalog(account,'save_course_offering',payload),{status:403});
  } finally {globalThis.fetch=original;}
});

test('existing API endpoints reject anonymous catalog reads and mutations before database access',async()=>{
  const original=globalThis.fetch;globalThis.fetch=async()=>{throw new Error('Anonymous catalog request must never query the database');};
  try {
    for(const action of ['read','write']) {
      let status=0,body:unknown;const headers:Record<string,string>={};
      const response={status(code:number){status=code;return this;},json(value:unknown){body=value;},setHeader(name:string,value:string){headers[name]=value;}};
      if(action==='read') await dataHandler({method:'GET',headers:{},query:{scope:'catalog'}},response);
      else await manageHandler({method:'POST',headers:{},body:{kind:'save_course_offering',payload}},response);
      assert.equal(status,401);assert.ok(body);assert.match(headers['Cache-Control'],/no-store/);
    }
  } finally {globalThis.fetch=original;}
});

test('catalog keeps all 21 source columns and schedule cells independent of enrollment records',async()=>{
  assert.equal(courseCatalogColumns.length,21);assert.equal(catalogCell(record,'schedule1'),'一-1,2');assert.equal(catalogCell(record,'required'),'選');
  const migration=await readFile(new URL('../../supabase/migrations/20261112050000_course_catalog.sql',import.meta.url),'utf8');
  assert.match(migration,/create table public\.affairs_course_offerings/);assert.match(migration,/enable row level security/);assert.match(migration,/source_mode='sample'/);
  assert.doesNotMatch(migration,/alter table public\.affairs_(enrollments|students)|insert into public\.affairs_enrollments/i);
});

test('catalog requests reach the offering directory without substituting personal enrolled courses',async()=>{
  const original=globalThis.fetch;
  globalThis.fetch=async()=>{throw new Error('Catalog navigation and enrolled-course answers must not call an external model');};
  const snapshot={checkedAt:'2026-11-12T00:00:00Z',profile:{userId:'synthetic',displayName:'Synthetic',email:'synthetic@example.invalid',role:'student'},student:null,
    courses:[{enrollmentId:'own-enrollment',status:'enrolled',sourceMode:'sample',code:'OWN101',title:'Enrolled subject only',term:'115-1',termStartsOn:'2026-09-01',termEndsOn:'2027-01-31',weekday:1,startsAt:'09:00',endsAt:'10:00',room:'DEMO',grades:[],attendance:[]}],
    dtm:{courses:[],notices:[]},assignments:[],charges:[],tasks:[],requests:[],announcements:[]};
  try {
    for(const question of ['Show me all course offerings','Show me the course catalog','What courses are offered this semester?','List available courses','請顯示當期課程查詢','本學期有哪些課程？']) {
      const navigation=answerCampusNavigation(question);assert.ok(navigation,question);
      assert.equal((navigation.citations[0] as {locator:string}).locator,'/school-affairs/services/12-4',question);
      const answer=await answerPrivateAffairsQuestion(question,snapshot,[],'/school-affairs/services/12-4');
      assert.equal(answer.grounding.source,'directory',question);assert.doesNotMatch(answer.answer,/OWN101|Enrolled subject only/);
      assert.match(answer.answer,/\/school-affairs\/services\/12-4/);
    }
    for(const question of ['Show my current courses','Show my enrolled courses','What courses am I taking?','Which offered courses am I enrolled in?','Where are my enrolled course offerings?','我已選的課程有哪些？']) {
      assert.equal(answerCampusNavigation(question),null,question);
      const answer=await answerPrivateAffairsQuestion(question,snapshot,[],'/school-affairs/services/12-4');
      assert.equal(answer.grounding.source,'account',question);assert.match(answer.answer,/OWN101/,question);
      assert.equal((answer.citations[0] as {url:string}).url,'/school-affairs/services/11-1');
    }
  } finally {globalThis.fetch=original;}
});

test('syllabus validation rejects impossible dates, unsupported fields and invalid percentage totals',()=>{
  const syllabus=newCourseSyllabus();syllabus.grading=syllabus.grading.map(()=>({weight:25,methods:['1']}));
  syllabus.weeks[0]={date:'2028-02-29',content:'Local sample lesson',notes:''};
  assert.equal(normalizeCourseSyllabus(syllabus).weeks[0].date,'2028-02-29');
  const invalid:unknown[]=[{...syllabus,private_note:'reject unknown data'},
    {...syllabus,weeks:syllabus.weeks.map((week,i)=>i===0?{...week,date:'2026-02-29'}:week)},
    {...syllabus,weeks:syllabus.weeks.map((week,i)=>i===0?{...week,date:'0000-01-01'}:week)},
    {...syllabus,weeks:syllabus.weeks.slice(0,17)},
    {...syllabus,grading:syllabus.grading.map(()=>({weight:30,methods:['1']}))},
    {...syllabus,grading:syllabus.grading.map(()=>({weight:25,methods:['unknown']}))},
    {...syllabus,capabilities:Array(12).fill(1)},
    {...syllabus,meanings:[27]}, {...syllabus,sdgs:[18]},
    {...syllabus,weeks:syllabus.weeks.map((week,i)=>i===0?{...week,secret:'reject unknown nested data'}:week)}];
  for(const value of invalid) assert.throws(()=>normalizeCourseSyllabus(value),/syllabus/i);
  assert.equal('syllabus' in normalizeCourseOffering(record),false,'Old clients omit syllabus instead of clearing existing content.');
  const saved=normalizeCourseOffering({...record,syllabus});assert.deepEqual(saved.syllabus,syllabus);
  assert.throws(()=>normalizeCourseOffering({...record,syllabus:{...syllabus,private_note:'secret'}}),{status:400});
});
