import assert from 'node:assert/strict';
import {afterEach,test} from 'node:test';
import {createRequire,registerHooks} from 'node:module';
import {renderToStaticMarkup} from 'react-dom/server';
import {MemoryRouter} from 'react-router';
import {enrollmentCertificateColumns,enrollmentCertificatePath,enrollmentCertificateSourceNotes,enrollmentCertificateTimestamp,ownEnrollmentCertificate,verifiedEnrollmentCertificateDocument,
  type EnrollmentCertificateAssessment,type EnrollmentCertificateLocalDocument,type EnrollmentCertificateSnapshot,type EnrollmentCertificateDocumentRequest} from '../../src/services/enrollmentCertificate';

// jsdom is the existing test runtime; keep its small DOM surface typed locally
// without adding a project dependency for this unmounted draft.
const {JSDOM}=createRequire(import.meta.url)('jsdom') as {JSDOM:new(html:string,options?:{url?:string;pretendToBeVisual?:boolean})=>{window:Window & typeof globalThis}};

const cssHook=registerHooks({load(url,context,nextLoad){return url.endsWith('/enrollmentCertificate.css')?{format:'module',source:'export {};',shortCircuit:true}:nextLoad(url,context);}});
const {EnrollmentCertificate,EnrollmentCertificateWorkspace}=await import('../../src/features/public/affairs/EnrollmentCertificate');
cssHook.deregister();
const dom=new JSDOM('<!doctype html><html><body></body></html>',{url:'http://localhost',pretendToBeVisual:true});
for(const name of ['window','document','HTMLElement','HTMLButtonElement','Node','Event','MouseEvent','MutationObserver','getComputedStyle'])
  Object.defineProperty(globalThis,name,{value:name==='window'?dom.window:name==='document'?dom.window.document:dom.window[name as keyof Window],configurable:true});
Object.defineProperty(globalThis,'navigator',{value:dom.window.navigator,configurable:true});
Object.defineProperty(globalThis,'IS_REACT_ACT_ENVIRONMENT',{value:true,configurable:true,writable:true});
const {render,cleanup,fireEvent,waitFor,act}=await import('@testing-library/react');
afterEach(cleanup);
const owner='synthetic-owner',other='synthetic-other';
const assessment:EnrollmentCertificateAssessment={id:'assessment',userId:owner,sourceMode:'local_demo',version:2,createdAt:'2020-01-01T00:00:00Z',updatedAt:'2020-01-02T00:00:00Z',
  academicYear:130,semester:null,hasPendingFees:'Y',status:'blocked',resultText:'合成條件尚未完成',assessedAt:null,
  identity:{studentNumber:'QA-CERT',studentName:'合成測試生',departmentName:'測試系',yearText:'四',classLabel:'測試班'}};
const localDocument:EnrollmentCertificateLocalDocument={id:'local-file',userId:owner,assessmentId:assessment.id,assessmentVersion:2,issuer:'stu.best',purpose:'local_enrollment_reference',sourceMode:'local_demo',status:'available',verifiedAt:'2020-01-03T00:00:00Z',expiresAt:'2099-01-01T00:00:00Z'};
const snapshot:EnrollmentCertificateSnapshot={profile:{userId:owner},checkedAt:'2030-01-01T00:00:00Z',enrollmentCertificate:{assessments:[assessment],documents:[]}};
const noop=()=>{};
const markup=(value:EnrollmentCertificateSnapshot|null=snapshot,props={})=>renderToStaticMarkup(<MemoryRouter><EnrollmentCertificate snapshot={value} busy={false} onReload={noop} onLogout={noop} {...props}/></MemoryRouter>);
const eligible=():EnrollmentCertificateSnapshot=>({...snapshot,enrollmentCertificate:{assessments:[{...assessment,status:'local_eligible',hasPendingFees:'N',resultText:null}],documents:[localDocument]}});

test('selection requires one explicitly owned assessment, never a latest, inherited or other-account fallback',()=>{
  assert.equal(ownEnrollmentCertificate(snapshot.enrollmentCertificate,owner).assessment,assessment);
  for(const userId of ['', ' ',other])assert.equal(ownEnrollmentCertificate(snapshot.enrollmentCertificate,userId).assessment,null);
  const inherited=Object.assign(Object.create({userId:owner}),assessment);delete inherited.userId;
  const foreign={...assessment,userId:other,identity:{...assessment.identity,studentName:'FOREIGN PRIVATE'}};
  const bundle={assessments:[inherited,foreign],documents:[]};assert.equal(ownEnrollmentCertificate(bundle,owner).assessment,null);
  assert.doesNotMatch(markup({...snapshot,enrollmentCertificate:bundle}),/FOREIGN PRIVATE|QA-CERT/);
  const duplicate={assessments:[assessment,{...assessment,id:'second',version:99,updatedAt:'2099-01-01T00:00:00Z'}],documents:[]};
  assert.equal(ownEnrollmentCertificate(duplicate,owner).ambiguous,true);assert.equal(ownEnrollmentCertificate(duplicate,owner).assessment,null);
  assert.match(markup({...snapshot,enrollmentCertificate:duplicate}),/多筆站內條件紀錄/);assert.doesNotMatch(markup({...snapshot,enrollmentCertificate:duplicate}),/QA-CERT/);
});

test('blocked source view keeps the four columns and literal unknown semester, pending flag and result text',()=>{
  const doc=new JSDOM(markup()).window.document;
  assert.deepEqual([...doc.querySelectorAll('thead th')].map(node=>node.textContent),[...enrollmentCertificateColumns]);
  assert.deepEqual([...doc.querySelectorAll('tbody td')].map(node=>node.textContent),['130','—','Y','合成條件尚未完成']);
  assert.deepEqual([...doc.querySelectorAll('.enrollment-certificate-notes li')].map(node=>node.textContent),[...enrollmentCertificateSourceNotes]);
  assert.match(doc.querySelector('.enrollment-certificate-notes')!.getAttribute('aria-label')!,/來源網站.*2026-11-13.*非站內發證規則/);
  assert.match(doc.querySelector('footer')!.textContent!,/stu.best/);assert.doesNotMatch(doc.querySelector('footer')!.textContent!,/Copyright|樹德/);
  assert.equal(doc.querySelectorAll('.enrollment-certificate-local-document,form,input').length,0);
  assert.equal(doc.querySelector('.enrollment-certificate-brand img')!.getAttribute('src'),'/stu-reference/ee1f2bb8f7f5a9dd.svg');
  assert.equal(doc.querySelector('.enrollment-certificate-breadcrumb a:last-child')!.getAttribute('href'),enrollmentCertificatePath);
  const unknown=structuredClone(snapshot);Object.assign(unknown.enrollmentCertificate!.assessments[0],{academicYear:null,semester:null,hasPendingFees:null,status:'unknown',resultText:null});
  const empty=new JSDOM(markup(unknown)).window.document;
  assert.deepEqual([...empty.querySelectorAll('tbody td')].map(node=>node.textContent),['—','—','—','尚未完成站內條件確認']);
  unknown.enrollmentCertificate!.assessments[0].hasPendingFees='N';assert.doesNotMatch(markup(unknown,{onOpenLocalDocument:noop}),/開啟 stu.best/,'N never determines eligibility or invents a document.');
});

test('local document guard binds verified issuer, owner and assessment revision and rejects ambiguous or stale metadata',()=>{
  const data=eligible().enrollmentCertificate!,now=Date.parse('2030-01-01T00:00:00Z');
  assert.equal(verifiedEnrollmentCertificateDocument(data,owner,now),localDocument);
  const invalids=[{userId:other},{assessmentId:'other-assessment'},{assessmentVersion:1},{issuer:'School'},{purpose:'official_certificate'},
    {sourceMode:'official'},{status:'revoked'},{verifiedAt:null},{verifiedAt:'2040-01-01T00:00:00Z'},{verifiedAt:'2026-02-29T00:00:00Z'},
    {expiresAt:'2030-01-01T00:00:00Z'},{expiresAt:'invalid'},{id:' '},{id:7}];
  for(const patch of invalids)assert.equal(verifiedEnrollmentCertificateDocument({...data,documents:[{...localDocument,...patch} as EnrollmentCertificateLocalDocument]},owner,now),null);
  for(const status of ['blocked','unknown'] as const)assert.equal(verifiedEnrollmentCertificateDocument({...data,assessments:[{...data.assessments[0],status}]},owner,now),null);
  assert.equal(verifiedEnrollmentCertificateDocument({...data,documents:[localDocument,{...localDocument,id:'duplicate'}]},owner,now),null);
  assert.equal(verifiedEnrollmentCertificateDocument(data,'',now),null);assert.equal(verifiedEnrollmentCertificateDocument(data,owner,NaN),null);
  assert.equal(verifiedEnrollmentCertificateDocument({...data,documents:[]},owner,now),null);
});

test('source timestamp formatting requires a valid explicit instant rather than a current-time substitute',()=>{
  assert.equal(enrollmentCertificateTimestamp('2030-01-01T00:00:00Z'),'2030/01/01 08:00:00');
  for(const value of [null,undefined,'','2030-01-01','2026-02-29T00:00:00Z','2030-01-01T24:00:00Z','invalid'])assert.equal(enrollmentCertificateTimestamp(value),'—');
});

test('document opening remains local-labelled, single-flight and retryable with no URL or generated certificate claim',async()=>{
  const requests:EnrollmentCertificateDocumentRequest[]=[];let reject:(error:Error)=>void=()=>{};
  const onOpen=(request:EnrollmentCertificateDocumentRequest)=>{requests.push(request);return requests.length===1?new Promise<void>((_,fail)=>{reject=fail;}):Promise.resolve();};
  const view=render(<MemoryRouter><EnrollmentCertificate snapshot={eligible()} busy={false} onReload={noop} onLogout={noop} onOpenLocalDocument={onOpen}/></MemoryRouter>);
  const button=view.getByRole('button',{name:'開啟 stu.best 站內示範文件'});fireEvent.click(button);fireEvent.click(button);
  assert.equal(requests.length,1);assert.deepEqual(requests[0],{documentId:'local-file',assessmentId:'assessment',expectedAssessmentVersion:2});
  assert.equal((view.getByRole('button',{name:'開啟中…'}) as HTMLButtonElement).disabled,true);
  reject(new Error('PRIVATE transport detail'));await view.findByText('站內文件目前無法開啟，請稍後再試。');assert.equal(view.queryByText(/PRIVATE/),null);
  fireEvent.click(view.getByRole('button',{name:'開啟 stu.best 站內示範文件'}));await waitFor(()=>assert.equal(requests.length,2));await waitFor(()=>assert.equal(view.queryByRole('alert'),null));
  view.rerender(<MemoryRouter><EnrollmentCertificate snapshot={{...eligible(),profile:{userId:other}}} busy={false} onReload={noop} onLogout={noop} onOpenLocalDocument={onOpen}/></MemoryRouter>);
  assert.equal(view.queryByRole('button',{name:/站內示範文件/}),null);assert.equal(view.queryByText('合成測試生'),null);
  for(const props of [{busy:true},{error:'Synthetic reload failure'}])assert.doesNotMatch(markup(eligible(),{onOpenLocalDocument:noop,...props}),/開啟 stu.best/);
  assert.doesNotMatch(markup(eligible()),/開啟 stu.best/,'No host callback means no invented download control.');
});

test('error retry is explicit and source menus offer only captured destinations',()=>{
  let reloads=0;const view=render(<MemoryRouter><EnrollmentCertificate snapshot={null} busy={false} error="Synthetic failure" onReload={()=>reloads++} onLogout={noop}/></MemoryRouter>);
  fireEvent.click(view.getByRole('button',{name:'重新載入'}));assert.equal(reloads,1);
  assert.deepEqual([...view.container.querySelectorAll('.enrollment-certificate-nav button')].map(node=>node.textContent),['資料維護','查詢','Index']);
  assert.equal(view.container.querySelectorAll('tbody tr').length,0);assert.match(view.container.textContent!,/Date\/Time : —/);
});

test('mounted scope loader hides old owners, aborts old reads and ignores late results after account changes',async()=>{
  const pending:{userId:string;signal?:AbortSignal;resolve:(value:EnrollmentCertificateSnapshot)=>void;reject:(error:Error)=>void}[]=[];
  const load=(userId:string,signal?:AbortSignal)=>new Promise<EnrollmentCertificateSnapshot>((resolve,reject)=>pending.push({userId,signal,resolve,reject}));
  const view=render(<MemoryRouter><EnrollmentCertificateWorkspace userId={owner} onLogout={noop} load={load}/></MemoryRouter>);
  await waitFor(()=>assert.equal(pending.length,1));assert.match(view.getByRole('status').textContent!,/載入在學證明/);
  await act(async()=>{pending[0].reject(new Error('PRIVATE backend detail'));});assert.doesNotMatch(view.getByRole('alert').textContent!,/PRIVATE/);
  fireEvent.click(view.getByRole('button',{name:'重新載入'}));await waitFor(()=>assert.equal(pending.length,2));
  await act(async()=>{pending[1].resolve(snapshot);});assert.match(view.container.textContent!,/合成測試生/);
  view.rerender(<MemoryRouter><EnrollmentCertificateWorkspace userId={other} onLogout={noop} load={load}/></MemoryRouter>);
  assert.doesNotMatch(view.container.textContent!,/合成測試生/);await waitFor(()=>assert.equal(pending.length,3));
  view.rerender(<MemoryRouter><EnrollmentCertificateWorkspace userId={owner} onLogout={noop} load={load}/></MemoryRouter>);
  await waitFor(()=>assert.equal(pending.length,4));assert.equal(pending[2].signal?.aborted,true);
  const foreignSnapshot={...snapshot,profile:{userId:other},enrollmentCertificate:{assessments:[{...assessment,userId:other,identity:{...assessment.identity,studentName:'FOREIGN LATE PRIVATE'}}],documents:[]}};
  await act(async()=>{pending[2].resolve(foreignSnapshot);});assert.doesNotMatch(view.container.textContent!,/FOREIGN LATE PRIVATE/);
  await act(async()=>{pending[3].resolve(snapshot);});assert.match(view.container.textContent!,/合成測試生/);
  assert.equal(view.queryByRole('button',{name:/開啟 stu.best/}),null);
});
