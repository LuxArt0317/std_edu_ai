import assert from 'node:assert/strict';
import {learningSupportReviewScope} from '../../../server/learningSupport.js';
import {learningSupportPath} from '../../../src/features/public/affairs/studentServices.js';
import {affairsTestUser} from './affairs-auth.mjs';

const reviewPath=learningSupportPath+'/review';
const denied='This learning support operation is unavailable to your account.';
const submittedAt='2026-11-14T01:00:00Z';
const request={id:'45000000-0000-4000-8000-000000000027',ownerId:affairsTestUser.id,
  topic:'Renderer fixture study plan',details:'Review a synthetic study plan for the next lab.',status:'in_review',
  reviewNote:'Renderer fixture session notes received.',version:2,submittedAt,updatedAt:'2026-11-15T01:00:00Z'};

export const rendererLearningSupportReviewExpectation=route=>route===reviewPath;
export const rendererLearningSupportContextProbe={route:reviewPath,
  question:'What information is available on this learning support review page?',
  reply:'The renderer received the learning support review page context.'};

export function rendererLearningSupportReviewRead(url,userId,manager) {
  if(url.searchParams.get('scope')!==learningSupportReviewScope)return null;
  assert.equal(url.searchParams.size,2);
  assert.deepEqual(Object.fromEntries(url.searchParams),{scope:learningSupportReviewScope,page:'1'});
  if(!manager)return {status:403,json:{error:denied}};
  assert.notEqual(userId,request.ownerId);
  return {status:200,json:{userId,canReview:true,view:'review',page:1,total:1,rows:[request]}};
}

export async function verifyRendererLearningSupportReview(page,manager) {
  const workspace=page.locator('.student-service');
  if(!manager){
    await workspace.getByRole('alert').filter({hasText:denied}).waitFor();
    assert.equal(await workspace.getByRole('table').count(),0);
    assert.equal(await workspace.getByRole('link',{name:'站內審查 · Review requests',exact:true}).count(),0);
    return;
  }
  const reviewLink=workspace.getByRole('link',{name:'站內審查 · Review requests',exact:true});
  assert.equal(await reviewLink.getAttribute('aria-current'),'page');
  const row=workspace.getByRole('region',{name:'Learning support requests'}).getByRole('row').filter({hasText:request.topic});
  await row.getByText(request.details,{exact:true}).waitFor();
  await row.getByText('審查備註 · Review note: '+request.reviewNote,{exact:true}).waitFor();
  await row.getByRole('cell',{name:'站內審查中 · In site review',exact:true}).waitFor();
  await row.getByRole('button',{name:'完成審查 · Complete review',exact:true}).press('Enter');
  const confirmation=page.getByRole('dialog',{name:'確認審查變更 · Confirm review change',exact:true});
  await confirmation.getByText(request.topic,{exact:true}).waitFor();
  assert.equal(await confirmation.locator('textarea').inputValue(),request.reviewNote);
  await confirmation.getByRole('button',{name:'返回 · Back',exact:true}).press('Enter');
  await confirmation.waitFor({state:'hidden'});
}
