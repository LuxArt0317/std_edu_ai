import React from 'react';
import assert from 'node:assert/strict';
import {test,afterEach} from 'node:test';
import {renderToStaticMarkup} from 'react-dom/server';
import {JSDOM} from 'jsdom';
import {CreditLoadHistoryTable} from '../../src/features/public/affairs/CreditLoadHistoryTable';
import {creditLoadHistoryColumns,creditLoadHistoryTimestamp,type CreditLoadHistoryRecord,type CreditLoadHistorySaveAction} from '../../src/services/creditLoadHistory';

const fixture:CreditLoadHistoryRecord={id:'one',userId:'one',academicYear:115,semester:1,category:'over',requestedCredits:3.5,
  processText:'<script>unsafe()</script>',resultText:null,sourceMode:'local_demo',version:2,createdAt:'2026-11-12T00:00:00Z',updatedAt:'2026-11-12T00:00:00Z'};
test('history table has six captured headers, escapes labels, and hides other accounts',()=>{
  const html=renderToStaticMarkup(<CreditLoadHistoryTable userId="one" records={[fixture,{...fixture,id:'two',userId:'two',resultText:'OTHER PRIVATE RESULT'}]}/>);
  const document=new JSDOM(html).window.document;
  assert.deepEqual([...document.querySelectorAll('th')].map(element=>element.textContent),[...creditLoadHistoryColumns]);
  assert.equal(document.querySelectorAll('tbody tr').length,1);assert.equal(document.querySelectorAll('script,form,button,input').length,0);
  assert.doesNotMatch(html,/OTHER PRIVATE RESULT|<script>/);assert.match(html,/&lt;script&gt;unsafe\(\)&lt;\/script&gt;/);
  assert.deepEqual([...document.querySelectorAll('tbody td')].map(element=>element.textContent),['115','1','超修','3.5','<script>unsafe()</script>','—']);
});
test('empty and zero-credit history preserve the source empty table and exact displayed values',()=>{
  const empty=new JSDOM(renderToStaticMarkup(<CreditLoadHistoryTable userId="one" records={[]}/>)).window.document;
  assert.equal(empty.querySelectorAll('tbody tr').length,0);assert.match(empty.querySelector('table')!.getAttribute('aria-label')!,/尚無/);
  const zero=new JSDOM(renderToStaticMarkup(<CreditLoadHistoryTable userId="one" records={[{...fixture,category:'under',requestedCredits:0}]}/>)).window.document;
  assert.equal(zero.querySelector('tbody td:nth-child(3)')!.textContent,'減修');assert.equal(zero.querySelector('tbody td:nth-child(4)')!.textContent,'0');
  assert.equal(creditLoadHistoryTimestamp('2026-11-12T14:22:20Z'),'2026/11/12 22:22:20');assert.equal(creditLoadHistoryTimestamp('invalid'),'—');
});

const dom=new JSDOM('<!doctype html><html><body></body></html>',{url:'http://localhost',pretendToBeVisual:true});
for(const name of ['window','document','HTMLElement','HTMLInputElement','HTMLButtonElement','Node','Event','MouseEvent','MutationObserver','getComputedStyle','FormData'])Object.defineProperty(globalThis,name,{value:name==='window'?dom.window:name==='document'?dom.window.document:dom.window[name as keyof Window],configurable:true});
Object.defineProperty(globalThis,'navigator',{value:dom.window.navigator,configurable:true});
const {render,screen,cleanup,fireEvent,waitFor}=await import('@testing-library/react');
const {default:userEvent}=await import('@testing-library/user-event');
const {CreditLoadHistoryManager}=await import('../../src/features/public/affairs/CreditLoadHistoryManager');
afterEach(cleanup);
const profiles=[{user_id:'one',display_name:'Same Name',email:'first@example.invalid'},{user_id:'two',display_name:'Same Name',email:'second@example.invalid'}];
test('admin editor keeps identity fixed, blocks duplicate saves, and retries the same request after failure',async()=>{
  const actions:CreditLoadHistorySaveAction[]=[];let release:(value:boolean)=>void=()=>{};
  render(<CreditLoadHistoryManager records={[fixture]} profiles={profiles} busy={false} onSave={async action=>{
    actions.push(action);if(actions.length===1)throw new Error('Synthetic failed save');return new Promise<boolean>(resolve=>{release=resolve;});
  }}/>);
  const user=userEvent.setup();
  assert.match(screen.getByRole('option',{name:'Same Name (first@example.invalid)'}).textContent!,/first@example.invalid/);
  await user.click(screen.getByRole('button',{name:'Edit credit-load record'}));
  assert.equal((screen.getByLabelText('Student account') as HTMLSelectElement).disabled,true);
  await user.clear(screen.getByLabelText('Progress label · 申請進度'));await user.type(screen.getByLabelText('Progress label · 申請進度'),'Synthetic updated progress');
  await user.click(screen.getByRole('button',{name:'Save credit-load history'}));
  await screen.findByText('Synthetic failed save');
  await user.click(screen.getByRole('button',{name:'Save credit-load history'}));
  const busy=await screen.findByRole('button',{name:'Saving credit-load history…'});assert.equal((busy.closest('fieldset') as HTMLFieldSetElement).disabled,true);
  fireEvent.submit(busy.closest('form')!);assert.equal(actions.length,2);
  assert.equal(actions[0].payload.request_id,actions[1].payload.request_id);assert.equal(actions[1].payload.expected_version,'2');
  assert.equal(actions[1].payload.user_id,'one');assert.equal(actions[1].payload.id,'one');assert.equal(actions[1].payload.process_text,'Synthetic updated progress');
  release(true);await waitFor(()=>assert.ok(screen.getByText('Local credit-load history saved.')));
  assert.equal((screen.getByLabelText('Student account') as HTMLSelectElement).disabled,false);
});
