/**
 * Acceptance contracts for evidence actually supplied to the model. These tests
 * intentionally fail while a supported, saved record cannot reach the answer.
 * Run directly; not a CI gate until the implementation satisfies the contracts.
 */
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {accountEvidence,accountTools} from '../../server/answerVerificationAccount.js';
import {accountRecordViews} from '../../server/accountRecordViews.js';
import {buildAccountFixture,EVAL_USER_ID,EVAL_OTHER_USER_ID,evalId} from './fixtures.mjs';
import {serviceCapabilities,serviceNoteFixture} from './service-cases.mjs';

const generic=Object.values(serviceCapabilities).filter(row=>row.level==='generic-tracker');
const source=(snapshot,context={},tools=['serviceRecords'])=>{
  const found=accountEvidence(snapshot,tools,context).find(row=>row.id==='account:serviceRecords');
  assert.ok(found,'The selected saved-service record reader must return an evidence source.');
  return found;
};
const links=entry=>[entry.url,...(entry.urls||[])];
const fixture=rows=>({...buildAccountFixture(),serviceRecords:rows});
const rowsIn=value=>{
  if(!value||typeof value!=='object')return [];
  const rows=Object.hasOwn(value,'serviceKey')&&Object.hasOwn(value,'recordType')?[value]:[];
  return rows.concat(...Object.values(value).filter(child=>child&&typeof child==='object').map(rowsIn));
};
const rowsOf=entry=>rowsIn(JSON.parse(entry.content));

// IDs and field assertions come from the catalog and independently authored
// fixture data, never from a production answer helper's returned prose.
test('all generic service pages expose their own saved note and matching local citation',()=>{
  for(const service of generic){
    const note=serviceNoteFixture(service.serviceId,EVAL_USER_ID);
    const found=source(fixture([note]),{route:service.route,question:`Show my saved ${service.title} note.`});
    assert.ok(found.content.includes(`QA-${service.serviceId}`),`Missing saved note ${service.serviceId}`);
    assert.ok(links(found).includes(service.route),`Evidence for ${service.serviceId} links to the wrong service.`);
  }
});

test('an explicit service-name question works away from that service page',()=>{
  const target=serviceNoteFixture('29-1',EVAL_USER_ID),other=serviceNoteFixture('37-1',EVAL_USER_ID);
  const found=source(fixture([other,target]),{route:'/',question:'Show my saved 心理諮商/測驗申請 record and its reference code.'});
  assert.ok(rowsOf(found).some(row=>row.id===target.id),'Named counseling record was not retrieved from the homepage.');
  assert.ok(links(found).includes('/school-affairs/services/29-1'),'Named-service retrieval needs a link to its actual page.');
});

test('service filtering occurs before the evidence budget, preserving a late relevant note',()=>{
  const noise=Array.from({length:1500},(_,index)=>({...serviceNoteFixture('30-2',EVAL_USER_ID),id:evalId(10000+index),title:`UNRELATED equipment record ${index}`,notes:'Unrelated equipment details. '.repeat(70)}));
  const target=serviceNoteFixture('29-1',EVAL_USER_ID);
  const found=source(fixture([...noise,target]),{route:'/school-affairs/services/29-1',question:'What reference code did I save in my counseling note?'});
  assert.ok(rowsOf(found).some(row=>row.id===target.id),'The requested record was hidden after unrelated records consumed the evidence budget.');
  assert.equal(rowsOf(found).some(row=>row.title.startsWith('UNRELATED')),false,'Unrelated service notes must not displace the requested service.');
  assert.ok(Buffer.byteLength(found.content)<80000,'Relevant retrieval must still respect a bounded evidence payload.');
});

test('an exact reference finds a late note even within a large same-service history',()=>{
  const noise=Array.from({length:1500},(_,index)=>({...serviceNoteFixture('29-1',EVAL_USER_ID),id:evalId(20000+index),title:`Counseling history ${index}`,notes:`Archived reference OLD-${index}. `+'Historical planning text. '.repeat(70)}));
  const target=serviceNoteFixture('29-1',EVAL_USER_ID);
  const found=source(fixture([...noise,target]),{route:'/school-affairs/services/29-1',question:'Find my counseling note with the exact reference QA-29-1 and quote its next step.'});
  assert.ok(rowsOf(found).some(row=>row.id===target.id),'Exact saved reference was omitted by first-row truncation.');
  assert.ok(found.content.includes('review the instructions'));
});

test('explicit other-account records never enter saved-service model evidence',()=>{
  const own=serviceNoteFixture('29-1',EVAL_USER_ID);
  const foreign={...serviceNoteFixture('29-1',EVAL_OTHER_USER_ID),id:evalId(30000),title:'FOREIGN PRIVATE SENTINEL',notes:'FOREIGN PRIVATE SENTINEL'};
  const found=source(fixture([foreign,own]),{route:'/school-affairs/services/29-1',question:'Show my saved counseling records.'});
  assert.equal(found.content.includes('FOREIGN PRIVATE SENTINEL'),false,'A mixed upstream snapshot must not expose another owner.');
  assert.ok(rowsOf(found).some(row=>row.id===own.id));
});

test('empty requested service stays empty when another service has records',()=>{
  const other=serviceNoteFixture('29-1',EVAL_USER_ID);
  const found=source(fixture([other]),{route:'/school-affairs/services/37-1',question:'What payroll records are saved for me on this page?'});
  assert.deepEqual(rowsOf(found),[],'No payroll record exists; counseling notes are not substitutes.');
  assert.ok(links(found).includes('/school-affairs/services/37-1'),'An empty answer still needs the correct record page.');
  assert.equal(found.content.includes('QA-29-1'),false);
});

test('visible saved-service result cards use the selected service and only its rows',()=>{
  const target=serviceNoteFixture('35-1',EVAL_USER_ID),other=serviceNoteFixture('29-1',EVAL_USER_ID);
  const views=accountRecordViews(fixture([other,target]),['serviceRecords'],{route:'/school-affairs/services/35-1',question:'Show my saved group-insurance note.'});
  const view=views.find(row=>row.id==='serviceRecords');
  assert.ok(view);assert.equal(view.url,'/school-affairs/services/35-1');
  assert.ok(JSON.stringify(view.rows).includes('QA-35-1'));
  assert.equal(JSON.stringify(view.rows).includes('QA-29-1'),false);
});

test('the named tool advertises saved notes across the service catalog',()=>{
  assert.match(accountTools.serviceRecords,/notes?|track(?:er|ing)/i,'The planner must know private saved notes are queryable.');
  assert.match(accountTools.serviceRecords,/all|catalog|counsel|insurance|payroll|health|student services/i,'The tool must not advertise only leave and internship.');
});

test('unknown and prototype-like tool names never become evidence sources',()=>{
  const evidence=accountEvidence(buildAccountFixture(),['constructor','__proto__','toString','notARegisteredTool']);
  assert.deepEqual(evidence.map(row=>row.id),['account-scope']);
  assert.equal(evidence.some(row=>row.id==='account:constructor'),false);
});

test('untrusted service identifiers cannot manufacture citation URLs',()=>{
  const malicious={...serviceNoteFixture('29-1',EVAL_USER_ID),serviceKey:'../../admin?token=UNTRUSTED',title:'Untrusted identifier record'};
  const found=source(fixture([malicious]),{route:'/school-affairs/services/__proto__',question:'Show records for an unknown service.'});
  const allowed=new Set(['/school-affairs/records','/school-affairs/services/leave','/school-affairs/services/leave/history','/school-affairs/services/internship',...Object.values(serviceCapabilities).map(row=>row.route)]);
  for(const url of links(found)){
    assert.ok(allowed.has(url),`Citation URL was not in the service catalog: ${url}`);
    assert.equal(url.includes('UNTRUSTED'),false);assert.equal(url.includes('__proto__'),false);
  }
});
