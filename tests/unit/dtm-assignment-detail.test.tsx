import assert from 'node:assert/strict';
import {afterEach,test} from 'node:test';
import {registerHooks} from 'node:module';
import {renderToStaticMarkup} from 'react-dom/server';
import {JSDOM} from 'jsdom';
import {dtmAssignmentDetailLabels,dtmAssignmentTimestamp,dtmPrivateFileHref,ownDtmAssignmentDetail,type DtmAssignmentDetailReport} from '../../src/services/dtmAssignmentDetail';

// CSS is checked by the isolated browser render; Node renders the component DOM.
const cssHook=registerHooks({load(url,context,nextLoad){return url.endsWith('/dtmAssignmentDetail.css')?{format:'module',source:'export {};',shortCircuit:true}:nextLoad(url,context);}});
const {DtmAssignmentDetail}=await import('../../src/features/public/dtm/DtmAssignmentDetail');
cssHook.deregister();
const dom=new JSDOM('<!doctype html><html><body></body></html>',{url:'http://localhost',pretendToBeVisual:true});
Object.assign(globalThis,{window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,Node:dom.window.Node});
Object.defineProperty(globalThis,'navigator',{configurable:true,value:dom.window.navigator});
const {cleanup,fireEvent,render,waitFor}=await import('@testing-library/react');
afterEach(cleanup);
const report:DtmAssignmentDetailReport={id:'synthetic-assignment',userId:'owner',courseId:'synthetic-course',title:'合成作業',
  submissionStatusText:'合成繳交狀態',gradingStatusText:null,gradingAppearance:null,dueAt:null,timingText:null,timingAppearance:null,
  modifiedAt:null,submittedFiles:null,canEditSubmission:null};
const markup=(value:DtmAssignmentDetailReport|null=report)=>renderToStaticMarkup(<DtmAssignmentDetail userId="owner" report={value}/>);

test('assignment report is strictly scoped to the caller and optional course before any field is shown',()=>{
  assert.equal(ownDtmAssignmentDetail(report,'owner'),report);assert.equal(ownDtmAssignmentDetail(report,'owner','synthetic-course'),report);
  for(const userId of ['', ' ', 'another-owner'])assert.equal(ownDtmAssignmentDetail(report,userId),null);
  assert.equal(ownDtmAssignmentDetail(report,'owner','another-course'),null);assert.equal(ownDtmAssignmentDetail(null,'owner'),null);
  const ownerless={...report};delete (ownerless as Partial<DtmAssignmentDetailReport>).userId;
  assert.equal(ownDtmAssignmentDetail(ownerless,'owner'),null);
  assert.equal(ownDtmAssignmentDetail(Object.assign(Object.create({userId:'owner'}),ownerless),'owner'),null);
  const other={...report,userId:'another-owner',title:'PRIVATE OTHER TITLE',submittedFiles:[{filename:'PRIVATE OTHER FILE.pdf'}]};
  const html=markup(other);assert.doesNotMatch(html,/PRIVATE OTHER|合成繳交狀態/);assert.match(html,/目前沒有可顯示/);
});

test('private file links are exact approved local paths and default to inert filenames',()=>{
  const safe='/dtm/private-files/synthetic-file.pdf';assert.equal(dtmPrivateFileHref(safe),null);assert.equal(dtmPrivateFileHref(safe,[safe]),safe);
  assert.equal(dtmPrivateFileHref('/dtm/private-files/other',[safe]),null);
  for(const unsafe of ['https://outside.invalid/file.pdf','http://localhost/file.pdf','//outside.invalid/file.pdf','javascript:alert(1)',
    '/dtm/private-files/file?token=secret','/dtm/private-files/file#fragment','/dtm/private-files/../file','/dtm/private-files/./file',
    '/dtm/private-files/%2e%2e/file','/dtm/private-files/%252e%252e/file','/dtm/private-files/file%3fsecret','/dtm\\private-files\\file',
    '/dtm//private-files/file',' /dtm/private-files/file','/dtm/private-files/file\n','/dtm/private-files/測試',null,undefined,7]){
    assert.equal(dtmPrivateFileHref(unsafe,typeof unsafe==='string'?[unsafe]:[]),null,String(unsafe));
  }
});

test('timestamps require an explicit valid instant and use Taipei source formatting without record-time fallback',()=>{
  assert.equal(dtmAssignmentTimestamp('2024-02-29T16:03:00Z'),'2024年 3月 1日(Fri) 00:03');
  assert.equal(dtmAssignmentTimestamp('2024-02-29T10:03:00+08:00'),'2024年 2月 29日(Thu) 10:03');
  for(const value of [null,undefined,'','invalid','2026-02-29T00:00:00Z','2024-02-30T00:00:00Z','2024-02-29T10:03:00','2024-02-29T24:00:00Z'])assert.equal(dtmAssignmentTimestamp(value),'—');
});

test('seven source rows preserve independent unknown and literal values without inferring submission or grading',()=>{
  const doc=new JSDOM(markup()).window.document;
  assert.deepEqual([...doc.querySelectorAll('th')].map(cell=>cell.textContent),[...dtmAssignmentDetailLabels]);
  assert.deepEqual([...doc.querySelectorAll('td')].map(cell=>cell.textContent),['合成繳交狀態','—','—','—','—','—','—']);
  assert.equal(doc.querySelectorAll('.dtm-assignment-ungraded,.dtm-assignment-late,button').length,0);
  const explicit={...report,submissionStatusText:'0',gradingStatusText:'Late or graded words are literal',timingText:'Stored timing statement',
    excellentWorkText:'<img src=x onerror=alert(1)>',gradingAppearance:'ungraded' as const,timingAppearance:'late' as const};
  const before=JSON.stringify(explicit),rendered=new JSDOM(markup(explicit)).window.document;
  assert.equal(rendered.querySelector('td')?.textContent,'0');assert.equal(rendered.querySelectorAll('.dtm-assignment-ungraded').length,1);
  assert.equal(rendered.querySelector('.dtm-assignment-late')?.textContent,'Stored timing statement');
  assert.equal(rendered.querySelector('td:last-child img'),null);assert.equal(rendered.querySelectorAll('td')[6].textContent,explicit.excellentWorkText);
  assert.equal(JSON.stringify(explicit),before);
});

test('file display preserves order, escapes names, links only approved paths and applies the observed icon only to PDF names',()=>{
  const href='/dtm/private-files/fixture-a';
  const files={...report,submittedFiles:[{filename:'合成A.PDF',href},{filename:'<script>literal.txt',href:'https://outside.invalid/private'},
    {filename:'合成A.PDF',href:'/dtm/private-files/unapproved'}],excellentWorkText:''};
  const html=renderToStaticMarkup(<DtmAssignmentDetail userId="owner" report={files} approvedPrivateFileHrefs={[href,'https://outside.invalid/private']}/>);
  const doc=new JSDOM(html).window.document;
  assert.deepEqual([...doc.querySelectorAll('.dtm-assignment-files li')].map(node=>node.textContent),files.submittedFiles.map(file=>file.filename));
  assert.equal(doc.querySelectorAll('a').length,1);assert.equal(doc.querySelector('a')?.getAttribute('href'),href);
  assert.equal(doc.querySelectorAll('.dtm-assignment-files img').length,2);assert.equal(doc.querySelectorAll('script').length,0);
  assert.equal(doc.querySelectorAll('td')[6].textContent,'');
  assert.equal(new JSDOM(markup({...report,submittedFiles:[]})).window.document.querySelectorAll('td')[5].textContent,'');
});

test('submission editing requires explicit capability and callback, independently of a past deadline',async()=>{
  let calls=0,finish:(()=>void)|undefined;
  const edit=()=>{calls++;return new Promise<void>(resolve=>{finish=resolve;});};
  const value={...report,dueAt:'2000-01-01T00:00:00Z',canEditSubmission:true};
  const screen=render(<DtmAssignmentDetail userId="owner" report={value} onEdit={edit}/>);
  const button=screen.getByRole('button',{name:'修改我已繳交的作業'});
  fireEvent.click(button);fireEvent.click(button);assert.equal(calls,1);assert.equal((button as HTMLButtonElement).disabled,true);
  finish!();await waitFor(()=>assert.equal((button as HTMLButtonElement).disabled,false));
  screen.rerender(<DtmAssignmentDetail userId="owner" report={value}/>);assert.equal((button as HTMLButtonElement).disabled,true);
  for(const capability of [false,null]){screen.rerender(<DtmAssignmentDetail userId="owner" report={{...value,canEditSubmission:capability}} onEdit={edit}/>);assert.equal(screen.queryByRole('button',{name:'修改我已繳交的作業'}),null);}
});

test('loading, reload errors and edit errors are explicit, retryable and reset when the report owner changes',async()=>{
  let reloads=0,attempts=0;
  const screen=render(<DtmAssignmentDetail userId="owner" report={null} busy/>);
  assert.match(screen.getByRole('status').textContent??'',/載入/);
  screen.rerender(<DtmAssignmentDetail userId="owner" report={null} error="Synthetic read error" onReload={()=>{reloads++;}}/>);
  fireEvent.click(screen.getByRole('button',{name:'重新載入'}));assert.equal(reloads,1);
  const value={...report,canEditSubmission:true};
  const edit=async()=>{attempts++;if(attempts===1)throw new Error('Synthetic edit error');};
  screen.rerender(<DtmAssignmentDetail userId="owner" report={value} onEdit={edit}/>);
  fireEvent.click(screen.getByRole('button',{name:'修改我已繳交的作業'}));await waitFor(()=>assert.match(screen.getByRole('alert').textContent??'',/Synthetic edit error/));
  fireEvent.click(screen.getByRole('button',{name:'修改我已繳交的作業'}));await waitFor(()=>assert.equal(screen.queryByRole('alert'),null));assert.equal(attempts,2);
  screen.rerender(<DtmAssignmentDetail userId="another-owner" report={value} onEdit={edit}/>);
  assert.equal(screen.queryByText('合成作業'),null);assert.equal(screen.queryByRole('table'),null);assert.equal(screen.queryByRole('alert'),null);
});
