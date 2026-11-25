import assert from 'node:assert/strict';
import {clubPath,clubEquipmentNewPath,clubScope,validClubWorkspace} from '../../../server/clubServicesContract.js';
import {clubApplicationChoices,clubOfficerScope,clubOfficerViews,validClubOfficerWorkspace} from '../../../server/clubOfficerContract.js';
import {fixtureIds as ids} from './assistant-renderer-inventory.mjs';

const club = {id:'45000000-0000-4000-8000-000000000020',name:'Renderer fixture astronomy club'};
const microphone = {id:'45000000-0000-4000-8000-000000000021',label:'Renderer fixture microphone',category:'A01'};
const activityId = '45000000-0000-4000-8000-000000000022';
const submittedId = '45000000-0000-4000-8000-000000000023';
const completedId = '45000000-0000-4000-8000-000000000024';
const reviewEquipmentId = '45000000-0000-4000-8000-000000000027';
const reviewApplicationId = '45000000-0000-4000-8000-000000000028';
const student = {student_number:'QA-CLUB-001',student_name:'Renderer fixture club member'};
const reviewerRequest = 'Renderer fixture review applicant';
const studentNumber = 'QA-CLUB-002';
const activity = 'Renderer fixture skywatch';
const calendarRoom = 'Renderer fixture observatory';
const application = 'Renderer fixture astronomy workshop';
const completion = 'Renderer fixture outreach event';
const reviewApplication = 'Renderer fixture faculty review application';
const advisor = 'Renderer fixture club adviser';
const roleLabel = 'Renderer fixture roster officer';
const contact = '0900000421';
const period = {academic_year:115,term:1};
const dateStamp = '2026-11-14T09:00:00Z';
const pickup = '2026-11-26', returned = '2026-11-27';
const activityDetails = {
  advisor,advisor_phone:'',area:'campus',campus_location:calendarRoom,club_id:club.id,co_organizer:'',
  coordinator:'Fixture coordinator',coordinator_phone:'',education_other:'',ends_at:'2026-11-15T04:00:00Z',hours:'2',
  location:calendarRoom,offsite_location:'',organizer:club.name,starts_at:'2026-11-15T02:00:00Z',title:application,
  ...Object.fromEntries(Object.keys(clubApplicationChoices).map(key=>[key,[]])),
};
const applicationRow = {
  ...period,id:submittedId,version:1,club_id:club.id,club_name:club.name,title:application,organizer:club.name,
  location:calendarRoom,starts_at:activityDetails.starts_at,ends_at:activityDetails.ends_at,hours:2,details:activityDetails,
  completion_note:'',review_note:'',status:'submitted',can_edit:true,updated_at:dateStamp,
};
const roster = {...period,...student,club_name:club.name};
const contactEmpty = Object.fromEntries(['lead_name','lead_email','lead_phone','lead_mobile','review_status','lending_status'].map(key=>[key,null]));
export const rendererClubDeniedMessage = '此帳戶無法查看這個頁面。';
const denial = {status:403,json:{error:rendererClubDeniedMessage}};
const equipmentRow = {
  ...student,id:ids.course,club_id:club.id,club_name:club.name,phone:contact,pickup_on:pickup,return_on:returned,
  purpose:'meeting',other_purpose:'',collateral:'',version:1,status:'submitted',updated_at:dateStamp,
  items:[{id:microphone.id,label:microphone.label}],
};
const editPath = clubEquipmentNewPath+'?edit='+ids.course;
const officerPath = clubPath+'/officer/';
const memberPath = officerPath+'members';
const selectedClub = '?club='+club.id;
const fixtures = new Map([
  [clubPath+'/activities',{kind:'calendar',scope:clubScope}],
  [clubPath+'/equipment',{kind:'equipment-list',scope:clubScope}],
  [clubEquipmentNewPath,{kind:'equipment-create',scope:clubScope}],
  [editPath,{kind:'equipment-edit',scope:clubScope}],
  [clubPath+'/equipment/review',{kind:'equipment-review',scope:clubScope,review:true}],
  [officerPath+'new',{kind:'officer-create',scope:clubOfficerScope}],
  [officerPath+'applications',{kind:'officer-list',scope:clubOfficerScope,text:application}],
  [officerPath+'completion',{kind:'officer-list',scope:clubOfficerScope,text:completion}],
  [officerPath+'profiles',{kind:'officer-list',scope:clubOfficerScope,text:advisor}],
  [memberPath,{kind:'officer-roster',scope:clubOfficerScope,text:roleLabel}],
  [officerPath+'participation',{kind:'officer-roster',scope:clubOfficerScope,text:completion}],
  [officerPath+'review',{kind:'officer-review',scope:clubOfficerScope,review:true}],
]);
export const rendererClubContextProbes = new Map([
  [editPath,{route:editPath,question:'What is the status of this equipment request?',reply:'The selected fixture request is pending.'}],
  [memberPath,{route:memberPath+selectedClub,question:'Which view is open on this page?',reply:'The renderer received the selected club members page.'}],
]);

export function rendererClubExpectation(route) {
  return fixtures.get(route);
}

const todayTaipei = () => new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());

export function rendererClubRead(url,userId,manager) {
  const query = Object.fromEntries(url.searchParams), {scope,view} = query;
  if(scope!==clubScope&&scope!==clubOfficerScope)return null;
  assert.equal(url.searchParams.size,Object.keys(query).length);
  if(scope===clubScope){
    const {month} = query;
    const today = view==='activities'?todayTaipei():'2026-11-14';
    assert.ok(['activities','equipment','review'].includes(view));
    assert.deepEqual(query,{scope,view,...(view==='activities'?{month:today.slice(0,7)}:{})});
    assert.ok(!manager||view==='review');
    if(view==='review'&&!manager)return denial;
    const base={userId,view,manager,today,student:null,clubs:[],equipment:[],rows:[]};
    if(view==='activities')base.rows=[{id:activityId,title:activity,club_name:club.name,category:'lecture',
      starts_at:month+'-12T02:00:00Z',ends_at:month+'-12T04:00:00Z',location:calendarRoom,description:'A fixture calendar event.'}];
    if(view==='equipment')Object.assign(base,{student,clubs:[club],equipment:[microphone],rows:[equipmentRow]});
    if(view==='review')base.rows=[{...equipmentRow,id:reviewEquipmentId,student_name:reviewerRequest,student_number:studentNumber}];
    assert.ok(validClubWorkspace(base,userId,view));
    return {status:200,json:base};
  }
  assert.ok(clubOfficerViews.includes(view));
  assert.ok(!manager||view==='review');
  const selected=query.club!==undefined;
  assert.ok(!selected||['members','participation'].includes(view));
  assert.deepEqual(query,{scope,view,...(selected?{club:club.id}:{})});
  if(view==='review'&&!manager)return denial;
  const completed = {...applicationRow,id:completedId,title:completion,status:'completed',version:3,
    completion_note:'Renderer fixture outreach summary.',review_note:'Renderer fixture approved notice.',
    details:{...activityDetails,title:completion}};
  const views = {
    applications:[applicationRow],
    completion:[completed],
    profiles:[{...club,...period,...contactEmpty,location:calendarRoom,advisor,member_count:1}],
    members:selected?[{...roster,id:userId,role_label:roleLabel,officer:true,contact_email:null,contact_phone:null}]:[],
    participation:selected?[{...roster,id:completed.id,title:completed.title,starts_at:completed.starts_at}]:[],
    review:[{...applicationRow,id:reviewApplicationId,title:reviewApplication,details:{...activityDetails,title:reviewApplication},can_edit:false}],
  };
  const json={userId,view,clubs:[club],rows:views[view]};
  assert.ok(validClubOfficerWorkspace(json,userId,view));
  return {status:200,json};
}

export async function verifyRendererClub(page,expected,{manager,origin,route}) {
  const main=page.locator('.student-clubs main');
  if(expected.review&&!manager){
    await main.getByRole('alert').filter({hasText:rendererClubDeniedMessage}).waitFor();
    assert.equal(await main.getByRole('table').count(),0);
    assert.equal(await main.getByRole('button',{name:'審核',exact:true}).count(),0);
    return {view:'student-denied',status:403};
  }

  let selectedRoute;
  switch(expected.kind){
    case 'calendar': {
      await main.getByRole('button',{name:activity,exact:true}).press('Enter');
      const details=page.getByRole('dialog',{name:activity,exact:true});
      await details.getByText(calendarRoom,{exact:true}).waitFor();
      await page.keyboard.press('Escape');
      await details.waitFor({state:'hidden'});
      break;
    }
    case 'equipment-list':
      await main.getByRole('cell',{name:microphone.label,exact:true}).waitFor();
      assert.equal(await main.getByRole('link',{name:'編輯',exact:true}).getAttribute('href'),editPath);
      break;
    case 'equipment-create':
    case 'equipment-edit': {
      const form=main.locator('.club-equipment-form');
      await form.waitFor();
      assert.equal(await form.getByLabel('學號',{exact:true}).inputValue(),student.student_number);
      const editing=expected.kind==='equipment-edit';
      assert.equal(await form.getByLabel('已選器材',{exact:true}).inputValue(),editing?microphone.label:'');
      assert.equal(await form.getByLabel('物品領取日',{exact:true}).inputValue(),editing?pickup:'');
      break;
    }
    case 'officer-create': {
      const form=main.locator('.club-officer-form');
      await form.waitFor();
      const options=form.getByLabel('社團名稱',{exact:true}).locator('option');
      assert.deepEqual(await options.allTextContents(),['請選擇',club.name]);
      assert.equal(await form.getByLabel('活動名稱',{exact:true}).inputValue(),'');
      break;
    }
    case 'officer-roster': {
      const form=main.locator('.club-roster-search');
      await form.getByLabel('社團名稱',{exact:true}).selectOption(club.id);
      await form.getByRole('button',{name:'查詢',exact:true}).press('Enter');
      selectedRoute=route+selectedClub;
      await page.waitForURL(origin+selectedRoute);
      await main.getByRole('cell',{name:expected.text,exact:true}).waitFor();
      break;
    }
    case 'equipment-review':
    case 'officer-review': {
      const row=main.getByRole('row').filter({has:page.getByRole('cell',{name:expected.kind==='officer-review'?reviewApplication:reviewerRequest,exact:true})});
      await row.getByRole('button',{name:'審核',exact:true}).waitFor();
      await row.getByRole('cell',{name:'待審核',exact:true}).waitFor();
      break;
    }
    case 'officer-list':
      await main.getByRole('cell',{name:expected.text,exact:true}).waitFor();
      break;
    default:
      throw new Error('Unbound club readback.');
  }
  return {view:manager?'manager-review':'signed-in-records',status:200,selectedRoute};
}
