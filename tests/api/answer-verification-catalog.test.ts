import assert from 'node:assert/strict';
import {test} from 'node:test';
import {evidenceReferenceCatalog,reviewMatchesEvidence} from '../../server/answerVerificationModel.js';
import {accountEvidence} from '../../server/answerVerificationAccount.js';
import {buildAccountFixture} from '../evaluation/fixtures.mjs';

const source=(id:string,value:unknown)=>({id,content:JSON.stringify(value)});
const pathsFor=(catalog:ReturnType<typeof evidenceReferenceCatalog>,id:string)=>catalog.sources.find(row=>row.evidenceId===id)!.jsonPaths;
const supported=(id:string,jsonPaths:string[])=>({supported:true,answersQuestion:true,claims:[{claim:'A literal source field is present.',supported:true,evidenceId:id,jsonPaths,quotes:[]}]});
function assertIntegrity(sources:Array<{id:string;content:string}>){
  const catalog=evidenceReferenceCatalog(sources);
  assert.ok(Buffer.byteLength(JSON.stringify(catalog),'utf8')<=24000);
  assert.ok(catalog.sources.reduce((count,row)=>count+row.jsonPaths.length,0)<=512);
  for(const row of catalog.sources){
    assert.equal(new Set(row.jsonPaths).size,row.jsonPaths.length);
    for(const path of row.jsonPaths){
      assert.ok(path.startsWith('/')&&path.length<=512);
      assert.equal(reviewMatchesEvidence(supported(row.evidenceId,[path]),sources),true,path);
    }
  }
  return catalog;
}

test('the actual native graduation report shape retains requirement, matched and other course addresses',()=>{
  // Mirrors report() in graduation-review-live.mjs without importing its live
  // account/SQL/browser harness. These deliberately inconsistent credit values
  // are literal source facts, not an inferred eligibility calculation.
  const snapshot=buildAccountFixture() as Record<string,unknown>&{graduationReview:{reports:Array<Record<string,unknown>>}};let number=100;
  const id=()=>`30000000-0000-4000-8000-${String(number++).padStart(12,'0')}`;
  const course={id:id(),sequenceText:'1',title:'QA graduation course',credits:0,requiredElectiveText:'必',yearText:'一',transferText:null};
  const report={...snapshot.graduationReview.reports[0],reportedAt:'2026-11-12T10:00:00Z',
    identity:{studentNumber:'QA-GRAD',studentName:'Synthetic Graduation Student',departmentName:'QA Department',yearText:'四',enrollmentStatusText:'Synthetic active',curriculumCohortText:'QA cohort',doubleMajorText:null,minorText:null},
    educationProgram:{text:'N',indicator:null},foreignLanguageCompletion:{text:'N',indicator:'attention'},englishRequirement:{text:'QA pending',indicator:'attention'},graduationReview:{text:'QA review pending',indicator:'attention',note:'Synthetic report; no eligibility decision'},
    languageRequirements:[{id:id(),label:'QA language requirement',status:{text:'Explicit pending',indicator:'attention'},requiredCredits:8,matchedCredits:0,missingCredits:7.5}],
    categories:[{id:id(),label:'QA Required category',requiredElectiveText:'必',requiredCredits:12,completedCredits:9,matchedCredits:6,excludedCredits:2,status:{text:'Explicit pending',indicator:'attention'},detailSubtotalCredits:2.5,
      requirements:[{id:id(),sequenceText:'1',title:'QA Requirement',moduleText:'QA module',credits:3,requiredElectiveText:'必',yearText:'一',transferText:null,indicator:'attention',matchedCourses:[course]}]},
    {id:id(),label:'QA Empty category',requiredElectiveText:'選',requiredCredits:null,completedCredits:0,matchedCredits:null,excludedCredits:null,status:{text:null,indicator:null},requirements:[],detailSubtotalCredits:null}],
    otherCourses:[{...course,id:id(),sequenceText:'9'}]};
  snapshot.graduationReview.reports=[report];
  const sources=accountEvidence(snapshot,['graduationReview'],{question:'Show my graduation credit review and course details',route:'/school-affairs/services/13-1/graduation'});
  const catalog=assertIntegrity(sources),paths=pathsFor(catalog,'account:graduationReview');
  assert.equal(catalog.partial,false);
  assert.ok(paths.length>180,'The former per-source cutoff must not hide fully available facts.');
  for(const path of ['/records/requirements/0/title','/records/requirements/0/credits','/records/matchedCourses/0/title','/records/matchedCourses/0/credits','/records/otherCourses/0/title','/records/otherCourses/0/credits',
    '/records/categories/1/requiredCredits','/records/categories/1/completedCredits','/records/statuses/0/text','/rules','/checkedAt','/requestedReportKind'])assert.ok(paths.includes(path),path);
  const data=JSON.parse(sources.find(row=>row.id==='account:graduationReview')!.content);
  assert.equal(data.records.matchedCourses[0].credits,0);assert.equal(data.records.categories[1].requiredCredits,null);
  const required=accountEvidence(snapshot,['graduationReview'],{question:'Show my graduation credit review and required course details',route:'/school-affairs/services/13-1/graduation'});
  const requiredPaths=pathsFor(assertIntegrity(required),'account:graduationReview');
  assert.ok(requiredPaths.includes('/records/requirements/0/title'));assert.ok(requiredPaths.includes('/records/matchedCourses/0/credits'));
});

test('large count tables and earlier record collections cannot starve later meaningful collections',()=>{
  const records={counts:Array.from({length:2000},(_,i)=>({collection:'large-'+i,availableRows:900,includedRows:900,partial:false,loadedRows:900,matchingRows:900})),
    statuses:Array.from({length:2000},(_,i)=>({id:String(i),sourceMode:'sample',version:1,reportId:'report',statusKey:'status-'+i,text:'Recorded',indicator:null})),
    requirements:[{reportId:'report',id:'requirement',title:'Required title',credits:3}],matchedCourses:[{reportId:'report',requirementId:'requirement',title:'Matched title',credits:0}],otherCourses:[{reportId:'report',title:'Other title',credits:null}]};
  const catalog=assertIntegrity([source('native',{rules:'Local reference only.',records})]),paths=pathsFor(catalog,'native');
  assert.equal(catalog.partial,true);
  for(const path of ['/records/counts','/records/requirements/0/title','/records/matchedCourses/0/title','/records/otherCourses/0/title','/records/matchedCourses/0/credits','/records/otherCourses/0/credits'])assert.ok(paths.includes(path),path);
});

test('large first sources do not consume the guide before other independent sources',()=>{
  const sources=Array.from({length:4},(_,index)=>source('source-'+index,{records:{rows:Array.from({length:1000},(_,i)=>({id:i,title:'Stored title',value:i})),lastCollection:[{answer:index}]}}));
  const catalog=assertIntegrity(sources);
  assert.equal(catalog.sources.length,4);assert.equal(catalog.partial,true);
  for(const item of sources){const paths=pathsFor(catalog,item.id);assert.ok(paths.includes('/records/rows/0/title'));assert.ok(paths.includes('/records/lastCollection/0/answer'));}
  assert.equal(reviewMatchesEvidence(supported('unknown-source',['/records/rows/0/title']),sources),false);
});

test('nested material collections receive a lane alongside course facts',()=>{
  const catalog=assertIntegrity([source('nested',{records:[{id:'c1',title:'First course',materials:Array.from({length:2000},(_,i)=>({title:'Material '+i,summary:'Literal content'}))},
    {id:'c2',title:'Second course',grades:[{label:'Quiz',score:0}]}]})]);
  const paths=pathsFor(catalog,'nested');
  for(const path of ['/records/0/title','/records/0/materials/0/summary','/records/1/title','/records/1/grades/0/score'])assert.ok(paths.includes(path),path);
});

test('byte-heavy escaped Unicode pointers leave room for later short pointers without invalid paths',()=>{
  const largeKey='長'.repeat(150),catalog=assertIntegrity([source('large',{records:Array.from({length:1000},(_,i)=>({[largeKey]:i,short:i}))}),source('small',{records:[{answer:0}]})]);
  assert.equal(catalog.partial,true);assert.ok(pathsFor(catalog,'small').includes('/records/0/answer'));
  const paths=pathsFor(catalog,'large');assert.ok(paths.some(path=>path.endsWith('/short')));
  assert.equal(Buffer.from(JSON.stringify(catalog)).toString('utf8'),JSON.stringify(catalog));
});

test('primitive roots omit forbidden root pointers while literal child values remain addressable',()=>{
  const sources=[source('values',{zero:0,no:false,blank:'',nothing:null,array:[],object:{}}),source('array',[0,false,'',null,[],{}]),...['text',0,false,null].map((value,i)=>source('primitive-'+i,value))];
  const catalog=assertIntegrity(sources);
  assert.equal(catalog.partial,false);assert.equal(catalog.sources.length,2);
  assert.deepEqual(new Set(pathsFor(catalog,'values')),new Set(['/zero','/no','/blank','/nothing','/array','/object']));
  assert.deepEqual(new Set(pathsFor(catalog,'array')),new Set(['/0','/1','/2','/3','/4','/5']));
  assert.equal(reviewMatchesEvidence(supported('array',['/00']),sources),false);
  assert.equal(reviewMatchesEvidence(supported('array',['/length']),sources),false);
});

test('own prototype-looking and escaped keys are exact data, never aliases or inherited values',()=>{
  const sources=[{id:'keys',content:'{"__proto__":{"own":0},"constructor":{"owned":false},"with/slash":{"~credit":null},"0":{"01":"value"}}'}];
  const catalog=assertIntegrity(sources),paths=pathsFor(catalog,'keys');
  for(const path of ['/__proto__/own','/constructor/owned','/with~1slash/~0credit','/0/01'])assert.ok(paths.includes(path),path);
  for(const path of ['/toString','/__proto__/toString','/constructor/prototype','/with/slash/~credit','/with~2slash/~0credit'])assert.equal(reviewMatchesEvidence(supported('keys',[path]),sources),false,path);
  assert.equal(({} as Record<string,unknown>).own,undefined);
  assert.equal(reviewMatchesEvidence({...supported('keys',['/__proto__/own']),supported:false},sources),false);
});

test('depth and individual-path limits explicitly mark omitted guidance',()=>{
  let deep:unknown={literal:0};for(let i=0;i<26;i++)deep={nested:deep};
  const catalog=assertIntegrity([source('limits',{deep,['x'.repeat(513)]:0,short:1})]);
  assert.equal(catalog.partial,true);assert.equal(catalog.sources[0].partial,true);assert.ok(pathsFor(catalog,'limits').includes('/short'));
});
