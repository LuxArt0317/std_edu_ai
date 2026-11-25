import assert from 'node:assert/strict';
import {repairPaths,repairStatuses} from '../../../src/features/public/affairs/facilityRepair.js';
import {fixtureIds as ids} from './assistant-renderer-inventory.mjs';

const id = ids.leave;
const opened = '2026-11-14T01:00:00Z', updated = '2026-11-14T03:00:00Z';
const building = 'Renderer Fixture Hall', location = 'Room QA-22', item = 'Renderer fixture light';
const report = 'Renderer fixture light flickers after switching on.';
const note = 'Renderer fixture technician scheduled an inspection.';
export const rendererRepairDeniedMessage = '您的帳戶無法使用此操作。';
const status = 'in_progress';
const historyPath = repairPaths.history+'/'+id;
const denied = {kind:'student-denied',status:403};
const expectations = new Map([
  [repairPaths.history,{kind:'owned-list',status:200,detailHref:historyPath}],
  [historyPath,{kind:'owned-detail',status:200}],
  [repairPaths.manage,denied],
  [repairPaths.manage+'/'+id,denied],
]);

export const rendererRepairContextProbe = {
  route:historyPath,question:'What is the latest note on this repair report?',reply:note,
};

export function rendererRepairExpectation(path) {
  return expectations.get(path);
}

export function rendererRepairRead(url,userId) {
  const scope = url.searchParams.get('scope'), view = url.searchParams.get('view');
  if(scope!=='facility-repairs'||!['mine','manage'].includes(view))return null;
  const detail = url.searchParams.has('id');
  assert.equal(url.searchParams.size,3);
  assert.deepEqual(Object.fromEntries(url.searchParams),{scope,view,...(detail?{id}:{page:'0'})});
  if(view==='manage')return {status:403,json:{error:rendererRepairDeniedMessage}};
  const row = {id,user_id:userId,building,location,item,created_at:opened,updated_at:updated,status,version:2};
  const json = detail?{userId,detail:{...row,description:report},events:[
    {status:'submitted',version:1,note:'',occurred_at:opened},
    {status,version:2,note,occurred_at:updated},
  ]}:{userId,rows:[row],total:1,page:0,pageSize:25};
  return {status:200,json};
}

export async function verifyRendererRepair(page,expected) {
  const body = page.locator('.repair-body');
  if(expected.kind==='student-denied'){
    await body.getByRole('alert').filter({hasText:rendererRepairDeniedMessage}).waitFor();
    assert.equal(await body.locator('.repair-table, .repair-detail, .repair-events').count(),0);
    assert.equal(await body.getByRole('button',{name:/^(?:開始處理|完成報修|重新處理)$/u}).count(),0);
    return;
  }
  if(expected.kind==='owned-list'){
    const row = body.getByRole('row').filter({hasText:item+' · '+repairStatuses[status][0]});
    await row.getByRole('cell',{name:building+' · '+location,exact:true}).waitFor();
    assert.equal(await row.getByRole('link',{name:id.slice(0,8).toUpperCase(),exact:true}).getAttribute('href'),expected.detailHref);
    return;
  }
  await body.locator('.repair-detail').getByText(report,{exact:true}).waitFor();
  await body.locator('.repair-events').getByText(note,{exact:true}).waitFor();
  await body.getByText(id.slice(0,8).toUpperCase()+' · '+repairStatuses[status][0],{exact:true}).waitFor();
}
