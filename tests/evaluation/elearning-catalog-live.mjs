import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {metadataDispatchObservation as assistantDispatchObservation,metadataEndpoint,metadataProject} from './elearning-metadata-live.mjs';

export const catalogFixtureRequirement='elearning_catalog_disposable';
export const catalogEndpoint=metadataEndpoint;
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/iu;
const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const emptyLinks='4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945';
const searchSecondPage=[27,7,'bcd03eb79ecc94eafacb31981154b073400f580f0f74ab81e34aba302b0e7b0e'];
const searchSecondLinks='439d3d4f7f907ee4010327f64fbd82c6bc943695f8bb16faed283fc40a9dd2dc';

// Frozen projections of the course migrations. The page digest covers the
// exact RPC selector, count, ordered rows and all fields of the shared catalog.
// The link digest covers only the ordered course IDs and visible titles.
const projections={
  'search-literal-first':[3,3,'25eb329cfcac15cc42591890852e158b603bd4bd2cc57a8339d701493a66576c','125ac6b16ea9adea65c5f2ba5d34d9683d6d7396d095ec7013a7f776a41c0d67'],
  'search-second-and-total':[...searchSecondPage,searchSecondLinks],
  'search-second-in-chinese':[...searchSecondPage,searchSecondLinks],
  'search-visible-vs-total':searchSecondPage,
  'search-total-without-extra-read':searchSecondPage,
  'search-fullwidth':[4,4,'c5f816fba6624b6a34ff9b71e8b41063e6257c92de21ff5f8dad5535b02bac94','c04b30521a836db4721afe521edc9420dd71cda4ed134a44d0408999baa8faf9'],
  'search-literal-percent':[0,0,'af1c44b6798588d950ccfc3c12bfb488a8f640018185434b7c5d117158b5ab3d'],
  'search-literal-underscore':[5,5,'ae99f9f605b01e43233e316e7debda4bffdbdaa8289ea35ba62b1fbe8053c9a1','8dfa1727fc4da0d46307800f1c1415154ea8bbf99799d97bb1f5c1dfb7d4509b'],
  'search-empty-term':[3291,20,'6c99f07ad22a162ae6ce26cd0e29502630639cde309178b1595679c706ff8903'],
  'search-past-last':[27,0,'4599894ed09b53f5fb8b015b628f39bdfd2818a62741c5ef0600463416770d77'],
  'category-second':[907,20,'6e5d010e3a5a49fcd26692e0659738baca862e0302ccd8a5e8926d56034bf80a','adfcf0df506918af9567d3571a15ec4ee876eacf0845c5b1ab8470b6fbb4997a'],
  'category-last':[907,7,'ca5eabda8b43f09c6adf5b4a754ecab219d0a5c6fd9fb6d9bdb6713958fb1353','a13446f9d7f1344281303be70778bc3d28fc18be9e2edf513f14298d09cfbc73'],
  'category-parent-not-descendants':[0,0,'209453e7cd88d52cbde38991f5d287c820c7475ea715d2be3a49da7b963b7103'],
  'category-empty':[0,0,'2f8824972f0b058ce5e40be20e971b6038503f1e70808728c304fd79c52a6265'],
  'category-unknown-does-not-verify-identity':[0,0,'6edcddd1af9c359999007c7ebffcf097c05db4ee917b5483b768c78ee5109988'],
  'category-past-last':[85,0,'c6c63bd8d5b571aedd7bdd5b3466a3d37e103640fea7f25b0bcc1324f060a11b'],
};

export const hasPublishedCourseProjection=suffix=>Object.hasOwn(projections,suffix);

function catalogProjectionOracle(testCase){
  const prefix='account:elearning-catalog-';
  const suffix=typeof testCase?.id==='string'&&testCase.id.startsWith(prefix)?testCase.id.slice(prefix.length):null;
  if(!hasPublishedCourseProjection(suffix))throw new Error('Unknown Digital Academy course projection.');
  const [total,visibleCount,sha256,linksSha256=emptyLinks]=projections[suffix];
  return {total,visibleCount,sha256,linksSha256};
}

const hasFields=(row,keys)=>row!==null&&typeof row==='object'
  &&isDeepStrictEqual(Object.keys(row).sort(),keys);

export function verifyCatalogProjection(packet,callerId,testCase){
  if(!hasFields(packet,['courses','total','userId'])||packet.userId!==callerId
    ||!Number.isSafeInteger(packet.total)||packet.total<0
    ||!Array.isArray(packet.courses)||packet.courses.length>20)
    throw new Error('Digital Academy course read did not match the caller or projection shape.');
  const rows=packet.courses.map(row=>{
    if(!hasFields(row,['category_id','id','position','self_enroll','title']))
      throw new Error('Digital Academy course read exposed unexpected fields.');
    return [row.id,row.category_id,row.title,row.self_enroll,row.position];
  });
  const {linksSha256:_,...expected}=catalogProjectionOracle(testCase);
  const projection={total:packet.total,visibleCount:rows.length,sha256:digest([testCase.catalogOracle.rpc,packet.total,rows])};
  if(!isDeepStrictEqual(projection,expected))
    throw new Error('Digital Academy course read differs from the independent published catalog oracle.');
  return projection;
}

export function catalogCourseLinksMatch(testCase,answer){
  const links=[...answer.matchAll(/\[([^\]\n]*)\]\(\/elearning\/course\/(\d+)\)/gu)]
    .map(([,title,id])=>[Number(id),title.replace(/&#(\d{1,3});/gu,(_,code)=>String.fromCharCode(Number(code)))]);
  return digest(links)===catalogProjectionOracle(testCase).linksSha256;
}

export async function readCatalogObservations(testCase,{users,publishable,fetchImpl,readResponse,signal}){
  if(!Array.isArray(users)||users.length!==2||users.some(user=>!uuid.test(user?.id)||typeof user.token!=='string'||!user.token)
    ||users[0].id===users[1].id||users[0].token===users[1].token)
    throw new Error('Two distinct disposable Digital Academy callers are required.');
  const [category,term,page]=testCase.catalogOracle.rpc;
  const url=new URL('/rest/v1/rpc/elearning_catalog','https://'+metadataProject+'.supabase.co');
  const observations=[];
  for(const user of users){
    let packet;
    try{
      const response=await fetchImpl(url,{method:'POST',redirect:'error',credentials:'omit',cache:'no-store',
        headers:{apikey:publishable,Authorization:'Bearer '+user.token,'Content-Type':'application/json'},
        body:JSON.stringify({p_category:category,p_term:term,p_page:page,p_course:null}),signal});
      packet=await readResponse(response,url,32768);
    }catch{throw new Error('The authenticated Digital Academy course projection was unavailable.');}
    observations.push(verifyCatalogProjection(packet,user.id,testCase));
  }
  return observations;
}

export function bindCatalogObservation(testCase,envelope,{before,after}){
  const {linksSha256:_,...projection}=catalogProjectionOracle(testCase);
  const paired=[projection,projection];
  const request=assistantDispatchObservation(catalogEndpoint,JSON.stringify({
    question:testCase.question,history:[],route:testCase.route,stream:true,consentedResearchUse:false,
  }));
  const ticket=envelope.deploymentCheck;
  const events=envelope.events?.map(({kind,status})=>[kind,status]);
  const expectedEvents=[
    ['account-read:elearningCatalog:1','running'],['account-read:elearningCatalog:1','complete'],
    ['verification-1','running'],['verification-1','complete'],
  ];
  if(envelope.execution!=='live-native'||envelope.statusCode!==200||envelope.deploymentIntegrityFailed||envelope.fixtureIntegrityFailed
    ||!uuid.test(envelope.correlationId)||!/^[a-f0-9]{40}$/u.test(envelope.sourceRevision??'')
    ||ticket?.verified!==true||ticket.sourceRevision!==envelope.sourceRevision
    ||!Number.isSafeInteger(ticket.requestIndex)||ticket.requestIndex<1
    ||envelope.body?.verification?.attempts!==1||!isDeepStrictEqual(envelope.catalogDispatch,request)
    ||!isDeepStrictEqual(events,expectedEvents)
    ||!isDeepStrictEqual(before,paired)||!isDeepStrictEqual(after,paired))
    throw new Error('Digital Academy catalog evidence does not match the pinned request and caller readbacks.');
  return {caseId:testCase.id,correlationId:envelope.correlationId,sourceRevision:envelope.sourceRevision,
    requestIndex:ticket.requestIndex,request,method:'paired authenticated course catalog RPC projections and endpoint progress',
    before,after};
}

export function hasBoundCatalogObservation(testCase,envelope){
  const readback=envelope.fixtureReadback;
  if(readback?.verified!==true||readback.independentGolden!==true||readback.projectRef!==metadataProject
    ||!readback.elearningCatalog)return false;
  try{return isDeepStrictEqual(readback.elearningCatalog,bindCatalogObservation(testCase,envelope,readback.elearningCatalog));}
  catch{return false;}
}
