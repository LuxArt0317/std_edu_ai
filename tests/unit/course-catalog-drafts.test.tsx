import assert from 'node:assert/strict';
import {after,afterEach,test} from 'node:test';
import {createRequire,registerHooks} from 'node:module';
import {newCourseOffering,type CourseOffering} from '../../src/features/public/affairs/courseCatalogModel.js';
import {newCourseSyllabus} from '../../src/features/public/affairs/courseSyllabusModel.js';

const {JSDOM}=createRequire(import.meta.url)('jsdom') as {JSDOM:new(html:string,options:object)=>{window:Window & typeof globalThis}};
const dom=new JSDOM('<!doctype html><html><body></body></html>',{url:'http://localhost',pretendToBeVisual:true});
for(const name of ['window','document','HTMLElement','HTMLInputElement','HTMLButtonElement','HTMLSelectElement','Node','Event','MouseEvent','MutationObserver','FormData','getComputedStyle'])Object.defineProperty(globalThis,name,{value:name==='window'?dom.window:name==='document'?dom.window.document:dom.window[name as keyof Window],configurable:true});
Object.defineProperty(globalThis,'navigator',{value:dom.window.navigator,configurable:true});
const owner='10000000-0000-4000-8000-000000000001';
const originalFetch=globalThis.fetch;
let transport:typeof fetch=async()=>{throw new Error('Unexpected offline request');};
globalThis.fetch=(...args)=>transport(...args);
const hook=registerHooks({load(url,context,next){
  if(url.endsWith('.css'))return {format:'module',source:'export {};',shortCircuit:true};
  if(/\/affairs\/authClient\.(?:ts|js)$/.test(url))return {format:'module',source:`export const affairsClient={auth:{getSession:async()=>({data:{session:{user:{id:'${owner}'},access_token:'synthetic-offline-only'}},error:null})}};`,shortCircuit:true};
  return next(url,context);
}});
const {default:CourseCatalog}=await import('../../src/features/public/affairs/CourseCatalog');
hook.deregister();
const {MemoryRouter}=await import('react-router');
const {render,cleanup,fireEvent,waitFor}=await import('@testing-library/react');
afterEach(cleanup);after(()=>{globalThis.fetch=originalFetch;dom.window.close();});

type Write={kind:string;payload:Record<string,unknown>};
async function fixture(failFirst=false){
  let row:CourseOffering={...newCourseOffering(),id:'20000000-0000-4000-8000-000000000001',version:1,
    course_name:'Saved synthetic title',course_code:'DEMO-DRAFT',program_codes:['A','B'],syllabus:newCourseSyllabus(),
    syllabus_is_current:false,academic_year_text:null,semester_text:''};
  const writes:Write[]=[];let reads=0;
  transport=async(input,init)=>{
    assert.equal(init?.headers&&new Headers(init.headers).get('Authorization'),'Bearer synthetic-offline-only');
    if(init?.method==='POST'){
      assert.equal(input,'/api/affairs-manage');const body=JSON.parse(String(init.body)) as Write;writes.push(body);
      if(failFirst&&writes.length===1)return Response.json({error:'Synthetic retry'}, {status:503});
      if(body.kind==='syllabus-metadata'){
        row={...row,syllabus_is_current:body.payload.syllabus_is_current as boolean|null,academic_year_text:body.payload.academic_year_text as string|null,semester_text:body.payload.semester_text as string|null,version:row.version+1};
        return Response.json({id:row.id,kind:'save_syllabus_search_metadata',version:row.version,summary:'Saved'});
      }
      assert.equal(body.kind,'save_course_offering');
      row={...body.payload.record as CourseOffering,version:row.version+1};return Response.json({id:row.id,version:row.version});
    }
    assert.ok(String(input).startsWith('/api/affairs-data?'));reads++;
    return Response.json({rows:[row],total:1,page:0,page_size:100,can_manage:true,terms:[]});
  };
  const view=render(<MemoryRouter><CourseCatalog userId={owner}/></MemoryRouter>);
  await waitFor(()=>assert.ok(view.getByText('管理本地範例課程')));
  const picker=()=>view.container.querySelector<HTMLSelectElement>('.catalog-manager > label select')!;
  const select=()=>fireEvent.change(picker(),{target:{value:row.id}});select();
  const legacyForm=()=>view.container.querySelector<HTMLFormElement>('.catalog-manager > form')!;
  const metadataForm=()=>view.container.querySelector<HTMLFormElement>('.syllabus-metadata-editor form')!;
  return {view,writes,picker,select,legacyForm,metadataForm,readCount:()=>reads,saved:()=>row};
}
const disabled=(element:HTMLElement)=>element.matches(':disabled');

test('dirty legacy title, syllabus or program codes block metadata writes until saved or reset',async()=>{
  const f=await fixture(),{view}=f;
  const metadataSave=()=>view.getByRole('button',{name:'儲存課綱查詢設定'});
  const courseName=()=>view.getByLabelText('課程名稱') as HTMLInputElement;
  fireEvent.change(courseName(),{target:{value:'Unsaved title'}});
  assert.equal(disabled(metadataSave()),true);assert.equal(disabled(view.getByLabelText('當期課綱歸屬')),true);
  fireEvent.submit(f.metadataForm());assert.equal(f.writes.length,0);assert.equal(courseName().value,'Unsaved title');
  fireEvent.click(view.getByRole('button',{name:'取消課程變更'}));assert.equal(courseName().value,'Saved synthetic title');assert.equal(disabled(metadataSave()),false);
  const programs=view.getByLabelText('學分學程代碼（逗號分隔）') as HTMLInputElement;
  fireEvent.change(programs,{target:{value:' A , B , '}});assert.equal(disabled(metadataSave()),false,'Whitespace-only program formatting is not a draft change.');
  fireEvent.change(programs,{target:{value:'A,C'}});assert.equal(disabled(metadataSave()),true);
  fireEvent.click(view.getByRole('button',{name:'取消課程變更'}));assert.equal(programs.value,'A,B');
  const week=view.getAllByLabelText('授課單元及內容')[0] as HTMLTextAreaElement;
  fireEvent.change(week,{target:{value:'Unsaved syllabus content'}});assert.equal(disabled(metadataSave()),true);
  fireEvent.click(view.getByRole('button',{name:'取消課程變更'}));assert.equal(week.value,'');assert.equal(disabled(metadataSave()),false);
  assert.equal(f.readCount(),1);assert.equal(f.writes.length,0);
});

test('dirty metadata blocks legacy edits, save, delete and selection; reset restores exact null/false/blank',async()=>{
  const f=await fixture(),{view}=f;
  fireEvent.change(view.getByLabelText('當期課綱歸屬'),{target:{value:'true'}});
  fireEvent.click(view.getByLabelText('學年顯示文字未提供'));
  fireEvent.change(view.getByLabelText('學年顯示文字'),{target:{value:'Unsaved literal year'}});
  assert.equal(disabled(view.getByLabelText('課程名稱')),true);assert.equal(disabled(view.getByRole('button',{name:'儲存課程'})),true);
  assert.equal(disabled(view.getByRole('button',{name:'確認刪除 DEMO-DRAFT'})),true);assert.equal(f.picker().disabled,true);
  fireEvent.submit(f.legacyForm());assert.equal(f.writes.length,0);
  fireEvent.click(view.getByRole('button',{name:'取消查詢設定變更'}));
  assert.equal((view.getByLabelText('當期課綱歸屬') as HTMLSelectElement).value,'false');
  assert.equal((view.getByLabelText('學年顯示文字未提供') as HTMLInputElement).checked,true);
  assert.equal((view.getByLabelText('學期顯示文字未提供') as HTMLInputElement).checked,false);
  assert.equal((view.getByLabelText('學期顯示文字') as HTMLInputElement).value,'');
  assert.equal(disabled(view.getByRole('button',{name:'儲存課程'})),false);assert.equal(f.picker().disabled,false);
  fireEvent.submit(f.legacyForm());await waitFor(()=>assert.equal(f.readCount(),2));
  assert.equal(f.writes.length,1);assert.equal(f.saved().syllabus_is_current,false);assert.equal(f.saved().academic_year_text,null);assert.equal(f.saved().semester_text,'');
});

test('metadata failure keeps the sibling locked and identical retry retains its request and version',async()=>{
  const f=await fixture(true),{view}=f;
  fireEvent.change(view.getByLabelText('當期課綱歸屬'),{target:{value:'true'}});
  fireEvent.click(view.getByRole('button',{name:'儲存課綱查詢設定'}));await waitFor(()=>assert.equal(f.writes.length,1));
  await waitFor(()=>assert.ok(view.getByRole('alert')));assert.equal(disabled(view.getByRole('button',{name:'儲存課程'})),true);
  assert.equal(f.readCount(),1);fireEvent.click(view.getByRole('button',{name:'儲存課綱查詢設定'}));
  await waitFor(()=>assert.equal(f.readCount(),2));assert.deepEqual(f.writes[0],f.writes[1]);
  assert.equal(f.writes[1].payload.expected_version,1);assert.equal(f.saved().course_name,'Saved synthetic title');
  await waitFor(()=>assert.ok(view.getByText('管理本地範例課程')));f.select();
  assert.equal((view.getByLabelText('當期課綱歸屬') as HTMLSelectElement).value,'true');
  assert.equal(disabled(view.getByRole('button',{name:'儲存課程'})),false);
});

test('legacy failed save retains the course draft and receipt while metadata remains blocked',async()=>{
  const f=await fixture(true),{view}=f;
  fireEvent.change(view.getByLabelText('課程名稱'),{target:{value:'New saved title'}});
  fireEvent.submit(f.legacyForm());await waitFor(()=>assert.ok(view.getByText('Synthetic retry')));
  assert.equal(disabled(view.getByRole('button',{name:'儲存課綱查詢設定'})),true);
  assert.equal((view.getByLabelText('課程名稱') as HTMLInputElement).value,'New saved title');
  fireEvent.submit(f.legacyForm());await waitFor(()=>assert.equal(f.readCount(),2));
  assert.deepEqual(f.writes[0],f.writes[1]);assert.equal(f.saved().course_name,'New saved title');assert.equal(f.saved().syllabus_is_current,false);
});
