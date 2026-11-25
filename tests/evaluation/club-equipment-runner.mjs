import {buildClubEquipmentHostedPlan,clubEquipmentCaseRoute,clubEquipmentHostedCases,clubEquipmentHostedRouteCases,clubEquipmentRequirement} from './club-equipment-hosted.mjs';
import {clubEquipmentPath} from '../../server/clubEquipmentIntent.js';

const setupReason='Club equipment cases require the isolated two-owner operator and independent exact Preview readbacks.';
const syntheticId=index=>'45040000-0000-4000-8000-'+String(index).padStart(12,'0');
const runId=syntheticId(1);
const catalogFixture=()=>{
  const owners={
    A:{id:syntheticId(2),email:'club-inventory-a@example.invalid',runMarker:runId},
    B:{id:syntheticId(3),email:'club-inventory-b@example.invalid',runMarker:runId},
  };
  return buildClubEquipmentHostedPlan({runId,owners});
};

export function clubEquipmentRunnerCases(){
  const plan=catalogFixture();
  return [...clubEquipmentHostedCases(),...clubEquipmentHostedRouteCases()].map(testCase=>{
    const guest=testCase.actor==='guest',denial=testCase.mode==='unauthorized',privateRead=testCase.mode==='read';
    const empty=testCase.oracle==='a-b-request'||testCase.id==='account:club-equipment-a-b-request';
    const target=clubEquipmentCaseRoute(testCase,plan);
    const question=testCase.question.replace('{aOlder}',plan.rows[1].id).replace('{bRequest}',plan.rows[2].id);
    return {id:testCase.id,domain:testCase.domain,serviceId:'40-1',route:target,question,history:[],
      auth:guest?'anonymous':'signed-in',language:/\p{Script=Han}/u.test(question)?'zh-TW':'en',
      ...(denial?{endpoint:'/api/affairs-assistant'}:{}),
      mode:empty?'empty':privateRead?'record':'access',fixtureKey:guest?'anonymous':'protected-club-equipment',
      fixtureRequirement:clubEquipmentRequirement,setupReason,coveredTools:privateRead?['clubEquipment']:[],
      executionContract:'live-native',equipmentOracle:{packet:'club-equipment-hosted',caseId:testCase.id},
      expected:{behavior:privateRead&&!empty?'answer':denial?'denial':'unavailable',...(denial?{statusCode:401}:{}),
        ...(!denial&&(!privateRead||empty)?{limitation:true}:{}),
        requiredLinks:testCase.mode==='guest'?['/school-affairs/login?next='+encodeURIComponent(clubEquipmentPath)]:privateRead?[clubEquipmentPath]:[],
        requiredSourceBindings:privateRead?[{sourceId:'account:clubEquipment',url:clubEquipmentPath}]:[],
        requiredTools:privateRead?['clubEquipment']:[],allowedTools:privateRead?['clubEquipment']:[],
        requireToolExecution:true,noAction:true,forbidPublicResearch:true,localLinksOnly:true},
      capability:{level:'native',gap:false}};
  });
}

export function clubEquipmentSetupRequired(row){
  return row?.fixtureRequirement===clubEquipmentRequirement||typeof row?.id==='string'&&row.id.startsWith('account:club-equipment-');
}
export function assertClubEquipmentCaseReady(row){
  if(clubEquipmentSetupRequired(row))throw new Error(setupReason);
}
export function clubEquipmentSetupSummary(cases){
  const rows=cases.filter(clubEquipmentSetupRequired);
  return {registered:rows.length,liveEligible:0,caseIds:rows.map(row=>row.id)};
}
