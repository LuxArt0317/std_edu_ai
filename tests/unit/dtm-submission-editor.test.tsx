import assert from 'node:assert/strict';
import {afterEach,test} from 'node:test';
import {registerHooks} from 'node:module';
import {JSDOM} from 'jsdom';
import {dtmEditorContentType,dtmEditorFileError,dtmEditorMaxFileBytes,ownDtmEditorAssignment,ownDtmEditorSavedFile,type DtmEditorSavedFile} from '../../src/services/dtmSubmissionEditor';

const cssHook=registerHooks({load(url,context,nextLoad){return url.endsWith('/dtmSubmissionEditor.css')?{format:'module',source:'export {};',shortCircuit:true}:nextLoad(url,context);}});
const {DtmSubmissionEditor}=await import('../../src/features/public/dtm/DtmSubmissionEditor');
cssHook.deregister();
const dom=new JSDOM('<!doctype html><html><body></body></html>',{url:'http://localhost',pretendToBeVisual:true});
Object.assign(globalThis,{window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,Node:dom.window.Node,File:dom.window.File});
Object.defineProperty(globalThis,'navigator',{configurable:true,value:dom.window.navigator});
const {cleanup,fireEvent,render,waitFor}=await import('@testing-library/react');
afterEach(cleanup);
const assignment={id:'synthetic-assignment',userId:'owner',title:'合成作業編輯'};
const saved:DtmEditorSavedFile={id:'saved-file',userId:'owner',assignmentId:assignment.id,filename:'synthetic-saved.pdf',sizeBytes:100,contentType:'application/pdf'};
const scope={userId:'owner',assignmentId:assignment.id};
const file=(name='synthetic-pending.pdf',type='application/pdf')=>new File(['synthetic'],name,{type});
const noop=()=>{};
const defaults={userId:'owner',assignment,savedFile:saved,selectedFile:null,selectedFileScope:null,onChoose:noop,onSave:noop,onCancel:noop,onRemovePending:noop};

test('editor validates exact 10 MiB, UTF-8 names, MIME and empty files without mutating metadata',()=>{
  const metadata={name:' original name.pdf ',size:dtmEditorMaxFileBytes,type:'APPLICATION/PDF'};
  assert.equal(dtmEditorFileError(metadata),null);assert.equal(metadata.name,' original name.pdf ');
  assert.equal(dtmEditorContentType(metadata.type),'application/pdf');assert.equal(dtmEditorContentType(''),'application/octet-stream');
  assert.equal(dtmEditorFileError({...metadata,size:0}),null);assert.equal(dtmEditorFileError({...metadata,name:'字'.repeat(85)}),null);
  for(const name of ['', ' ','.','..','a/b','a\\b','a\u0000b','a\u001fb','a\u007fb','\ud800','字'.repeat(86)])assert.ok(dtmEditorFileError({...metadata,name}),name);
  for(const size of [-1,NaN,Infinity,1.5,dtmEditorMaxFileBytes+1])assert.ok(dtmEditorFileError({...metadata,size}));
  for(const type of [' text/plain','text/plain; charset=utf-8','plain','text/','x/'.padEnd(121,'a')])assert.equal(dtmEditorContentType(type),null);
  assert.ok(dtmEditorFileError(null));
});

test('assignment, saved file and pending selection are strictly owner and assignment scoped',()=>{
  assert.equal(ownDtmEditorAssignment(assignment,'owner'),assignment);
  const ownerless={id:assignment.id,title:assignment.title};
  assert.equal(ownDtmEditorAssignment(Object.assign(Object.create({userId:'owner'}),ownerless),'owner'),null);
  assert.equal(ownDtmEditorSavedFile({...saved,userId:'other'},assignment),null);
  assert.equal(ownDtmEditorSavedFile({...saved,assignmentId:'other'},assignment),null);
  const screen=render(<DtmSubmissionEditor {...defaults} userId="other" selectedFile={file('PRIVATE.pdf')} selectedFileScope={scope}/>);
  assert.equal(screen.queryByText(assignment.title),null);assert.equal(screen.queryByText('PRIVATE.pdf'),null);assert.equal(screen.queryByRole('button'),null);
  screen.rerender(<DtmSubmissionEditor {...defaults} savedFile={{...saved,userId:'other',filename:'PRIVATE-SAVED.pdf'}} selectedFile={file('PRIVATE-PENDING.pdf')} selectedFileScope={{...scope,assignmentId:'other'}}/>);
  assert.equal(screen.queryByText(/PRIVATE/),null);assert.equal(screen.getByRole('button',{name:'儲存更改'}).hasAttribute('disabled'),true);
});

test('choosing validates one file, keeps the original File and does not clear an existing pending selection on failure',async()=>{
  let chosen:File|null=null;
  const pending=file(),next=file('next.pdf'),screen=render(<DtmSubmissionEditor {...defaults} selectedFile={pending} selectedFileScope={scope} onChoose={candidate=>{chosen=candidate;}}/>);
  const input=screen.getByLabelText('提交檔案',{selector:'input'});
  fireEvent.change(input,{target:{files:[next]}});await waitFor(()=>assert.equal(chosen,next));
  fireEvent.change(input,{target:{files:[next,pending]}});await waitFor(()=>assert.match(screen.getByRole('alert').textContent??'',/1 個檔案/));
  assert.equal(chosen,next);assert.ok(screen.getByText(pending.name));
  const large=file('large.pdf');Object.defineProperty(large,'size',{value:dtmEditorMaxFileBytes+1});
  fireEvent.change(input,{target:{files:[large]}});await waitFor(()=>assert.match(screen.getByRole('alert').textContent??'',/10 MiB/));assert.equal(chosen,next);
  screen.rerender(<DtmSubmissionEditor {...defaults} selectedFile={pending} selectedFileScope={scope} onChoose={async()=>{throw new Error('Synthetic choose failure');}}/>);
  fireEvent.change(input,{target:{files:[next]}});await waitFor(()=>assert.match(screen.getByRole('alert').textContent??'',/Synthetic choose failure/));assert.ok(screen.getByText(pending.name));
});

test('save requires a valid new file, serializes clicks and retains the same file for an uncertain-response retry',async()=>{
  let attempts=0,finish:((reason?:unknown)=>void)|undefined;const pending=file(),received:File[]=[];
  const onSave=(candidate:File)=>{attempts++;received.push(candidate);return new Promise<void>((resolve,reject)=>{finish=reason=>reason?reject(reason):resolve();});};
  const screen=render(<DtmSubmissionEditor {...defaults} onSave={onSave}/>);
  const save=screen.getByRole('button',{name:'儲存更改'});assert.equal(save.hasAttribute('disabled'),true);
  screen.rerender(<DtmSubmissionEditor {...defaults} selectedFile={pending} selectedFileScope={scope} onSave={onSave}/>);
  fireEvent.click(save);fireEvent.click(save);assert.equal(attempts,1);assert.equal(save.hasAttribute('disabled'),true);
  finish!(new Error('Synthetic uncertain save'));await waitFor(()=>assert.match(screen.getByRole('alert').textContent??'',/Synthetic uncertain save/));
  assert.ok(screen.getByText(pending.name));fireEvent.click(save);assert.equal(attempts,2);assert.equal(received[0],received[1]);
  finish!();await waitFor(()=>assert.equal(save.hasAttribute('disabled'),false));assert.ok(screen.getByText(pending.name));
});

test('remove targets pending only, cancel never removes saved or pending implicitly, and Escape belongs to the host',async()=>{
  let removes=0,cancels=0;const pending=file();
  const screen=render(<DtmSubmissionEditor {...defaults} selectedFile={pending} selectedFileScope={scope} onRemovePending={()=>{removes++;}} onCancel={()=>{cancels++;}}/>);
  fireEvent.keyDown(screen.getByRole('button',{name:'取消'}),{key:'Escape'});assert.equal(cancels,0);
  fireEvent.click(screen.getByRole('button',{name:'取消'}));await waitFor(()=>assert.equal(cancels,1));assert.equal(removes,0);assert.ok(screen.getByText(pending.name));
  fireEvent.click(screen.getByRole('button',{name:'移除待儲存檔案'}));await waitFor(()=>assert.equal(removes,1));
  screen.rerender(<DtmSubmissionEditor {...defaults} onRemovePending={()=>{removes++;}}/>);assert.ok(screen.getByText(saved.filename));assert.equal(screen.queryByRole('button',{name:'移除待儲存檔案'}),null);
  assert.equal(saved.filename,'synthetic-saved.pdf');
});

test('download only invokes the authorized saved-file callback and all three views render the same explicit filename',async()=>{
  const downloads:string[]=[];const screen=render(<DtmSubmissionEditor {...defaults} onDownload={id=>{downloads.push(id);}}/>);
  fireEvent.click(screen.getByRole('button',{name:'下載已儲存檔案'}));await waitFor(()=>assert.deepEqual(downloads,[saved.id]));
  for(const label of ['清單檢視','樹狀檢視','圖示檢視']){fireEvent.click(screen.getByRole('button',{name:label}));assert.equal(screen.getByRole('button',{name:label}).getAttribute('aria-pressed'),'true');assert.ok(screen.getByText(saved.filename));}
  assert.equal(screen.container.querySelectorAll('a').length,0);
  screen.rerender(<DtmSubmissionEditor {...defaults} savedFile={{...saved,userId:'other'}} onDownload={id=>{downloads.push(id);}}/>);
  assert.equal(screen.getByRole('button',{name:'下載已儲存檔案'}).hasAttribute('disabled'),true);
});

test('busy/status disables mutations, progress is explicit, errors reset on assignment change and filenames are escaped',()=>{
  const pending=file('<script>literal.pdf');const screen=render(<DtmSubmissionEditor {...defaults} selectedFile={pending} selectedFileScope={scope} status="uploading" progress={25}/>);
  for(const button of screen.getAllByRole('button'))assert.equal(button.hasAttribute('disabled'),true);
  assert.equal(screen.getByRole('progressbar').getAttribute('value'),'25');assert.ok(screen.getByText(pending.name));assert.equal(screen.container.querySelector('script'),null);
  screen.rerender(<DtmSubmissionEditor {...defaults} status="uploading" progress={NaN}/>);assert.equal(screen.getByRole('progressbar').hasAttribute('value'),false);
  screen.rerender(<DtmSubmissionEditor {...defaults} status="saving"/>);assert.match(screen.getByRole('status').textContent??'',/儲存/);
  screen.rerender(<DtmSubmissionEditor {...defaults} assignment={{...assignment,id:'new-assignment'}} selectedFile={pending} selectedFileScope={scope}/>);
  assert.equal(screen.queryByText(pending.name),null);assert.equal(screen.queryByText(saved.filename),null);assert.equal(screen.queryByRole('alert'),null);
});
