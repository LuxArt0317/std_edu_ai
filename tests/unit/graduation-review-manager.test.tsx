import React from 'react';
import assert from 'node:assert/strict';
import {afterEach,test} from 'node:test';
import type {GraduationReviewContent,GraduationReviewRecords,GraduationReviewReport} from '../../src/services/graduationReview';
import type {GraduationReviewSaveAction} from '../../src/features/public/affairs/GraduationReviewManager';
import {validateGraduationReviewContent} from '../../server/graduationReview.js';

// The repository runs DOM suites through tsx; jsdom has no installed declaration package.
const jsdomPackage='jsdom';const {JSDOM}=await import(jsdomPackage);
const dom=new JSDOM('<!doctype html><html><body></body></html>',{url:'http://localhost',pretendToBeVisual:true});
for(const name of ['window','document','HTMLElement','HTMLInputElement','HTMLButtonElement','HTMLSelectElement','Node','Event','MouseEvent','MutationObserver','getComputedStyle','FormData'])
  Object.defineProperty(globalThis,name,{value:name==='window'?dom.window:name==='document'?dom.window.document:dom.window[name as keyof Window],configurable:true});
Object.defineProperty(globalThis,'navigator',{value:dom.window.navigator,configurable:true});
const {render,screen,within,cleanup,fireEvent,waitFor}=await import('@testing-library/react');
const {default:userEvent}=await import('@testing-library/user-event');
const {GraduationReviewManager}=await import('../../src/features/public/affairs/GraduationReviewManager');
afterEach(cleanup);
const owner='10000000-0000-4000-8000-000000000001',other='10000000-0000-4000-8000-000000000002';
const profiles=[{user_id:owner,display_name:'Same Synthetic Name',email:'first@example.invalid'},{user_id:other,display_name:'Same Synthetic Name',email:'second@example.invalid'}];
const content:GraduationReviewContent={reportedAt:'2026-11-13T08:30:00.123456+08:00',
  identity:{studentNumber:null,studentName:' Synthetic Student ',departmentName:'',yearText:null,enrollmentStatusText:null,curriculumCohortText:null,doubleMajorText:null,minorText:null},
  educationProgram:{text:' ',indicator:null},foreignLanguageCompletion:{text:null,indicator:'attention'},englishRequirement:{text:'',indicator:null},
  graduationReview:{text:' Explicit reference only ',indicator:'attention',note:' Untrimmed note '},
  languageRequirements:[{id:'language-one',label:'Synthetic language',status:{text:' ',indicator:null},requiredCredits:8,matchedCredits:0,missingCredits:null}],
  categories:[{id:'category-one',label:'Synthetic category',requiredElectiveText:'',requiredCredits:99,completedCredits:3.5,matchedCredits:0,excludedCredits:null,
    status:{text:null,indicator:'passed'},detailSubtotalCredits:7.25,requirements:[{id:'requirement-one',sequenceText:' 1 ',title:' Synthetic required course ',moduleText:'',credits:0,
      requiredElectiveText:null,yearText:null,transferText:null,indicator:null,matchedCourses:[{id:'matched-one',sequenceText:null,title:' Synthetic actual course ',credits:null,requiredElectiveText:null,yearText:'',transferText:null}]}]}],
  otherCourses:[{id:'other-one',sequenceText:null,title:' Other synthetic course ',credits:0,requiredElectiveText:'',yearText:null,transferText:null}],
};
const modern:GraduationReviewReport={...content,id:'20000000-0000-4000-8000-000000000001',userId:owner,reportKind:'academic_services',sourceMode:'local_demo',version:2,createdAt:'2026-11-13T00:00:00Z',updatedAt:'2026-11-13T00:00:00Z'};
const legacy:GraduationReviewReport={...modern,id:'20000000-0000-4000-8000-000000000002',reportKind:'legacy',version:4,graduationReview:{...content.graduationReview,text:'Distinct legacy reference'}};
const empty:GraduationReviewRecords={reports:[]};
const label={account:'Graduation report account',kind:'Graduation report kind',stamp:'Reported at (UTC) · 報表時間',name:'Student name · 姓名',note:'Graduation review note · 審核備註',review:'Graduation review · 畢業審核 text'};
const get=(name:string)=>screen.getByLabelText(name) as HTMLInputElement;
const change=(name:string,value:string)=>fireEvent.change(get(name),{target:{value}});
const submit=()=>fireEvent.submit(screen.getByRole('button',{name:/^(?:Save graduation report|Saving graduation report…)$/}).closest('form')!);
async function edit(kind:'academic_services'|'legacy'='academic_services'){
  const item=screen.getAllByRole('listitem').find(row=>row.textContent?.includes(kind==='legacy'?'Legacy graduation check · 15-2':'Academic Services · 13-1'))!;
  await userEvent.setup().click(within(item).getByRole('button',{name:'Edit graduation report'}));
}
const reportOf=(action:GraduationReviewSaveAction)=>action.payload.report as GraduationReviewContent;

test('new reports select a required source kind and only collide with the same owner and kind',async()=>{
  const actions:GraduationReviewSaveAction[]=[];
  const foreignLegacy={...legacy,id:'foreign-legacy',userId:other};
  render(<GraduationReviewManager records={{reports:[modern,foreignLegacy]}} profiles={profiles} busy={false} onSave={async action=>{actions.push(structuredClone(action));return true;}}/>);
  assert.equal(get(label.kind).value,'academic_services');
  assert.ok(screen.getByRole('option',{name:'Same Synthetic Name (first@example.invalid)'}));assert.ok(screen.getByRole('option',{name:'Same Synthetic Name (second@example.invalid)'}));
  change(label.account,owner);assert.ok(screen.getByText('A report of this kind already exists for this account. Load it explicitly to edit.'));submit();assert.equal(actions.length,0);
  change(label.kind,'legacy');assert.equal(screen.queryByText('A report of this kind already exists for this account. Load it explicitly to edit.'),null);
  submit();await screen.findByText('Local graduation review report saved.');assert.equal(actions.length,1);
  assert.equal(actions[0].kind,'save_graduation_review');assert.equal(actions[0].payload.user_id,owner);assert.equal(actions[0].payload.report_kind,'legacy');assert.equal(actions[0].payload.expected_version,'0');
  assert.equal(validateGraduationReviewContent(reportOf(actions[0])),null);assert.match(String(actions[0].payload.id),/^[0-9a-f-]{36}$/);
  assert.equal('reportKind'in reportOf(actions[0]),false,'Source kind belongs in the immutable operation envelope, not report JSON.');
  change(label.account,other);assert.equal(get(label.kind).value,'academic_services');submit();await waitFor(()=>assert.equal(actions.length,2));assert.equal(actions[1].payload.report_kind,'academic_services');
  assert.notEqual(actions[0].payload.request_id,actions[1].payload.request_id);
});

test('same-owner modern and legacy edits preserve immutable owner/kind, versions, literal text and untouched microseconds',async()=>{
  const actions:GraduationReviewSaveAction[]=[];
  render(<GraduationReviewManager records={{reports:[modern,legacy]}} profiles={profiles} busy={false} onSave={async action=>{actions.push(structuredClone(action));return false;}}/>);
  await edit('legacy');assert.equal(get(label.account).disabled,true);assert.equal(get(label.kind).disabled,true);
  assert.equal(get(label.stamp).value,'2026-11-13T00:30:00.123','The editing control displays UTC milliseconds without mutating the stored timestamp.');
  change(label.account,other);change(label.kind,'academic_services');submit();await waitFor(()=>assert.equal(actions.length,1));
  assert.equal(actions[0].payload.user_id,owner);assert.equal(actions[0].payload.report_kind,'legacy');assert.equal(actions[0].payload.id,legacy.id);assert.equal(actions[0].payload.expected_version,'4');
  assert.equal(reportOf(actions[0]).reportedAt,legacy.reportedAt);assert.deepEqual(reportOf(actions[0]),{...content,graduationReview:legacy.graduationReview});
  await userEvent.setup().click(screen.getByRole('button',{name:'Cancel graduation report edit'}));await edit();
  change(label.note,'Changed only this note');submit();await waitFor(()=>assert.equal(actions.length,2));
  assert.equal(actions[1].payload.report_kind,'academic_services');assert.equal(actions[1].payload.expected_version,'2');
  const saved=reportOf(actions[1]);assert.deepEqual(saved,{...content,graduationReview:{...content.graduationReview,note:'Changed only this note'}});
  assert.equal(saved.identity.departmentName,'');assert.equal(saved.identity.studentName,' Synthetic Student ');assert.equal(saved.educationProgram.text,' ');
  assert.equal(saved.categories[0].matchedCredits,0);assert.equal(saved.categories[0].excludedCredits,null);assert.equal(saved.categories[0].detailSubtotalCredits,7.25);
  assert.equal(saved.categories[0].requirements[0].matchedCourses[0].credits,null);assert.equal(saved.otherCourses[0].credits,0);
});

test('unchanged retries keep one request ID after rejection/throw and suppress duplicate in-flight writes',async()=>{
  const actions:GraduationReviewSaveAction[]=[];let release:(value:boolean)=>void=()=>{};
  render(<GraduationReviewManager records={{reports:[legacy]}} profiles={profiles} busy={false} onSave={async action=>{
    actions.push(structuredClone(action));if(actions.length===1)return false;if(actions.length===2)throw new Error('Synthetic transport failure');return new Promise(resolve=>{release=resolve;});
  }}/>);await edit('legacy');submit();await screen.findByText('The report was not saved. Your draft is retained. Retry, or refresh and load the latest saved report if it changed.');
  submit();await screen.findByText('Synthetic transport failure');submit();await screen.findByRole('button',{name:'Saving graduation report…'});
  submit();assert.equal(actions.length,3);assert.equal(new Set(actions.map(action=>action.payload.request_id)).size,1);
  assert.equal((get(label.name).closest('fieldset') as HTMLFieldSetElement).disabled,true);
  for(const action of actions){assert.equal(action.payload.report_kind,'legacy');assert.equal(action.payload.expected_version,'4');assert.equal(action.payload.user_id,owner);}
  release(true);await screen.findByText('Local graduation review report saved.');assert.equal(get(label.kind).value,'academic_services');
});

test('explicit numeric/null changes and full value clearing preserve the edited kind and entity',async()=>{
  const actions:GraduationReviewSaveAction[]=[];
  render(<GraduationReviewManager records={{reports:[legacy]}} profiles={profiles} busy={false} onSave={async action=>{actions.push(structuredClone(action));return false;}}/>);await edit('legacy');
  await userEvent.setup().click(screen.getByText('Language 1: Synthetic language',{selector:'summary'}));await screen.findByLabelText('Language 1 matched credits');
  change('Language 1 matched credits','');change('Language 1 missing credits','0');change(label.stamp,'');submit();await waitFor(()=>assert.equal(actions.length,1));
  assert.equal(reportOf(actions[0]).languageRequirements[0].matchedCredits,null);assert.equal(reportOf(actions[0]).languageRequirements[0].missingCredits,0);assert.equal(reportOf(actions[0]).reportedAt,null);
  await userEvent.setup().click(screen.getByRole('button',{name:'Clear report values'}));assert.equal(get(label.kind).value,'legacy');assert.equal(get(label.account).value,owner);
  submit();await waitFor(()=>assert.equal(actions.length,2));const cleared=reportOf(actions[1]);
  assert.equal(actions[1].payload.id,legacy.id);assert.equal(actions[1].payload.report_kind,'legacy');assert.equal(actions[1].payload.expected_version,'4');
  assert.equal(cleared.reportedAt,null);assert.deepEqual(cleared.languageRequirements,[]);assert.deepEqual(cleared.categories,[]);assert.deepEqual(cleared.otherCourses,[]);
  assert.equal(cleared.graduationReview.text,null);assert.equal(cleared.graduationReview.indicator,null);assert.equal(cleared.graduationReview.note,null);
  assert.notEqual(actions[0].payload.request_id,actions[1].payload.request_id);assert.equal(validateGraduationReviewContent(cleared),null);
});

test('dirty refresh retains drafts; changed or removed records block writes until explicit latest-version loading',async()=>{
  const actions:GraduationReviewSaveAction[]=[];let refreshes=0,failRefresh=false;
  const onSave=async(action:GraduationReviewSaveAction)=>{actions.push(structuredClone(action));return false;};
  const onRefresh=async()=>{refreshes++;if(failRefresh)throw new Error('Synthetic refresh failure');};
  const view=render(<GraduationReviewManager records={{reports:[modern,legacy]}} profiles={profiles} busy={false} onSave={onSave} onRefresh={onRefresh}/>);
  await edit('legacy');change(label.note,'Unsaved legacy draft');submit();await waitFor(()=>assert.equal(actions.length,1));
  await userEvent.setup().click(screen.getByRole('button',{name:'Refresh graduation reports'}));await screen.findByText('Saved reports refreshed. Your draft is retained; load the latest report explicitly to replace it.');
  assert.equal(refreshes,1);assert.equal(get(label.note).value,'Unsaved legacy draft');
  const fresh={...legacy,version:5,graduationReview:{...legacy.graduationReview,note:'Other admin saved note'}};
  view.rerender(<GraduationReviewManager records={{reports:[modern,fresh]}} profiles={profiles} busy={false} onSave={onSave} onRefresh={onRefresh}/>);
  assert.ok(screen.getByText('This report changed or was removed. Refresh before saving; your draft has not been replaced.'));
  assert.equal(get(label.note).value,'Unsaved legacy draft');assert.equal((screen.getByRole('button',{name:'Save graduation report'}) as HTMLButtonElement).disabled,true);submit();assert.equal(actions.length,1);
  failRefresh=true;await userEvent.setup().click(screen.getByRole('button',{name:'Refresh graduation reports'}));await screen.findByText('Synthetic refresh failure');assert.equal(get(label.note).value,'Unsaved legacy draft');
  await userEvent.setup().click(screen.getByRole('button',{name:'Load latest graduation report'}));assert.equal(get(label.note).value,'Other admin saved note');assert.equal(get(label.kind).value,'legacy');
  submit();await waitFor(()=>assert.equal(actions.length,2));assert.equal(actions[1].payload.expected_version,'5');assert.notEqual(actions[0].payload.request_id,actions[1].payload.request_id);
  view.rerender(<GraduationReviewManager records={{reports:[modern]}} profiles={profiles} busy={false} onSave={onSave} onRefresh={onRefresh}/>);
  assert.ok(screen.getByText('This report changed or was removed. Refresh before saving; your draft has not been replaced.'));assert.equal(screen.queryByRole('button',{name:'Load latest graduation report'}),null);
  submit();assert.equal(actions.length,2);assert.equal(get(label.kind).value,'legacy');
});

test('invalid numeric precision, busy state and empty account lists prevent writes without losing kind scope',async()=>{
  let writes=0;const onSave=async()=>{writes++;return true;};
  const view=render(<GraduationReviewManager records={{reports:[modern]}} profiles={profiles} busy={false} onSave={onSave}/>);await edit();
  await userEvent.setup().click(screen.getByText('Language 1: Synthetic language',{selector:'summary'}));await screen.findByLabelText('Language 1 matched credits');
  change('Language 1 matched credits','0.001');submit();await screen.findByText('Credit fields must be blank or from 0 to 1000 with at most two decimal places.');assert.equal(writes,0);
  view.rerender(<GraduationReviewManager records={{reports:[modern]}} profiles={profiles} busy={true} onSave={onSave}/>);submit();assert.equal(writes,0);
  assert.equal((get(label.name).closest('fieldset') as HTMLFieldSetElement).disabled,true);
  view.rerender(<GraduationReviewManager records={{reports:[modern]}} profiles={profiles} busy={false} onSave={onSave}/>);await userEvent.setup().click(screen.getByRole('button',{name:'Cancel graduation report edit'}));
  view.rerender(<GraduationReviewManager records={empty} profiles={[]} busy={false} onSave={onSave}/>);assert.ok(screen.getByText('No account profiles are available.'));assert.equal(screen.queryByRole('button',{name:'Save graduation report'}),null);
});
