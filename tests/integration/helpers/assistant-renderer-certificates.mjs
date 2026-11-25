import assert from 'node:assert/strict';
import {certificateAwardLabels,certificateAwardPath,certificateAwardScope} from '../../../server/certificateAwardsContract.js';
import {fixtureIds as ids} from './assistant-renderer-inventory.mjs';

const catalogRoute=certificateAwardPath+'/catalog';
const recordRoute=certificateAwardPath+'/record/'+ids.leave;
const certificate={code:'4601',name:'Renderer Certificate of Digital Skills',level:'Practitioner',issuer:'Renderer Skills Institute'};
const record={id:ids.leave,certificate_code:certificate.code,name:certificate.name,level:certificate.level,issuer:certificate.issuer,
  obtained_on:'2026-11-01',phone:'',teacher_code:'',wants_award:true,status:'reviewing',application_fee:0,award_amount:null,
  review_note:'Renderer fixture review in progress.',version:2,updated_at:'2026-11-15T04:00:00Z'};
const status=certificateAwardLabels[record.status][0];
const certificateRoutes=new Map([[catalogRoute,'catalog'],[recordRoute,'record']]);

export const rendererCertificateContextProbes=new Map([
  [catalogRoute,{route:catalogRoute,question:'What certificate information is displayed on this page?',
    reply:'The renderer received the certificate catalog page context.'}],
  [recordRoute,{route:recordRoute,
    question:'What is the status of this certificate award? Has its payout reached my bank?',
    read:'/api/affairs-data?'+new URLSearchParams({scope:certificateAwardScope,view:'mine',answer:'en',id:ids.leave,bank_receipt:'requested'}),
    reply:certificate.name+' · Under review. I can’t verify whether the payout reached your bank. The saved award amount reflects the application record.'}],
]);

export function rendererCertificateExpectation(route) {
  return certificateRoutes.get(route);
}

export function rendererCertificateRead(url,userId) {
  const scope=url.searchParams.get('scope'),view=url.searchParams.get('view');
  if(scope!==certificateAwardScope)return null;
  if(view==='catalog'){
    assert.deepEqual(Object.fromEntries(url.searchParams),{scope,view,code:'',name:'',level:'',issuer:'',page:'0'});
    return {rows:[certificate],total:1,page:0};
  }
  if(view==='mine'&&url.searchParams.has('id')){
    assert.deepEqual(Object.fromEntries(url.searchParams),{scope,view,id:ids.leave});
    return {userId,identity:null,payout:null,rows:[record],files:[]};
  }
  return null;
}

export async function verifyRendererCertificate(page,view) {
  if(view==='catalog'){
    const row=page.getByRole('region',{name:'證照查詢結果'}).getByRole('row').filter({hasText:certificate.name});
    for(const cell of Object.values(certificate))await row.getByRole('cell',{name:cell,exact:true}).waitFor();
    return;
  }
  assert.equal(view,'record');
  const row=page.getByRole('region',{name:'證照記錄'}).getByRole('row').filter({hasText:certificate.name});
  for(const cell of [record.obtained_on,status])await row.getByRole('cell',{name:cell,exact:true}).waitFor();
  assert.equal(await row.getByRole('link',{name:'檢視 '+certificate.name,exact:true}).getAttribute('href'),recordRoute);
  const workspace=page.locator('.certificate-entry');
  assert.equal(await workspace.getByLabel('證照名稱',{exact:true}).inputValue(),certificate.name);
  assert.equal(await workspace.getByLabel('審核狀態',{exact:true}).inputValue(),status);
  const note=workspace.locator('label').filter({has:page.getByText('審核意見',{exact:true})}).locator('textarea');
  assert.equal(await note.inputValue(),record.review_note);
  assert.equal(await workspace.getByLabel('證照報名費',{exact:true}).inputValue(),'0');
}
