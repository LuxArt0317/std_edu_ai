import React from 'react';
import assert from 'node:assert/strict';
import {afterEach,test} from 'node:test';
import {JSDOM} from 'jsdom';
import {courseSelectionPeriods,type CourseSelectionRecord} from '../../src/services/courseSelection';
import type {CourseSelectionSaveAction} from '../../src/features/public/affairs/CourseSelectionManager';

const dom=new JSDOM('<!doctype html><html><body></body></html>',{url:'http://localhost',pretendToBeVisual:true});
for(const name of ['window','document','HTMLElement','HTMLInputElement','HTMLButtonElement','HTMLSelectElement','Node','Event','MouseEvent','MutationObserver','getComputedStyle','FormData'])Object.defineProperty(globalThis,name,{value:name==='window'?dom.window:name==='document'?dom.window.document:dom.window[name as keyof Window],configurable:true});
Object.defineProperty(globalThis,'navigator',{value:dom.window.navigator,configurable:true});
const {render,screen,cleanup,fireEvent,waitFor}=await import('@testing-library/react');
const {default:userEvent}=await import('@testing-library/user-event');
const {CourseSelectionManager}=await import('../../src/features/public/affairs/CourseSelectionManager');
afterEach(cleanup);
const profiles=[{user_id:'first',display_name:'Same Name',email:'first@example.invalid'},{user_id:'second',display_name:'Same Name',email:'second@example.invalid'}];
const fixture:CourseSelectionRecord={id:'record-one',userId:'first',academicYear:115,semester:1,selectionPhase:'add_drop',termCourseCode:'QA-101',courseTitle:'Synthetic course',
  requiredElectiveText:'必修',credits:3.5,instructorOne:'Synthetic teacher',remarkText:'Y(W)',rowOrder:2,timetableIncluded:true,
  meetings:[{weekday:1,period:'午',room:'QA Room'},{weekday:7,period:'D',room:''}],sourceMode:'local_demo',version:2,createdAt:'2026-11-12T00:00:00Z',updatedAt:'2026-11-12T00:00:00Z'};
const label={account:'Course-selection account',year:'Academic year · 學年',semester:'Semester · 學期',phase:'Selection phase · 選課階段',code:'Term course code · 當學期課號',
  title:'Course title · 科目名稱',required:'Required/elective label · 必選修',credits:'Credits · 學分',instructor:'Instructor one · 任課教師一',remark:'Remark · 備註',order:'Display order · 顯示順序',included:'Include in weekly timetable · 顯示於課表'};
const value=(name:string)=>(screen.getByLabelText(name) as HTMLInputElement).value;
async function startEdit(){await userEvent.setup().click(screen.getByRole('button',{name:'Edit course-selection record',exact:true}));}
function submit(){fireEvent.submit(screen.getByRole('button',{name:'Save course-selection record',exact:true}).closest('form')!);}

test('admin creates an explicit phase/timetable record with all 14 period choices and numeric meeting slots',async()=>{
  const actions:CourseSelectionSaveAction[]=[];
  render(<CourseSelectionManager records={[]} profiles={profiles} busy={false} onSave={async action=>{actions.push(action);return true;}}/>);
  const user=userEvent.setup();
  assert.ok(screen.getByRole('option',{name:'Same Name (first@example.invalid)',exact:true}));assert.ok(screen.getByRole('option',{name:'Same Name (second@example.invalid)',exact:true}));
  await user.selectOptions(screen.getByLabelText(label.account),'second');
  await user.type(screen.getByLabelText(label.year),'115');await user.selectOptions(screen.getByLabelText(label.semester),'3');await user.selectOptions(screen.getByLabelText(label.phase),'summer1');
  await user.type(screen.getByLabelText(label.code),' QA-NEW ');await user.type(screen.getByLabelText(label.title),' New local title ');await user.type(screen.getByLabelText(label.credits),'0');
  await user.type(screen.getByLabelText(label.remark),'Y(W)');
  assert.equal((screen.getByLabelText(label.included) as HTMLInputElement).checked,false,'Remarks must never infer timetable inclusion.');
  await user.click(screen.getByLabelText(label.included));assert.ok(screen.getByText('Included without meeting slots: shown as unscheduled.'));
  await user.click(screen.getByRole('button',{name:'Add meeting slot',exact:true}));
  assert.deepEqual([...screen.getByLabelText('Meeting 1 period').querySelectorAll('option')].map(option=>option.value),['1','2','3','4','午','5','6','7','8','傍','A','B','C','D']);
  await user.selectOptions(screen.getByLabelText('Meeting 1 weekday'),'7');await user.selectOptions(screen.getByLabelText('Meeting 1 period'),'D');await user.type(screen.getByLabelText('Meeting 1 room'),' QA Room ');
  await user.click(screen.getByRole('button',{name:'Save course-selection record',exact:true}));await screen.findByText('Local course-selection record saved.');
  assert.equal(actions.length,1);const payload=actions[0].payload;
  assert.equal(actions[0].kind,'save_course_selection');assert.equal(payload.user_id,'second');assert.equal(payload.academic_year,115);assert.equal(payload.semester,3);assert.equal(payload.selection_phase,'summer1');
  assert.equal(payload.term_course_code,'QA-NEW');assert.equal(payload.course_title,'New local title');assert.equal(payload.credits,0);assert.equal(payload.row_order,0);assert.equal(payload.timetable_included,true);
  assert.equal(payload.required_elective_text,'');assert.equal(payload.instructor_one,'');assert.equal(payload.remark_text,'Y(W)');assert.equal(payload.expected_version,'0');
  assert.deepEqual(payload.meetings,[{weekday:7,period:'D',room:'QA Room'}]);assert.match(String(payload.id),/^[0-9a-f-]{36}$/);assert.match(String(payload.request_id),/^[0-9a-f-]{36}$/);
  assert.equal(value(label.title),'');assert.equal(screen.queryByLabelText('Meeting 1 room'),null);
});

test('editing fixes ownership, supports clearing, retains retry IDs after failures, and suppresses duplicate saves',async()=>{
  const actions:CourseSelectionSaveAction[]=[];let release:(value:boolean)=>void=()=>{};
  render(<CourseSelectionManager records={[fixture]} profiles={profiles} busy={false} onSave={async action=>{
    actions.push(action);if(actions.length===1)return false;if(actions.length===2)throw new Error('Synthetic save failed');return new Promise<boolean>(resolve=>{release=resolve;});
  }}/>);
  const user=userEvent.setup();await startEdit();
  assert.equal((screen.getByLabelText(label.account) as HTMLSelectElement).disabled,true);assert.equal(value(label.required),'必修');assert.equal(value('Meeting 1 period'),'午');assert.equal(value('Meeting 2 weekday'),'7');
  fireEvent.change(screen.getByLabelText(label.account),{target:{value:'second'}});
  for(const name of [label.required,label.instructor,label.remark])await user.clear(screen.getByLabelText(name));
  await user.click(screen.getByLabelText(label.included));await user.click(screen.getByRole('button',{name:'Clear meeting slots',exact:true}));
  submit();await screen.findByRole('alert');submit();await screen.findByText('Synthetic save failed');submit();
  const saving=await screen.findByRole('button',{name:'Saving course-selection record…',exact:true});
  assert.equal((saving.closest('fieldset') as HTMLFieldSetElement).disabled,true);fireEvent.submit(saving.closest('form')!);assert.equal(actions.length,3);
  assert.equal(actions[0].payload.request_id,actions[1].payload.request_id);assert.equal(actions[1].payload.request_id,actions[2].payload.request_id);
  assert.equal(actions[2].payload.id,fixture.id);assert.equal(actions[2].payload.user_id,'first');assert.equal(actions[2].payload.expected_version,'2');
  assert.equal(actions[2].payload.timetable_included,false);assert.deepEqual(actions[2].payload.meetings,[]);
  for(const name of ['required_elective_text','instructor_one','remark_text'])assert.equal(actions[2].payload[name],'');
  release(true);await screen.findByText('Local course-selection record saved.');assert.equal((screen.getByLabelText(label.account) as HTMLSelectElement).disabled,false);
});

test('refresh preserves a dirty draft; explicit loading adopts the latest version and creates a new request ID',async()=>{
  const actions:CourseSelectionSaveAction[]=[];let refreshes=0;
  const onSave=async(action:CourseSelectionSaveAction)=>{actions.push(action);return false;};
  const onRefresh=()=>{refreshes++;};
  const view=render(<CourseSelectionManager records={[fixture]} profiles={profiles} busy={false} onSave={onSave} onRefresh={onRefresh}/>);
  const user=userEvent.setup();await startEdit();await user.clear(screen.getByLabelText(label.title));await user.type(screen.getByLabelText(label.title),'Unsaved draft');submit();await screen.findByRole('alert');
  await user.click(screen.getByRole('button',{name:'Refresh course-selection records',exact:true}));assert.equal(refreshes,1);
  const fresh={...fixture,version:3,courseTitle:'Other admin saved title',credits:4,meetings:[{weekday:5,period:'傍',room:'New room'}]};
  view.rerender(<CourseSelectionManager records={[fresh]} profiles={profiles} busy={false} onSave={onSave} onRefresh={onRefresh}/>);
  assert.equal(value(label.title),'Unsaved draft');assert.equal((screen.getByRole('button',{name:'Save course-selection record',exact:true}) as HTMLButtonElement).disabled,true);
  submit();assert.equal(actions.length,1,'A stale draft must not be written.');
  await user.click(screen.getByRole('button',{name:'Load latest saved version',exact:true}));assert.equal(value(label.title),'Other admin saved title');assert.equal(value('Meeting 1 weekday'),'5');assert.equal(value('Meeting 1 period'),'傍');
  submit();await waitFor(()=>assert.equal(actions.length,2));assert.equal(actions[1].payload.expected_version,'3');assert.notEqual(actions[0].payload.request_id,actions[1].payload.request_id);
  await user.clear(screen.getByLabelText(label.remark));submit();await waitFor(()=>assert.equal(actions.length,3));assert.notEqual(actions[1].payload.request_id,actions[2].payload.request_id,'Changing the payload requires a fresh request ID.');
});

test('duplicate slots, invalid numeric/text bounds, and oversized Unicode payloads never reach the write callback',async()=>{
  let saves=0;const onSave=async()=>{saves++;return false;};
  const view=render(<CourseSelectionManager records={[fixture]} profiles={profiles} busy={false} onSave={onSave}/>);
  const user=userEvent.setup();await startEdit();
  await user.selectOptions(screen.getByLabelText('Meeting 2 weekday'),'1');await user.selectOptions(screen.getByLabelText('Meeting 2 period'),'午');submit();await screen.findByText('Each weekday and period may appear only once in this record.');
  await user.click(screen.getByRole('button',{name:'Remove meeting 2',exact:true}));
  fireEvent.change(screen.getByLabelText(label.credits),{target:{value:'3.456'}});submit();await screen.findByText('Credits must be from 0 to 999.99 with at most two decimal places.');
  fireEvent.change(screen.getByLabelText(label.credits),{target:{value:'999.99'}});fireEvent.change(screen.getByLabelText(label.year),{target:{value:'10000'}});submit();assert.match(screen.getByRole('alert').textContent!,/academic year 1–9999/);
  fireEvent.change(screen.getByLabelText(label.year),{target:{value:'115'}});fireEvent.change(screen.getByLabelText(label.code),{target:{value:' '}});submit();assert.match(screen.getByRole('alert').textContent!,/course code and title/);assert.equal(saves,0);
  const oversized={...fixture,meetings:Array.from({length:7},(_,index)=>courseSelectionPeriods.map(period=>({weekday:index+1,period:period.key,room:'房'.repeat(80)}))).flat()};
  view.rerender(<CourseSelectionManager records={[oversized]} profiles={profiles} busy={false} onSave={onSave}/>);
  await startEdit();assert.equal((screen.getByRole('button',{name:'Add meeting slot',exact:true}) as HTMLButtonElement).disabled,true);
  submit();await screen.findByText('This record exceeds the storage size limit. Shorten text or meeting room labels before saving.');assert.equal(saves,0);
});

test('busy state disables editing and empty profiles do not offer an unusable create form',async()=>{
  let refreshes=0;
  const view=render(<CourseSelectionManager records={[fixture]} profiles={profiles} busy={true} onSave={async()=>true} onRefresh={()=>{refreshes++;}}/>);
  assert.equal((screen.getByRole('button',{name:'Edit course-selection record',exact:true}) as HTMLButtonElement).disabled,true);
  const refresh=screen.getByRole('button',{name:'Refresh course-selection records',exact:true});assert.equal((refresh as HTMLButtonElement).disabled,true);await userEvent.setup().click(refresh);assert.equal(refreshes,0);
  assert.equal((screen.getByRole('button',{name:'Save course-selection record',exact:true}).closest('fieldset') as HTMLFieldSetElement).disabled,true);
  view.rerender(<CourseSelectionManager records={[]} profiles={[]} busy={false} onSave={async()=>true}/>);
  assert.ok(screen.getByText('No account profiles are available.'));assert.equal(screen.queryByRole('button',{name:'Save course-selection record',exact:true}),null);
});
