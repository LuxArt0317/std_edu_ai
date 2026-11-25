import assert from 'node:assert/strict';
import {counselingKinds,counselingPath,counselingScope,counselingStatus} from '../../../server/counselingContract.js';
import {venuePaths} from '../../../src/features/public/affairs/venueContract.js';
import {affairsTestUser} from './affairs-auth.mjs';

const counselingRoute=counselingPath+'/queue';
const appointment={id:'45000000-0000-4000-8000-000000000028',user_id:affairsTestUser.id,contact_email:'appointment@renderer.invalid',
  kind:'assessment',status:'requested',preferred_on:'2026-11-22',preferred_period:'afternoon',scheduled_at:null,version:1,
  updated_at:'2026-11-15T04:00:00Z'};
const venueRequest={id:'45000000-0000-4000-8000-000000000029',user_id:affairsTestUser.id,venue:'QA220',booking_date:'2026-11-30',
  period:'6',purpose:'Renderer fixture rehearsal',status:'submitted',review_note:'',version:1,created_at:'2026-11-15T04:00:00Z'};
const counseling={role:'counseling-coordinator',scope:counselingScope,view:'queue',marker:'.counseling-appointments',
  deniedText:'此帳戶無權使用此功能。',response:{available:true,canCoordinate:true,rows:[appointment]}};
const venue={role:'venue-manager',scope:'venue-requests',view:'manage',marker:'.venue-requests',
  deniedText:'場地資料暫時無法處理。',response:{rows:[venueRequest]}};
const expectations=new Map([[counselingRoute,counseling],[venuePaths.manage,venue]]);

export const rendererStaffReviewContextProbes=new Map([
  [counselingRoute,{route:counselingRoute,question:'What is displayed on this appointment queue page?',
    reply:'The renderer received the counseling queue page context.'}],
  [venuePaths.manage,{route:venuePaths.manage,question:'What information is displayed on this review page?',
    reply:'The renderer received the venue review page context.'}],
]);

export const rendererStaffReviewExpectation=route=>expectations.get(route);

export function rendererStaffReviewRead(url,userId,role) {
  const scope=url.searchParams.get('scope'),view=url.searchParams.get('view');
  const expected=[counseling,venue].find(row=>row.scope===scope&&row.view===view);
  if(!expected)return null;
  assert.equal(url.searchParams.size,2);
  assert.deepEqual(Object.fromEntries(url.searchParams),{scope:expected.scope,view:expected.view});
  if(role!==expected.role)return {status:403,json:{error:expected.deniedText}};
  assert.notEqual(userId,affairsTestUser.id);
  return {status:200,json:{userId,...expected.response}};
}

export async function verifyRendererStaffReview(page,expected,role) {
  const workspace=page.locator(expected.marker);
  if(role!==expected.role){
    await workspace.getByRole('alert').filter({hasText:expected.deniedText}).waitFor();
    assert.equal(await workspace.getByRole('table').count(),0);
    assert.equal(await workspace.getByRole('button',{name:/^(?:處理|核准|不核准)$/u}).count(),0);
    return;
  }
  if(expected===counseling){
    const row=workspace.getByRole('region',{name:'待處理預約'}).getByRole('row').filter({hasText:appointment.contact_email});
    for(const value of [appointment.contact_email,counselingKinds[appointment.kind],appointment.preferred_on,'下午',counselingStatus[appointment.status][0]])
      await row.getByRole('cell',{name:value,exact:true}).waitFor();
    const select=row.getByRole('button',{name:'處理',exact:true});
    await select.press('Enter');
    assert.equal(await select.getAttribute('aria-pressed'),'true');
    const form=workspace.locator('form');
    await form.getByText(appointment.contact_email,{exact:true}).waitFor();
    assert.equal(await form.getByLabel('時間（臺北）',{exact:true}).inputValue(),'');
    assert.equal(await form.getByRole('button',{name:'儲存時間',exact:true}).isDisabled(),true);
    return;
  }
  const row=workspace.getByRole('region',{name:'場地申請紀錄'}).getByRole('row').filter({hasText:venueRequest.purpose});
  for(const value of [venueRequest.venue,venueRequest.booking_date,venueRequest.period,venueRequest.purpose,'已送出'])
    await row.getByRole('cell',{name:value,exact:true}).waitFor();
  await row.getByRole('button',{name:'核准',exact:true}).press('Enter');
  const confirmation=page.getByRole('dialog',{name:'確認申請狀態',exact:true});
  await confirmation.getByText(`${venueRequest.venue} · ${venueRequest.booking_date} · ${venueRequest.period}`,{exact:true}).waitFor();
  await confirmation.getByRole('button',{name:'返回',exact:true}).press('Enter');
  await confirmation.waitFor({state:'hidden'});
}
