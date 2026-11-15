import {isDeepStrictEqual} from 'node:util';
import {hasBoundMetadataObservation,metadataCasePrefix,metadataEndpoint,metadataFixtureRequirement} from './elearning-metadata-live.mjs';
import {catalogCases,catalogMetadataCases,forbiddenCatalogEvidence} from './elearning-catalog-native-cases.mjs';
import {gradeCase,extractAnswerLinks} from './grading.mjs';

const tool='elearningCatalog';
const prefix='account:elearning-catalog-';
const offline='offline_elearning_catalog_page';
const metadataTool='elearningMetadata';
const metadataScenarios=structuredClone(catalogMetadataCases);

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
  const metadataCases=metadataScenarios.map(row=>{
    return structuredClone({id:metadataCasePrefix+row.id,domain:metadataTool,route:row.route,question:row.question,
      executionContract:'live-native',endpoint:metadataEndpoint,
      mode:row.limited?'empty':'record',language:row.language??(/\p{Script=Han}/u.test(row.question)?'zh-Hant':'en'),fixtureKey:'elearning-metadata:'+row.id,
      fixtureRequirement:metadataFixtureRequirement,
      coveredTools:[metadataTool],metadataOracle:{links:row.links,rpc:row.rpc,displayedCount:row.displayedCount},
      expected:{behavior:row.limited?'unavailable':'answer',...(row.limited?{limitation:true}:{}),
        requiredText:row.required,facts:row.facts,verification:'verified',requireToolExecution:true,
        requiredTools:[metadataTool],requiredAttemptedTools:[metadataTool],allowedTools:[metadataTool],
        requiredLinks:[row.route],requiredSourceBindings:[{sourceId:'account:'+metadataTool,url:row.route}],
        forbiddenText:[...forbiddenCatalogEvidence,'you enrolled','you are enrolled'],
        noAction:true,forbidPublicResearch:true,localLinksOnly:true}});
  });
  return [...positive,retried,failed,guest,...metadataCases];
}

export const isElearningMetadataCase=row=>row?.fixtureRequirement===metadataFixtureRequirement
  ||typeof row?.id==='string'&&row.id.startsWith(metadataCasePrefix);

export function assertElearningMetadataCase(row){
  const expected=elearningCatalogRunnerCases().find(candidate=>candidate.id===row?.id&&isElearningMetadataCase(candidate));
  if(!expected||!isDeepStrictEqual(row,expected))throw new Error('Digital Academy metadata case is outside its frozen request definition.');
}

export const elearningCatalogSetupRequired=row=>!isElearningMetadataCase(row)&&(row?.fixtureRequirement===offline
  ||typeof row?.id==='string'&&row.id.startsWith(prefix)
  ||typeof row?.fixtureKey==='string'&&row.fixtureKey.startsWith('offline:elearning-catalog:'));
export function assertElearningCatalogCaseReady(row){
  if(isElearningMetadataCase(row))assertElearningMetadataCase(row);
  else if(elearningCatalogSetupRequired(row))throw new Error('Digital Academy course catalog fixtures and independent observations are unmounted.');
}

export function elearningCatalogSetupSummary(cases){
  const metadataCases=cases.filter(isElearningMetadataCase);
  const unbound=cases.filter(elearningCatalogSetupRequired);
  const caseIds=cases.filter(row=>isElearningMetadataCase(row)||elearningCatalogSetupRequired(row)).map(row=>row.id);
  return {registered:caseIds.length,liveEligible:metadataCases.length,caseIds,
    metadataCaseIds:metadataCases.map(row=>row.id),unboundCaseIds:unbound.map(row=>row.id)};
}

export function gradeElearningCatalogCase(testCase,envelope,options){
  const result=gradeCase(testCase,envelope,options);
  const body=envelope.body??{};
  const answer=String(body.answer??'');
  const authority=testCase.metadataOracle;
  if(authority){
    const ids=[...answer.matchAll(/\]\(\/elearning\/category\/(\d+)\)/gu)].map(match=>Number(match[1]));
    const [literalId,literalCount]=authority.displayedCount??[];
    const checks=[
      {id:'metadata.ordered-hierarchy',passed:JSON.stringify(ids)===JSON.stringify(authority.links),
        detail:'The answer names and links the exact requested directory hierarchy.'},
      {id:'metadata.literal-count',passed:literalId===undefined||answer.includes(`/elearning/category/${literalId}) (${literalCount})`),
        detail:'The displayed count remains the literal saved count for that category.'},
    ];
    if(testCase.id===metadataCasePrefix+'notice-title-only'){
      const withoutLinks=answer.replace(/\[[^\]]*\]\([^)]*\)/gu,'');
      checks.push({id:'metadata.deadline-absent',passed:!/[0-9０-９]/u.test(withoutLinks),
        detail:'The title-only notice has no numeric deadline in the saved source.'});
    }
    if(['live-native','live-model'].includes(envelope.execution)){
      checks.push({id:'metadata.request-bound-observation',passed:hasBoundMetadataObservation(testCase,envelope),
        detail:'Paired caller metadata projections and endpoint progress match the exact pinned assistant request.'});
    }
    result.checks.push(...checks);
    result.failures.push(...checks.filter(check=>!check.passed));
    result.passed=result.failures.length===0;
    return result;
  }
  const oracle=testCase.catalogOracle;
  if(!oracle)return result;
  const ids=[...answer.matchAll(/\]\(\/elearning\/course\/(\d+)\)/gu)].map(match=>Number(match[1]));
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
