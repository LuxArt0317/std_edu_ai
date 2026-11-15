import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {readElearningCatalogPage,selectElearningCatalogPage} from '../../server/elearningCatalogPageEvidence.js';
import {catalogCases,catalogNegativeQuestions,forbiddenCatalogEvidence,pendingCatalogMetadataCases} from './elearning-catalog-native-cases.mjs';

const account={
  user:{id:'78000000-0000-4000-8000-000000000001'},
  url:'https://unit-test.invalid',
  token:'test-account-token',
  key:'test-publishable-key',
};
const catalogMigration=readFileSync(new URL('../../supabase/migrations/20261115020000_elearning_catalog.sql',import.meta.url),'utf8');
const baseMigration=readFileSync(new URL('../../supabase/migrations/20261115010000_remote_learning.sql',import.meta.url),'utf8');
const readSeed=(sql,hasFlag)=>[...sql.split('insert into public.elearning_courses',2)[1].split(';',1)[0]
  .matchAll(hasFlag?/\((\d+),(\d+),'((?:[^']|'')*)',(true|false),(\d+)\)/gu:
    /\((\d+),(\d+),'((?:[^']|'')*)',()(\d+)\)/gu)]
  .map(([,id,category,title,selfEnroll,position])=>({id:Number(id),category_id:Number(category),title:title.replace(/''/gu,"'"),
    self_enroll:selfEnroll==='true',position:Number(position)}));
const coursesById=new Map(readSeed(baseMigration,true).map(row=>[row.id,row]));
for(const row of readSeed(catalogMigration,false)){
  const prior=coursesById.get(row.id);
  coursesById.set(row.id,prior?{...prior,title:row.title}:row);
}
const courses=[...coursesById.values()].sort((left,right)=>left.category_id-right.category_id||left.position-right.position||left.id-right.id);
const fold=value=>value.normalize('NFKC').toLowerCase();
const courseIds=evidence=>evidence.courses.map(({url})=>Number(url.split('/').at(-1)));
function capturedCatalog([category,term,page]){
  const matches=courses.filter(item=>(category===null||item.category_id===category)&&fold(item.title).includes(fold(term)));
  return {userId:account.user.id,total:matches.length,courses:matches.slice((page-1)*20,page*20)};
}
function stubCatalog(context,result){
  return context.mock.method(globalThis,'fetch',async(url,init)=>{
    assert.equal(url,account.url+'/rest/v1/rpc/elearning_catalog');
    assert.equal(init.method,'POST');
    assert.equal(init.redirect,'error');
    assert.equal(init.headers.Authorization,'Bearer '+account.token);
    assert.equal(init.headers.apikey,account.key);
    const {p_category,p_term,p_page,p_course}=JSON.parse(init.body);
    assert.equal(p_course,null);
    return result([p_category,p_term,p_page]);
  });
}

test('gold suite binds each exact term and page to one catalog read and publishes only projected course titles and local links',async t=>{
  for(const scenario of catalogCases)await t.test(scenario.id,async context=>{
    const fetchStub=stubCatalog(context,rpc=>{
      assert.deepEqual(rpc,scenario.rpc);
      const response=capturedCatalog(rpc);
      return Response.json({
        ...response,enrollments:[{title:forbiddenCatalogEvidence[0]}],rawToken:forbiddenCatalogEvidence[1],
        courses:response.courses.map(row=>({...row,joinToken:forbiddenCatalogEvidence[2]})),
      });
    });
    const evidence=await readElearningCatalogPage(account,scenario);
    assert.equal(fetchStub.mock.callCount(),1);
    assert.ok(evidence);
    assert.equal(evidence.state,scenario.emptyReason?'empty_page':'ok');
    assert.equal(evidence.emptyReason,scenario.emptyReason??null);
    const [categoryId,query,page]=scenario.rpc;
    assert.deepEqual(evidence.selection,{
      path:scenario.route.replace(/^https:\/\/stu\.best/u,''),categoryId,query,page,mode:scenario.mode,
    });
    assert.equal(evidence.total,scenario.total);
    assert.equal(evidence.pageCount,scenario.pageCount);
    assert.equal(evidence.listedCount,scenario.listedCount??scenario.ids.length);
    assert.deepEqual(courseIds(evidence),scenario.ids);
    assert.deepEqual(evidence.courses,scenario.ids.map(id=>({title:coursesById.get(id).title,url:'/elearning/course/'+id})));
    for(const fragment of forbiddenCatalogEvidence)assert.equal(JSON.stringify(evidence).includes(fragment),false);
    assert.equal(Object.hasOwn(evidence,'categoryTitle'),false);
  });
});

test('malformed URLs, ambiguous selectors, other scopes, and unscoped questions never start the RPC',async context=>{
  const fetchStub=context.mock.method(globalThis,'fetch',()=>{throw new Error('Must not fetch');});
  const question='Which courses are shown on this page?';
  for(const route of [
    'https://elearning.stu.edu.tw/elearning/search','//stu.best/elearning/search','https://stu.best@other.invalid/elearning/search',
    '/elearning/search?q=one&q=two','/elearning/search?page=1&%70age=2','/elearning/search?page=0',
    '/elearning/search?page=1001','/elearning/search?page=01','/elearning/search?page=','/elearning/search?page=+2',
    '/elearning/search?q=%C0%AA','/elearning/search?q=%ZZ','/elearning/search?q=%0a',
    '/elearning/search?q=%E2%80%A8','/elearning/search?q='+'x'.repeat(101),'/elearning/search?q=x#hidden',
    '/elearning/search?q=two words','/elearning/search?course=18','/elearning/search?category=28',
    '/elearning/categories','/elearning/category/49?q=other','/elearning/category/2147483648',
    '/elearning/category/0','/elearning/./search','/elearning/course/28','/elearning/notice/325504',
    '/dtm/assignments','/school-affairs',
  ])assert.equal(await readElearningCatalogPage(account,{question,route}),null,route);
  for(const excluded of catalogNegativeQuestions){
    assert.equal(await readElearningCatalogPage(account,{question:excluded,route:'/elearning/search?page=2'}),null,excluded);
  }
  assert.equal(selectElearningCatalogPage('How many courses are in this category?','/elearning/search'),null);
  assert.equal(selectElearningCatalogPage('How many courses match this search?','/elearning/category/49'),null);
  assert.equal(fetchStub.mock.callCount(),0);
});

test('RPC errors and unsafe projections remain unavailable instead of appearing empty',async t=>{
  const scenario=catalogCases.find(item=>item.id==='category-second');
  for(const [name,modify] of [
    ['foreign echoed identity',data=>Response.json({...data,userId:'78000000-0000-4000-8000-000000000002'})],
    ['unknown course ID',data=>{data.courses[0].id=0;return Response.json(data);}],
    ['wrong category',data=>{data.courses[0].category_id=49;return Response.json(data);}],
    ['short page',data=>{data.courses.pop();return Response.json(data);}],
    ['duplicate ID',data=>{data.courses[1].id=data.courses[0].id;return Response.json(data);}],
    ['misordered rows',data=>{data.courses.reverse();return Response.json(data);}],
    ['unreadable title',data=>{data.courses[0].title='';return Response.json(data);}],
    ['server error',()=>new Response('{}',{status:503})],
    ['malformed response',()=>new Response('This is a login page',{status:200})],
    ['network failure',()=>{throw new Error('offline');}],
  ])await t.test(name,async context=>{
    const fetchStub=stubCatalog(context,rpc=>modify(capturedCatalog(rpc)));
    const evidence=await readElearningCatalogPage(account,scenario);
    assert.equal(fetchStub.mock.callCount(),1);
    assert.equal(evidence.state,'unavailable');
    assert.deepEqual(Object.keys(evidence),['state','selection']);
  });
  await t.test('row contradicts the selected search term',async context=>{
    stubCatalog(context,rpc=>{
      const data=capturedCatalog(rpc);
      data.courses[0].title='Unrelated entry';
      return Response.json(data);
    });
    assert.equal((await readElearningCatalogPage(account,catalogCases[0])).state,'unavailable');
  });
});

test('unsigned accounts, invalid owner data and expired deadlines return bounded states with zero reads',async context=>{
  const fetchStub=context.mock.method(globalThis,'fetch',()=>{throw new Error('Must not fetch');});
  const scenario=catalogCases[0];
  assert.equal((await readElearningCatalogPage(null,scenario)).state,'sign_in');
  assert.equal((await readElearningCatalogPage({...account,user:{id:'invalid'}},scenario)).state,'unavailable');
  assert.equal((await readElearningCatalogPage(account,{...scenario,deadline:0})).state,'unavailable');
  assert.equal(fetchStub.mock.callCount(),0);
});

test('metadata expectations stay separately tracked until a scoped category and notice authority exists',()=>{
  assert.equal(pendingCatalogMetadataCases.length,6);
  assert.match(baseMigration,/revoke all on public\.elearning_categories,public\.elearning_courses,public\.elearning_notices,public\.elearning_enrollments\s+from public,anon,authenticated/u);
  assert.match(baseMigration,/\(305241,'page','[^']+',null,5\)/u);
  assert.match(baseMigration,/\(325504,'page','[^']+','自112學年度第2學期起，遠距教學轉入 TronClass 創課平台。',4\)/u);
  assert.match(catalogMigration,/\(49,null,'109學年度第3學期',0,22\)/u);
  assert.match(catalogMigration,/\(43,19,'資訊安全',6,4\)/u);
});
