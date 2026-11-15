import {catalogCases,pendingCatalogMetadataCases,forbiddenCatalogEvidence} from './elearning-catalog-native-cases.mjs';
import {gradeCase,extractAnswerLinks} from './grading.mjs';

const tool='elearningCatalog';
const prefix='account:elearning-catalog-';
const offline='offline_elearning_catalog_page';
const metadata='elearning_catalog_metadata_authority_pending';

export function elearningCatalogRunnerCases(){
  const positive=catalogCases.map(row=>{
    const isList=row.mode==='list'||row.mode==='both';
    const route=row.route.replace(/^https:\/\/stu\.best/u,'');
    const zh=/\p{Script=Han}/u.test(row.question);
    const facts=[];
    if(!row.emptyReason&&isList)facts.push({kind:'number',label:zh?'頁課程':'Courses on page',values:[row.rpc[2],row.pageCount]});
    if(row.mode==='total-count'||row.mode==='both')facts.push({kind:'number',label:zh?'課程總數':'matching courses',values:[row.total],exclusive:true});
    if(row.mode==='page-count'||row.mode==='both')facts.push({kind:'number',label:zh?'本頁有':'Courses on this page',values:[row.listedCount??row.ids.length],exclusive:true});
    const requiredText=row.emptyReason==='past_last_page'
      ?[zh?'最後一頁是第 '+row.pageCount+' 頁':'The last page is '+row.pageCount]
      :row.emptyReason==='no_matching_courses'?[row.rpc[0]===null
        ?(zh?'找不到符合的已儲存課程':'No saved courses match this search')
        :(zh?'查無已儲存課程':'no saved courses for this category filter')]:[];
    return {id:prefix+row.id,domain:tool,route,question:row.question,mode:row.emptyReason?'empty':'record',language:zh?'zh-Hant':'en',
      fixtureKey:'offline:elearning-catalog:'+row.id,fixtureRequirement:offline,coveredTools:[tool],
      catalogOracle:{ids:row.ids,attempts:1,rpc:row.rpc},expected:{behavior:'answer',requiredText,facts,
        verification:'verified',requireToolExecution:true,requiredTools:[tool],requiredAttemptedTools:[tool],allowedTools:[tool],
        requiredLinks:[route,...row.ids.map(id=>'/elearning/course/'+id)],requiredSourceBindings:[{sourceId:'account:'+tool,url:route}],
        forbiddenText:[...forbiddenCatalogEvidence,'you enrolled','you are enrolled','official enrollment confirmed'],
        forbidPublicResearch:true,localLinksOnly:true,noAction:true}};
  });
  const original=positive[0];
  const failed={...original,id:prefix+'failed-or-mismatched',fixtureKey:'offline:elearning-catalog:failed',catalogOracle:{ids:[],attempts:2,rpc:original.catalogOracle.rpc},
    expected:{behavior:'unavailable',limitation:true,verification:'unverified',requiredAttemptedTools:[tool],allowedTools:[tool],
      toolTerminalStates:{[tool]:['unavailable']},noAction:true,forbidPublicResearch:true,localLinksOnly:true}};
  const retried={...original,id:prefix+'retried',fixtureKey:'offline:elearning-catalog:retry',catalogOracle:{...original.catalogOracle,attempts:2}};
  const guest={...original,id:prefix+'guest-return',mode:'boundary',endpoint:'/api/research-assistant',auth:'anonymous',fixtureKey:'anonymous',
    coveredTools:[],catalogOracle:{ids:[],attempts:0},expected:{behavior:'denial',requiredText:['Sign in'],
      requiredLinks:['/elearning/login?next='+encodeURIComponent(original.route)],allowedTools:[],requiredAttemptedTools:[],
      localLinksOnly:true,forbidPublicResearch:true,noAction:true}};
  const gaps=pendingCatalogMetadataCases.map(row=>{
    const unavailable=['notice-title-only','notice-unknown'].includes(row.id);
    return {id:prefix+'pending-'+row.id,domain:'elearningCatalogMetadata',route:row.route,question:row.question,
      mode:'pending-authority',language:/\p{Script=Han}/u.test(row.question)?'zh-Hant':'en',fixtureKey:'offline:elearning-catalog:pending-'+row.id,
      fixtureRequirement:metadata,fixtureSetupDetail:row.reason,coveredTools:[],
      expected:{behavior:unavailable?'unavailable':'answer',...(unavailable?{limitation:true}:{}),
        requiredText:row.required,noAction:true,forbidPublicResearch:true,localLinksOnly:true}};
  });
  return [...positive,retried,failed,guest,...gaps];
}

export const elearningCatalogSetupRequired=row=>[offline,metadata].includes(row?.fixtureRequirement)
  ||typeof row?.id==='string'&&row.id.startsWith(prefix)
  ||typeof row?.fixtureKey==='string'&&row.fixtureKey.startsWith('offline:elearning-catalog:');
export function assertElearningCatalogCaseReady(row){
  if(elearningCatalogSetupRequired(row))throw new Error(row.fixtureSetupDetail??'Digital Academy catalog fixtures and independent observations are unmounted.');
}

export function elearningCatalogSetupSummary(cases){
  const selected=cases.filter(elearningCatalogSetupRequired);
  return {registered:selected.length,liveEligible:0,caseIds:selected.map(row=>row.id),
    metadataCaseIds:selected.filter(row=>row.fixtureRequirement===metadata).map(row=>row.id)};
}

export function gradeElearningCatalogCase(testCase,envelope,options){
  const result=gradeCase(testCase,envelope,options);
  const oracle=testCase.catalogOracle;
  if(!oracle)return result;
  const body=envelope.body??{};
  const ids=[...String(body.answer??'').matchAll(/\]\(\/elearning\/course\/(\d+)\)/gu)].map(match=>Number(match[1]));
  const actualCourseLinks=extractAnswerLinks(body).filter(url=>/\/elearning\/course\//u.test(url));
  const checks=[
    {id:'catalog.ids',passed:JSON.stringify(ids)===JSON.stringify(oracle.ids)&&actualCourseLinks.length===ids.length,
      detail:'All and only the visible ordered course IDs appear in visible local links.'},
    {id:'catalog.attempts',passed:(body.verification?.attempts??0)===oracle.attempts,
      detail:'The shared verification loop made the expected number of bounded attempts.'},
  ];
  result.checks.push(...checks);
  result.failures.push(...checks.filter(check=>!check.passed));
  result.passed=result.failures.length===0;
  return result;
}
