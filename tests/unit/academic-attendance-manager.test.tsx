import React from 'react';
import assert from 'node:assert/strict';
import {afterEach,test} from 'node:test';
import {JSDOM} from 'jsdom';
import type {AcademicAttendanceRecords,AcademicAttendanceStatistic,AcademicAttendanceDetail,AcademicAttendanceMetadata} from '../../src/services/academicAttendance';
import type {AcademicAttendanceSaveAction} from '../../src/features/public/affairs/AcademicAttendanceManager';
import {validateAcademicAttendancePayload} from '../../server/academicAttendance.js';

const dom=new JSDOM('<!doctype html><html><body></body></html>',{url:'http://localhost',pretendToBeVisual:true});
for(const name of ['window','document','HTMLElement','HTMLInputElement','HTMLButtonElement','HTMLSelectElement','Node','Event','MouseEvent','MutationObserver','getComputedStyle','FormData'])
  Object.defineProperty(globalThis,name,{value:name==='window'?dom.window:name==='document'?dom.window.document:dom.window[name as keyof Window],configurable:true});
Object.defineProperty(globalThis,'navigator',{value:dom.window.navigator,configurable:true});
const {render,screen,cleanup,fireEvent,waitFor}=await import('@testing-library/react');
const {default:userEvent}=await import('@testing-library/user-event');
const {AcademicAttendanceManager}=await import('../../src/features/public/affairs/AcademicAttendanceManager');
afterEach(cleanup);
const owner='10000000-0000-4000-8000-000000000001',other='10000000-0000-4000-8000-000000000002';
const profiles=[{user_id:owner,display_name:'Same Synthetic Name',email:'first@example.invalid'},{user_id:other,display_name:'Same Synthetic Name',email:'second@example.invalid'}];
const common={userId:owner,sourceMode:'local_demo' as const,version:2,createdAt:'2026-11-13T00:00:00Z',updatedAt:'2026-11-13T00:00:00Z'};
const term={academicYear:115,semester:1 as const,rowOrder:2,courseCode:'LOCAL-ATTEND-001',courseTitle:'Synthetic attendance course'};
const statistic:AcademicAttendanceStatistic={...common,...term,id:'20000000-0000-4000-8000-000000000001',studentNumber:null,studentName:null,
  totalTeachingHours:54,currentTeachingWeeks:7.5,currentTeachingHours:22.5,absenceHours:0,unexcusedAbsenceHours:null};
const detail:AcademicAttendanceDetail={...common,...term,id:'20000000-0000-4000-8000-000000000002',teacherName:'',absenceTypeText:'Literal synthetic category',
  courseDate:'2026-11-13',periodText:'A–B',rollCalledAt:'2026-11-13T08:30:00.123456+08:00'};
const metadata:AcademicAttendanceMetadata={...common,id:'20000000-0000-4000-8000-000000000003',currentAcademicYear:115,currentSemester:1};
const empty:AcademicAttendanceRecords={statistics:[],details:[],metadata:[]};
const labels={type:'Record type',account:'Student account',year:'Academic year · 學年',semester:'Semester · 學期 (1–3)',code:'Course code · 課號',title:'Course name · 課程名稱',
  absent:'Absence hours · 目前缺課時數',unexcused:'Unexcused absence hours · 目前曠課時數',teacher:'Teacher · 授課老師',date:'Class date · 課程日期',stamp:'Roll-call time · ISO date with UTC offset',
  currentYear:'Current academic year · 當學年',currentSemester:'Current semester · 當學期 (1–3)'};
const get=(label:string)=>screen.getByLabelText(label) as HTMLInputElement;
const change=(label:string,value:string)=>fireEvent.change(get(label),{target:{value}});
const submit=()=>fireEvent.submit(screen.getByRole('button',{name:'Save attendance record',exact:true}).closest('form')!);
async function open(){await userEvent.setup().click(screen.getByText('Academic attendance · 缺曠課紀錄管理',{selector:'summary'}));}
async function selectKind(kind:string){await userEvent.setup().selectOptions(get(labels.type),kind);}
async function edit(){await userEvent.setup().click(screen.getByRole('button',{name:'Edit attendance record',exact:true}));}
function fillCourse(){change(labels.account,owner);change(labels.year,'115');change(labels.semester,'1');change(labels.code,'LOCAL-NEW');change(labels.title,'Synthetic new course');}

test('manager creates all three approved operations with explicit null/zero fields and exact zoned microseconds',async()=>{
  const actions:AcademicAttendanceSaveAction[]=[];
  render(<AcademicAttendanceManager records={empty} profiles={profiles} busy={false} onSave={async action=>{actions.push(structuredClone(action));return true;}}/>);await open();
  assert.ok(screen.getByRole('option',{name:'Same Synthetic Name · first@example.invalid',exact:true}));assert.ok(screen.getByRole('option',{name:'Same Synthetic Name · second@example.invalid',exact:true}));
  fillCourse();change(labels.absent,'0');submit();await screen.findByText('Attendance record saved.');
  assert.equal(actions[0].kind,'save_academic_attendance_statistic');assert.equal(actions[0].payload.absence_hours,0);assert.equal(actions[0].payload.unexcused_absence_hours,null);
  assert.equal(actions[0].payload.total_teaching_hours,null);assert.equal(actions[0].payload.row_order,0);assert.equal(actions[0].payload.expected_version,0);
  await selectKind('save_academic_attendance_detail');fillCourse();change(labels.date,'2026-11-13');change(labels.stamp,detail.rollCalledAt!);submit();await screen.findByText('Attendance record saved.');
  assert.equal(actions[1].kind,'save_academic_attendance_detail');assert.equal(actions[1].payload.course_date,'2026-11-13');assert.equal(actions[1].payload.roll_called_at,detail.rollCalledAt);
  assert.equal(actions[1].payload.teacher_name,null);assert.equal(actions[1].payload.absence_type_text,null);
  await selectKind('save_academic_attendance_metadata');change(labels.account,owner);change(labels.currentYear,'115');change(labels.currentSemester,'1');submit();await screen.findByText('Attendance record saved.');
  assert.equal(actions[2].kind,'save_academic_attendance_metadata');assert.equal(actions[2].payload.current_academic_year,115);assert.equal(actions[2].payload.current_semester,1);
  assert.equal('row_order'in actions[2].payload,false);
  for(const action of actions){assert.equal(validateAcademicAttendancePayload(action.kind,action.payload),null);assert.match(String(action.payload.id),/^[0-9a-f-]{36}$/);assert.match(String(action.payload.request_id),/^[0-9a-f-]{36}$/);}
  assert.equal(new Set(actions.map(action=>action.payload.request_id)).size,3);
});
test('editing preserves owner/version and retry IDs across rejected, thrown and in-flight requests',async()=>{
  const actions:AcademicAttendanceSaveAction[]=[];let release:(value:boolean)=>void=()=>{};
  render(<AcademicAttendanceManager records={{...empty,statistics:[statistic]}} profiles={profiles} busy={false} onSave={async action=>{
    actions.push(structuredClone(action));if(actions.length===1)return false;if(actions.length===2)throw new Error('Synthetic transport failure');return new Promise(resolve=>{release=resolve;});
  }}/>);await open();await edit();
  assert.equal(get(labels.account).disabled,true);assert.equal(get(labels.type).disabled,true);
  change(labels.account,other);change(labels.absent,'');change(labels.unexcused,'0');submit();await screen.findByText('The record was not saved. Retry, or refresh to check for a newer version.');
  submit();await screen.findByText('Synthetic transport failure');submit();await waitFor(()=>assert.equal(actions.length,3));submit();assert.equal(actions.length,3);
  assert.equal(get(labels.title).disabled,true);assert.equal((screen.getByRole('button',{name:'Save attendance record',exact:true}) as HTMLButtonElement).disabled,true);
  assert.equal(new Set(actions.map(action=>action.payload.request_id)).size,1);
  for(const action of actions){assert.equal(action.payload.user_id,owner);assert.equal(action.payload.id,statistic.id);assert.equal(action.payload.expected_version,2);assert.equal(action.payload.absence_hours,null);assert.equal(action.payload.unexcused_absence_hours,0);}
  release(true);await screen.findByText('Attendance record saved.');assert.equal(get(labels.account).disabled,false);
});
test('metadata cannot save a partial current term and explicitly clears both fields to null',async()=>{
  const actions:AcademicAttendanceSaveAction[]=[];
  render(<AcademicAttendanceManager records={{...empty,metadata:[metadata]}} profiles={profiles} busy={false} onSave={async action=>{actions.push(action);return false;}}/>);await open();
  await selectKind('save_academic_attendance_metadata');await edit();change(labels.currentYear,'');submit();
  await screen.findByText('Current academic year and semester must both be valid, or both null.');assert.equal(actions.length,0);
  change(labels.currentSemester,'');submit();await waitFor(()=>assert.equal(actions.length,1));
  assert.equal(actions[0].payload.current_academic_year,null);assert.equal(actions[0].payload.current_semester,null);assert.equal(actions[0].payload.expected_version,2);assert.equal(actions[0].payload.user_id,owner);
});
test('duplicate statistics/current metadata block new writes and stale refresh cannot silently replace drafts',async()=>{
  const actions:AcademicAttendanceSaveAction[]=[];let confirmations=0;
  Object.defineProperty(window,'confirm',{value:()=>{confirmations++;return true;},configurable:true});
  const onSave=async(action:AcademicAttendanceSaveAction)=>{actions.push(action);return false;};
  const onRefresh=async()=>{throw new Error('Synthetic refresh failure');};
  const view=render(<AcademicAttendanceManager records={{statistics:[statistic],details:[],metadata:[metadata]}} profiles={profiles} busy={false} onSave={onSave} onRefresh={onRefresh}/>);await open();
  fillCourse();change(labels.code,statistic.courseCode);assert.ok(screen.getByText('A matching record already exists. Open it before changing it.'));submit();assert.equal(actions.length,0);
  await userEvent.setup().click(screen.getByRole('button',{name:'Load saved record',exact:true}));assert.equal(confirmations,1);assert.equal(get(labels.title).value,statistic.courseTitle);
  change(labels.title,'Unsaved local draft');submit();await waitFor(()=>assert.equal(actions.length,1));
  const fresh={...statistic,version:3,courseTitle:'Other administrator saved title'};
  view.rerender(<AcademicAttendanceManager records={{...empty,statistics:[fresh],metadata:[metadata]}} profiles={profiles} busy={false} onSave={onSave} onRefresh={onRefresh}/>);
  assert.equal(get(labels.title).value,'Unsaved local draft');assert.ok(screen.getByText('This record changed or was removed. Refresh before saving.'));submit();assert.equal(actions.length,1);
  await userEvent.setup().click(screen.getByRole('button',{name:'Refresh records',exact:true}));await screen.findByText('Refresh failed. Your draft is unchanged.');assert.equal(get(labels.title).value,'Unsaved local draft');
  await userEvent.setup().click(screen.getByRole('button',{name:'Load saved record',exact:true}));assert.equal(get(labels.title).value,fresh.courseTitle);submit();await waitFor(()=>assert.equal(actions.length,2));
  assert.equal(actions[1].payload.expected_version,3);assert.notEqual(actions[0].payload.request_id,actions[1].payload.request_id);
  await userEvent.setup().click(screen.getByRole('button',{name:'Clear form',exact:true}));await selectKind('save_academic_attendance_metadata');change(labels.account,owner);
  assert.ok(screen.getByText('A matching record already exists. Open it before changing it.'));submit();assert.equal(actions.length,2);
});
test('detail edits preserve exact microseconds and untouched empty text, while explicit clearing yields null',async()=>{
  const actions:AcademicAttendanceSaveAction[]=[];
  render(<AcademicAttendanceManager records={{...empty,details:[detail]}} profiles={profiles} busy={false} onSave={async action=>{actions.push(action);return false;}}/>);await open();await selectKind('save_academic_attendance_detail');await edit();
  assert.equal(get(labels.stamp).value,detail.rollCalledAt);submit();await waitFor(()=>assert.equal(actions.length,1));
  assert.equal(actions[0].payload.roll_called_at,'2026-11-13T08:30:00.123456+08:00');assert.equal(actions[0].payload.teacher_name,'');
  change(labels.teacher,'Temporary draft');change(labels.teacher,'');change(labels.date,'');change(labels.stamp,'');submit();await waitFor(()=>assert.equal(actions.length,2));
  assert.equal(actions[1].payload.teacher_name,null);assert.equal(actions[1].payload.course_date,null);assert.equal(actions[1].payload.roll_called_at,null);
  assert.notEqual(actions[0].payload.request_id,actions[1].payload.request_id);
  change(labels.stamp,'2026-02-29T00:00:00Z');submit();await screen.findByText('Roll-call time must be null or an actual zoned ISO timestamp.');assert.equal(actions.length,2);
});
test('numeric precision failures, removed records and busy/empty-profile states cannot trigger writes',async()=>{
  let calls=0;const onSave=async()=>{calls++;return true;};
  const view=render(<AcademicAttendanceManager records={{...empty,statistics:[statistic]}} profiles={profiles} busy={false} onSave={onSave}/>);await open();await edit();
  change(labels.absent,'0.001');submit();await screen.findByText('Invalid attendance numeric field: absence_hours; use null or 0..9999.99 with at most two decimals.');assert.equal(calls,0);
  view.rerender(<AcademicAttendanceManager records={empty} profiles={profiles} busy={false} onSave={onSave}/>);submit();assert.equal(calls,0);assert.ok(screen.getByText('This record changed or was removed. Refresh before saving.'));
  await userEvent.setup().click(screen.getByRole('button',{name:'Clear form',exact:true}));
  view.rerender(<AcademicAttendanceManager records={empty} profiles={profiles} busy={true} onSave={onSave}/>);assert.equal(get(labels.account).disabled,true);submit();assert.equal(calls,0);
  view.rerender(<AcademicAttendanceManager records={empty} profiles={[]} busy={false} onSave={onSave}/>);assert.ok(screen.getByText('No account profiles are available.'));assert.equal(screen.queryByRole('button',{name:'Save attendance record',exact:true}),null);
});
