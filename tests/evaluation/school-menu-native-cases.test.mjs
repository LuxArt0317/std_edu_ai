import assert from 'node:assert/strict';
import {test} from 'node:test';
import catalog from '../../src/features/public/affairs/catalog.json' with {type:'json'};
import {createAffairsAssistantHandler} from '../../api/affairs-assistant.ts';
import {createResearchAssistantHandler} from '../../server/researchAssistantHandler.js';
import {answerDirectoryQuestion} from '../../server/schoolAffairsDirectory.js';
import {buildSchoolMenuNativeCases} from './school-menu-native-cases.mjs';
import {gradeCase} from './grading.mjs';

const cases=buildSchoolMenuNativeCases();
const localAliases={
  '請假填單':'/school-affairs/services/leave',
  '學生請假紀錄查詢':'/school-affairs/services/leave/history',
  '實習紀錄輸入':'/school-affairs/services/internship',
  '通知訊息查詢':'/school-affairs/notifications',
  '已收藏消息查詢':'/school-affairs/bookmarks',
  'mySTU':'/student-sso',
  'Moodle數位學園':'/elearning',
  '行事曆':'/school-sites/www.aca.stu.edu.tw/%E8%A1%8C%E4%BA%8B%E6%9B%86%EF%BD%9Ccalendar/',
  '學校首頁':'/',
};
const staticOrder={
  common:[
    '請假填單','就學貸款申請',['Leave application form','請假填單'],
    ['Inquiry of Absenteeism Records','缺曠課紀錄查詢'],
    ['Checking the status of your application to leave school','離校申請狀態查詢'],
    '行事曆','CU數位平台','學校首頁',['Calendar','行事曆'],['Moodle Digital Academy','Moodle數位學園'],
    'mySTU',['My course schedule;','我的功課表'],['Course selection record query;','選課紀錄查詢'],
    ['Club activities','社團活動'],['Proof of enrollment','在學證明'],
  ],
  course:['初選','加退選','我的功課表','暑期選課','棄選','歷年超減修申請紀錄查詢','永久課程簡介查詢','補加選','選課確認','選課紀錄查詢'],
  graduation:['離校申請狀態查詢'],
};
const catalogRows=catalog.flatMap(([group,kind,,links],row)=>links.map(([title,path],index)=>({
  group,kind,title,url:/^https?:\/\//iu.test(path)?path:'https://'+path,
  locator:localAliases[title]??'/school-affairs/services/'+(row+1)+'-'+(index+1),
})));
let address=0;

function rowsFor(item){
  const {group,view}=item.catalogExpectation;
  if(group==='menu'){
    if(view==='external')return catalogRows.filter(row=>row.group==='sysmenu');
    if(view==='help')return catalogRows.filter(row=>row.group==='sysDoc');
    return staticOrder[view].map(entry=>{
      const [title,sourceTitle]=Array.isArray(entry)?entry:[entry,entry];
      return {...catalogRows.find(row=>row.title===sourceTitle),title};
    });
  }
  return catalogRows.filter(row=>row.group===group&&(['all','library'].includes(view)||row.kind===view));
}

async function invoke(handler,item,authorized){
  const result={statusCode:0,body:null};
  const response={
    setHeader(){},
    status(statusCode){result.statusCode=statusCode;return response;},
    json(body){result.body=body;},
  };
  await handler({
    method:'POST',
    headers:{'x-forwarded-for':'203.0.113.'+(++address),...(authorized?{authorization:'Bearer qa-menu-test-bearer'}:{})},
    body:{question:item.question,route:item.route,history:[],consentedResearchUse:true,...item.body},
  },response);
  return result;
}

function assertResponse(item,result){
  const {body,statusCode}=result;
  const report=gradeCase(item,{statusCode,body,events:[],fixtureKey:item.fixtureKey,execution:'deterministic'});
  assert.equal(report.passed,true,JSON.stringify(report.failures));
  assert.equal(body.grounding.source,'directory');
  assert.equal(body.grounding.webSearched,false);
  assert.ok(body.activity.some(step=>step.kind==='directory'&&step.status==='complete'));
  assert.deepEqual(body.citations.map(({title,url,locator})=>({title,url,locator})),
    rowsFor(item).slice(0,12).map(({title,url,locator})=>({title,url:locator||url,locator})));
  for(const citation of body.citations){
    assert.ok(body.answer.includes('['+citation.title+']('+citation.locator+')'),citation.title);
    assert.ok(body.answer.includes(']('+citation.url+')'),citation.url);
  }
  const omitted=item.catalogExpectation.total-body.citations.length;
  if(omitted){
    const caption=item.language==='zh-TW'?'另有 '+omitted+' 個項目':omitted+' more entries';
    assert.ok(body.answer.includes(caption),caption);
    assert.ok(body.answer.includes(']('+item.route+')'),item.route);
  }
  assert.doesNotMatch(body.answer,/qa-menu-test-bearer|qa-menu-private-email|qa-menu-private-note/u);
}

test('the bilingual cases pin independent catalog anchors and omit sibling views',()=>{
  assert.equal(cases.length,22);
  assert.equal(new Set(cases.map(row=>row.id)).size,22);
  assert.equal(new Set(cases.map(row=>row.route)).size,22);
  assert.deepEqual(cases.reduce((counts,row)=>({...counts,[row.language]:(counts[row.language]??0)+1}),{}),{en:11,'zh-TW':11});
  for(const item of cases){
    const rows=rowsFor(item);
    assert.equal(rows.length,item.catalogExpectation.total,item.route);
    for(const listing of item.catalogExpectation.listings){
      assert.ok(rows.some(({title,locator})=>title===listing.title&&locator===listing.url),item.route);
    }
    for(const excluded of item.expected.forbiddenText){
      assert.ok(catalogRows.some(row=>row.title===excluded));
      assert.ok(!rows.some(row=>row.title===excluded),item.route);
    }
  }
});

test('public and authenticated menu answers use the same directory without an external fetch or an account record read',async(t)=>{
  const forbiddenCalls=[];
  const deny=(surface)=>(...args)=>{
    forbiddenCalls.push({surface,count:args.length});
    throw new Error('Unrelated lookup attempted.');
  };
  t.mock.method(globalThis,'fetch',deny('network'));
  const guest=createResearchAssistantHandler({readSources:deny('research'),loadPublicPage:deny('public page')});
  let verifiedCount=0;
  let dispatchedCount=0;
  const mismatchedDispatches=[];
  const signedIn=createAffairsAssistantHandler({
    verifyToken:async(token)=>{
      assert.equal(token,'qa-menu-test-bearer');
      verifiedCount++;
      return {url:'https://fixture.invalid',key:'fixture-key',token,user:{
        id:'53010000-0000-4000-8000-000000000018',email:'qa-menu-private-email@example.invalid',
      }};
    },
    loadSnapshot:deny('account snapshot'),
    answerAccount:deny('account model'),
    publicResearch:async(request,response)=>{
      dispatchedCount++;
      if(request.headers.authorization||request.body.account||request.body.consentedResearchUse!==false){
        mismatchedDispatches.push(dispatchedCount);
      }
      return guest(request,response);
    },
  });
  for(const item of cases){
    const anon=await invoke(guest,item,false);
    const account=await invoke(signedIn,item,true);
    assertResponse(item,anon);
    assertResponse(item,account);
    assert.equal(account.body.answer,anon.body.answer,item.route);
    assert.deepEqual(account.body.citations,anon.body.citations,item.route);
  }
  assert.equal(verifiedCount,22);
  assert.equal(dispatchedCount,22);
  assert.deepEqual(mismatchedDispatches,[]);
  assert.deepEqual(forbiddenCalls,[]);
});

test('campus questions and personal-record routing keep priority on the static menu routes',async(t)=>{
  t.mock.method(globalThis,'fetch',()=>assert.fail('Provider transport is outside this test.'));
  const guest=createResearchAssistantHandler({
    readSources:()=>assert.fail('External research is outside this test.'),
    loadPublicPage:()=>assert.fail('The service directory does not load a captured page.'),
  });
  const campus=await invoke(guest,{route:'/school-affairs/menu/menu/course',question:'Where can I find the campus Wi-Fi setup guide?'},false);
  assert.equal(campus.statusCode,200);
  assert.ok(campus.body.citations.some(row=>row.locator==='/school-sites/help.ecc.stu.edu.tw/wireless-setting/'));
  assert.ok(campus.body.citations.every(row=>!row.chunkId.startsWith('directory:aca:')));
  let dispatched=0;
  const signedIn=createAffairsAssistantHandler({
    verifyToken:async()=>({url:'https://fixture.invalid',key:'fixture-key',token:'fixture-token',user:{
      id:'53010000-0000-4000-8000-000000000019',
    }}),
    loadSnapshot:()=>assert.fail('Private image requests must be rejected before record access.'),
    publicResearch:()=>{dispatched++;assert.fail('Personal grades must not be sent to the public directory.');},
  });
  const grades=await invoke(signedIn,{
    route:'/school-affairs/menu/menu/course',question:'What are my grades?',
    body:{images:[{name:'notes.png',dataUrl:'synthetic'}]},
  },true);
  assert.equal(grades.statusCode,400);
  assert.match(grades.body.error,/private account questions/i);
  assert.equal(dispatched,0);
  const custom=await invoke(guest,{
    route:'/school-affairs/menu/menu/custom',question:'Which service links are listed on this page?',
  },false);
  assert.equal(custom.statusCode,200);
  assert.equal(custom.body.status,'handoff');
  assert.match(custom.body.answer,/links saved in your browser/);
  assert.deepEqual(custom.body.citations.map(row=>row.url),['/school-affairs/menu/menu/custom']);
  assert.equal(custom.body.proposedAction,undefined);
  assert.equal(answerDirectoryQuestion('Which service links are listed on this page?','/school-affairs/menu/aca/library'),null);
});
