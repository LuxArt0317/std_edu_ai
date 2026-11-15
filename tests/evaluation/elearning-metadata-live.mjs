import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';

export const metadataFixtureRequirement='elearning_metadata_disposable';
export const metadataEndpoint='/api/affairs-assistant';
export const metadataProject='xiftudmvxphxcjtmfmib';
export const metadataCasePrefix='account:elearning-catalog-pending-';
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/iu;
const digest=value=>createHash('sha256').update(value).digest('hex');

// Frozen projections of the published category and notice seeds. The digest
// covers selector, row order, hierarchy, titles, literal counts and notice text.
const projections={
  'tree-exact-hierarchy':[43,'none','d49036d55e99463452eb71927211e16c3b81ee4aded1c3b2c92f70a36ee77016'],
  'category-identity-not-search-count':[1,'none','62b40b0c03e7ab3a93b56c03e517ef10bee4145db781e8e200c60941d48f6e39'],
  'category-distinct-counts':[13,'none','11af62f5b427147c5ceb384966cea6bab793b443951955b9133ae46272b684a5'],
  'notice-saved-local-body':[0,'saved-body','43414e6ff734c94d61f4d5d5837e9d7a824b50e79ca58c7455d712bc4dba3097'],
  'notice-title-only':[0,'title-only','9a97f0c992895c3b01048fe8296f9ea76ccbcfdfaf6c0ae23313413ecfcbfc75'],
  'notice-unknown':[0,'missing','4acd724cc87dd3807d81775f093bc612077b6ddc696644bcc6859af080a5f17b'],
};

export function metadataProjectionOracle(testCase){
  const suffix=typeof testCase?.id==='string'&&testCase.id.startsWith(metadataCasePrefix)
    ?testCase.id.slice(metadataCasePrefix.length):null;
  const projection=Object.hasOwn(projections,suffix)?projections[suffix]:null;
  if(!projection)throw new Error('Unknown Digital Academy metadata fixture.');
  const [categoryCount,noticeState,sha256]=projection;
  return {categoryCount,noticeState,sha256};
}

const hasFields=(value,keys)=>value!==null&&typeof value==='object'
  &&isDeepStrictEqual(Object.keys(value).sort(),keys);

export function verifyMetadataProjection(packet,callerId,testCase){
  const [view,id]=testCase.metadataOracle.rpc;
  if(!hasFields(packet,['categories','id','notice','userId','view'])
    ||packet.userId!==callerId||packet.view!==view||packet.id!==id
    ||!Array.isArray(packet.categories)||packet.categories.length>128)
    throw new Error('Digital Academy metadata read did not match the caller or selector.');
  const categories=packet.categories.map(row=>{
    if(!hasFields(row,['id','parentId','sourceCount','title']))
      throw new Error('Digital Academy category read exposed unexpected fields.');
    return [row.id,row.parentId,row.title,row.sourceCount];
  });
  let notice=null;
  if(packet.notice!==null){
    if(!hasFields(packet.notice,['body','id','title']))
      throw new Error('Digital Academy notice read exposed unexpected fields.');
    notice=[packet.notice.id,packet.notice.title,packet.notice.body];
  }
  const observation={categoryCount:categories.length,noticeState:view==='notice'
    ?notice===null?'missing':notice[2]===null?'title-only':'saved-body':'none',
    sha256:digest(JSON.stringify([view,id,categories,notice]))};
  if(!isDeepStrictEqual(observation,metadataProjectionOracle(testCase)))
    throw new Error('Digital Academy metadata differs from the independent saved-source oracle.');
  return observation;
}

export async function readMetadataObservations(testCase,{users,publishable,fetchImpl,readResponse,signal}){
  if(users.length!==2||users.some(user=>!uuid.test(user.id)||typeof user.token!=='string'||!user.token)
    ||users[0].id===users[1].id||users[0].token===users[1].token)
    throw new Error('Two distinct disposable Digital Academy callers are required.');
  const [view,id]=testCase.metadataOracle.rpc;
  const url=new URL('/rest/v1/rpc/elearning_page_metadata','https://'+metadataProject+'.supabase.co');
  const observations=[];
  for(const user of users){
    let packet;
    try{
      const response=await fetchImpl(url,{method:'POST',redirect:'error',credentials:'omit',cache:'no-store',
        headers:{apikey:publishable,Authorization:'Bearer '+user.token,'Content-Type':'application/json'},
        body:JSON.stringify({p_view:view,p_id:id}),signal});
      packet=await readResponse(response,url,32768);
    }catch{throw new Error('The authenticated Digital Academy metadata projection was unavailable.');}
    observations.push(verifyMetadataProjection(packet,user.id,testCase));
  }
  return observations;
}

export function metadataDispatchObservation(endpoint,body){
  return {endpoint,bodySha256:digest(body)};
}

export function bindMetadataObservation(testCase,envelope,{before,after}){
  const observation=metadataProjectionOracle(testCase);
  const request=metadataDispatchObservation(metadataEndpoint,JSON.stringify({
    question:testCase.question,history:[],route:testCase.route,stream:true,consentedResearchUse:false,
  }));
  const ticket=envelope.deploymentCheck;
  const eventSequence=envelope.events?.map(({kind,status})=>[kind,status]);
  const expectedEvents=[
    ['account-read:elearningMetadata:1','running'],['account-read:elearningMetadata:1','complete'],
    ['verification-1','running'],['verification-1','complete'],
  ];
  if(envelope.execution!=='live-native'||envelope.statusCode!==200||envelope.fixtureIntegrityFailed
    ||!uuid.test(envelope.correlationId)||!/^[a-f0-9]{40}$/u.test(envelope.sourceRevision??'')
    ||ticket?.verified!==true||ticket.sourceRevision!==envelope.sourceRevision
    ||!Number.isSafeInteger(ticket.requestIndex)||ticket.requestIndex<1
    ||envelope.body?.verification?.attempts!==1
    ||!isDeepStrictEqual(envelope.metadataDispatch,request)
    ||!isDeepStrictEqual(eventSequence,expectedEvents)
    ||!isDeepStrictEqual(before,[observation,observation])
    ||!isDeepStrictEqual(after,[observation,observation]))
    throw new Error('Digital Academy metadata evidence does not match the pinned request and caller readbacks.');
  return {caseId:testCase.id,correlationId:envelope.correlationId,sourceRevision:envelope.sourceRevision,
    requestIndex:ticket.requestIndex,request,method:'paired authenticated metadata RPC projections and endpoint progress',
    before,after};
}

export function hasBoundMetadataObservation(testCase,envelope){
  const readback=envelope.fixtureReadback;
  if(readback?.verified!==true||readback.independentGolden!==true||readback.projectRef!==metadataProject
    ||!readback.elearningMetadata)return false;
  try{return isDeepStrictEqual(readback.elearningMetadata,bindMetadataObservation(testCase,envelope,readback.elearningMetadata));}
  catch{return false;}
}
