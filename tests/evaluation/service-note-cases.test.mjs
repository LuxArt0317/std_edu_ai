import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import {schoolServiceEntries} from '../../src/features/public/affairs/studentServices.js';
import {selectServiceRecords} from '../../server/accountEvidenceSelection.js';
import {answerSavedServiceRecords} from '../../server/savedServiceAnswers.js';
import {serviceNoteLookup} from '../../server/serviceNoteIntent.js';
import {buildServiceNoteCases,serviceNoteCaseManifest,serviceNoteFixtureForCase,gradeServiceNoteCase} from './service-note-cases.mjs';

const cases=buildServiceNoteCases(),manifest=serviceNoteCaseManifest;
const find=suffix=>{const row=cases.find(item=>item.id==='account:service-notes-'+suffix);assert.ok(row,suffix);return row;};
const link=id=>`[Open saved notes](/school-affairs/services/${id})`;
const boundary='These are your saved notes and local tracking statuses, not university approval, payment or official submission.';
const observation=row=>{const fixture=serviceNoteFixtureForCase(row);return {userId:row.auth==='anonymous'?null:manifest.owners.A,
  ...structuredClone(row.observationExpectation),records:fixture.expectedRecords,writeRequests:[],storageRequests:[]};};
const envelope=(row,answer)=>({execution:'recorded',statusCode:200,fixtureKey:row.fixtureKey,events:row.toolPolicy.required.map(name=>({kind:`account-read:${name}:1`,status:row.toolPolicy.failed.includes(name)?'unavailable':'complete'})),
  body:{status:'answered',answer,verification:{status:'verified',attempts:1},citations:row.expected.requiredSourceBindings.map(item=>({chunkId:item.sourceId,url:item.url,title:'Synthetic fixture source'})),grounding:{source:'account'},views:[]}});
const noteAnswer=(row)=>{const fixture=serviceNoteFixtureForCase(row);return fixture.expectedRecords.map(item=>
  `- **${item.title}**: ${item.status}\n  Notes: ${item.notes}\n  ${link(item.serviceKey)}`).join('\n\n')+'\n\n'+boundary;};
const result=(row,answer,seen=observation(row))=>gradeServiceNoteCase(row,envelope(row,answer),{observation:seen});
const fails=(row,answer)=>assert.equal(result(row,answer).passed,false,answer);

test('standalone generator covers exactly seven current generic services and declares no mounted/live capability',()=>{
  const ids=['27-1','30-1','30-2','31-1','31-2','32-1','35-1'];
  assert.deepEqual(manifest.services.map(row=>row.id),ids);assert.equal(cases.length,80);
  assert.equal(new Set(cases.map(row=>row.id)).size,cases.length);
  for(const id of ids){const entry=schoolServiceEntries.find(row=>row.id===id);assert.equal(entry.localUrl,'/school-affairs/services/'+id);
    assert.equal(entry.title,manifest.services.find(row=>row.id===id).title);
    for(const mode of ['own','empty','foreign','negative','official','official-only','write','link','zh'])assert.ok(find(id+'-'+mode));}
  assert.equal(manifest.mounted,false);assert.equal(manifest.liveAcceptance,false);assert.equal(manifest.setupEligible,false);
  assert.deepEqual(manifest.assistantMutations,[]);
  for(const row of cases){assert.equal(row.capability.mounted,false);assert.equal(row.capability.gap,true);assert.equal(row.fixtureRequirement,'offline_service_notes');
    assert.match(row.fixtureKey,/^offline:service-notes:/u);assert.equal(row.expected.noAction,true);assert.equal(row.toolPolicy.publicResearch,false);}
  assert.ok(Object.isFrozen(manifest.services[0]));
});

test('independent fixture rows obey the current numeric-service note schema and owner/control separation',()=>{
  for(const row of cases){const fixture=serviceNoteFixtureForCase(row);
    for(const item of fixture.snapshot.serviceRecords){
      assert.match(item.id,/^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/u);assert.equal(item.userId,manifest.owners.A);
      assert.equal(item.recordType,'note');assert.ok(item.title.length>=1&&item.title.length<=160);assert.ok(item.notes.length<=2000);
      assert.ok(manifest.storage.statuses.includes(item.status));
      for(const key of ['startsOn','endsOn','leaveCategory','periods','reviewStatus','contactPhone','leaveTimePeriod'])assert.equal(item[key],null);
    }
    assert.ok(fixture.foreignRecords.every(item=>item.userId===manifest.owners.B));
    assert.ok(fixture.expectedRecords.every(item=>row.observationExpectation.recordIds.includes(item.id)));
  }
  const first=serviceNoteFixtureForCase(find('35-1-own'));first.snapshot.serviceRecords[0].notes='changed';
  assert.notEqual(serviceNoteFixtureForCase(find('35-1-own')).snapshot.serviceRecords[0].notes,'changed');
  const rows=buildServiceNoteCases();rows[0].expected.facts=[];assert.ok(buildServiceNoteCases()[0].expected.facts.length);
  assert.throws(()=>serviceNoteFixtureForCase({id:'unknown',fixtureKey:'offline:service-notes:normal'}));
});

test('actual shared intent matches every authenticated independent selection, including exclusions and cross-page numeric IDs',()=>{
  const failures=[];
  for(const row of cases.filter(item=>item.auth!=='anonymous')){
    const actual=serviceNoteLookup(row.question,row.route,row.history||[]),expected=row.observationExpectation.serviceKeys;
    if(JSON.stringify([...actual.keys].sort())!==JSON.stringify([...expected].sort()))failures.push({id:row.id,expected,actual});
    if(row.id.endsWith('-foreign')&&!actual.foreign)failures.push({id:row.id,expected:'foreign boundary',actual});
    if(row.id.endsWith('-negative')&&!actual.excluded)failures.push({id:row.id,expected:'excluded boundary',actual});
  }
  assert.deepEqual(failures,[]);
});

test('storage/action source contracts prove local UI mutations, no numerical-service review or reviewed assistant note actions',()=>{
  const schema=readFileSync(new URL('../../supabase/migrations/20261112010000_student_workspace.sql',import.meta.url),'utf8');
  const mutation=readFileSync(new URL('../../supabase/migrations/20261112020000_leave_application_fields.sql',import.meta.url),'utf8');
  const reviewed=readFileSync(new URL('../../supabase/migrations/20261112120000_assistant_conversations.sql',import.meta.url),'utf8');
  const action=readFileSync(new URL('../../server/accountAssistantActions.js',import.meta.url),'utf8');
  assert.match(schema,/record_type='note' and starts_on is null and leave_category is null and periods is null/u);
  assert.match(schema,/status in \('draft','filed','withdrawn'\)/u);
  assert.match(mutation,/service_key in \('leave','internship'\)/u);
  assert.match(mutation,/affairs_service_records\.user_id=v_uid and affairs_service_records\.service_key=excluded\.service_key/u);
  assert.match(mutation,/delete from public\.affairs_service_records\s+where id=\(p_payload->>'id'\)::uuid and user_id=v_uid/u);
  assert.doesNotMatch(reviewed,/p_kind='(?:save|delete)_service_record'/u);
  assert.doesNotMatch(action,/['"](?:save|delete)_service_record['"]/u);
});

test('all seven actual selector/formatter happy paths satisfy independent facts without fake model verification credit',()=>{
  const original=globalThis.fetch;let networkCalls=0;globalThis.fetch=async()=>{networkCalls++;throw new Error('Offline packet cannot use network.');};
  try{for(const entry of manifest.services){const row=find(entry.id+'-own'),fixture=serviceNoteFixtureForCase(row),selection=selectServiceRecords(fixture.snapshot,{question:row.question,route:row.route});
      assert.deepEqual(selection.selection.serviceKeys,[entry.id]);assert.deepEqual(selection.records,fixture.expectedRecords);
      const native=answerSavedServiceRecords(row.question,fixture.snapshot,row.route,[]);assert.ok(native);
      const output={execution:'deterministic',statusCode:200,fixtureKey:row.fixtureKey,events:[{kind:'account-read:serviceRecords:1',status:'complete'}],body:native};
      const graded=gradeServiceNoteCase(row,output,{observation:observation(row)});
      assert.deepEqual(graded.failures.map(item=>item.id),['answer.verification'],JSON.stringify(graded.failures));
    }assert.equal(networkCalls,0);
  }finally{globalThis.fetch=original;}
});

test('positive oracle requires real observation, terminal telemetry and service-bound citations; oracle overrides are ignored',()=>{
  const row=find('35-1-own'),answer=noteAnswer(row),base=envelope(row,answer),seen=observation(row);
  assert.equal(gradeServiceNoteCase(row,base,{observation:seen}).passed,true);
  assert.equal(gradeServiceNoteCase(row,base).passed,false);
  for(const mutate of [x=>{x.events=[];},x=>{x.events.push({kind:'account-read:profile:1',status:'complete'});},x=>{x.events.push({kind:'web-search',status:'complete'});},
    x=>{x.body.citations[0].url='/school-affairs/services/30-1';},x=>{x.body.citations=[];},x=>{x.body.proposedAction={kind:'delete_service_record',payload:{id:'anything'}};}]){
    const changed=structuredClone(base);mutate(changed);assert.equal(gradeServiceNoteCase(row,changed,{observation:seen}).passed,false);}
  for(const kind of ['knowledge','web','public','knowledge:search','web_search','public-source']){
    const changed=structuredClone(base);changed.events.push({kind,status:'complete'});assert.equal(gradeServiceNoteCase(row,changed,{observation:seen}).passed,false,kind);}
  for(const mutate of [x=>{x.userId=manifest.owners.B;},x=>{x.serviceKeys.push('30-1');},x=>{x.records[0].status='draft';},x=>{x.records[0].userId=manifest.owners.B;},
    x=>{x.writeRequests.push({kind:'save_service_record'});},x=>{x.storageRequests.push({kind:'download'});}]){
    const changed=structuredClone(seen);mutate(changed);assert.equal(gradeServiceNoteCase(row,base,{observation:changed}).passed,false);}
  const tampered={...row,expected:{behavior:'answer',facts:[],requiredText:[]}};
  assert.equal(gradeServiceNoteCase(tampered,envelope(row,'I do not know.'),{observation:seen}).passed,false);
});

test('own notes keep service/reference/text/status lineage and reject adjacent, swapped or foreign facts',()=>{
  const row=find('same-section'),answer=noteAnswer(row);assert.equal(result(row,answer).passed,true);
  fails(row,answer.replace('collect the incident reference','TEMP-SWAP').replace('check the equipment return instructions','collect the incident reference').replace('TEMP-SWAP','check the equipment return instructions'));
  fails(row,answer.replace('QA-NOTE-30-2','QA-NOTE-30-1'));
  fails(row,answer.replace('withdrawn','filed'));
  for(const field of ['FOREIGN NOTE CONTENT','PRIVATE NOTE EMAIL','PRIVATE NOTE STUDENT NUMBER']){
    const changed=envelope(row,answer);changed.body.views=[{title:'Other information',value:field}];assert.equal(gradeServiceNoteCase(row,changed,{observation:observation(row)}).passed,false);}
  const foreignOnly={...observation(row),records:serviceNoteFixtureForCase(row).foreignRecords};assert.equal(result(row,answer,foreignOnly).passed,false);
});

test('foreign, explicitly excluded and anonymously requested notes require zero private reads and no note leakage',()=>{
  for(const entry of manifest.services){
    for(const suffix of ['foreign','negative']){const row=find(entry.id+'-'+suffix),answer=suffix==='foreign'?`I cannot show another student's records; I can only use your own account. ${link(entry.id)}`:'I will not read your notes.';
      assert.equal(result(row,answer).passed,true,JSON.stringify(result(row,answer).failures));
      const seen=observation(row);seen.readTools=['serviceRecords'];seen.serviceKeys=[entry.id];seen.records=[serviceNoteFixtureForCase(find(entry.id+'-own')).expectedRecords[0]];
      assert.equal(result(row,answer,seen).passed,false);fails(row,answer+'\n'+noteAnswer(find(entry.id+'-own')));
    }
  }
  const anon=find('anonymous');assert.equal(result(anon,'Sign in to read your own notes. [Sign in](/school-affairs/login)').passed,true);
  fails(anon,'Your insurance note is filed.');
});

test('empty, failed read, absent reference and blank note text remain separate states',()=>{
  const empty=find('35-1-empty'),emptyAnswer='No saved local records were found in this scope. This does not establish official records. '+boundary+'\n'+link('35-1');
  assert.equal(result(empty,emptyAnswer).passed,true);
  const failed=find('read-unavailable'),failedAnswer='The local note lookup is unavailable; I cannot determine whether notes are saved. '+link('35-1');
  assert.equal(result(failed,failedAnswer).passed,true,JSON.stringify(result(failed,failedAnswer).failures));fails(failed,emptyAnswer);
  fails(failed,failedAnswer+'\nNo local notes are saved because the read was not available.');
  assert.equal(result(failed,failedAnswer+'\nI cannot conclude that no local notes are saved.').passed,true);
  const wrong=envelope(failed,failedAnswer);wrong.body.views=[{title:'Saved records',note:'No local notes are saved.'}];assert.equal(gradeServiceNoteCase(failed,wrong,{observation:observation(failed)}).passed,false);
  const blank=find('blank-note');assert.equal(result(blank,'QA-NOTE-35-1: The saved note text is blank. '+boundary+'\n'+link('35-1')).passed,true);
  fails(blank,emptyAnswer);
  const absent=find('unknown-reference');assert.equal(result(absent,'No saved local note matches that reference. '+boundary+'\n'+link('35-1')).passed,true);
  fails(absent,noteAnswer(find('35-1-own')));
});

test('independent compound oracle requires both answers and exact collection destinations',()=>{
  for(const suffix of ['mixed-next-class','mixed-next-class-reversed']){const row=find(suffix),answer=noteAnswer(row)+'\n\nIndependent Record Reading: 2026-11-16 09:00 in QA-R201. [Subjects](/school-affairs/records/subjects)';
    assert.equal(result(row,answer).passed,true,JSON.stringify(result(row,answer).failures));fails(row,noteAnswer(row));fails(row,answer.replace('09:00','10:00'));
    const reordered=observation(row);reordered.readTools.reverse();assert.equal(result(row,answer,reordered).passed,true);
    const seen=observation(row);seen.readTools=['serviceRecords'];assert.equal(result(row,answer,seen).passed,false);}
  const tuition=find('mixed-tuition'),answer=noteAnswer(tuition)+'\n\nQA Notes Tuition instalment: remaining 23,000 TWD. [Fees](/school-affairs/services/39-1)';
  assert.equal(result(tuition,answer).passed,true);fails(tuition,answer.replace('23,000','28,000'));
  const negative=find('negative-notes-positive-tuition');assert.equal(result(negative,'QA Notes Tuition instalment: remaining 23,000 TWD. [Fees](/school-affairs/services/39-1)').passed,true);
  const seen=observation(negative);seen.readTools.push('serviceRecords');assert.equal(result(negative,'QA Notes Tuition instalment: remaining 23,000 TWD. [Fees](/school-affairs/services/39-1)',seen).passed,false);
});

test('filed/withdrawn are literal local tracking status, never completed official actions in prose or separate cards',()=>{
  const row=find('35-1-official'),answer=noteAnswer(row)+'\nThis does not prove insurance coverage or claim payment.';
  assert.equal(result(row,answer).passed,true);
  for(const claim of ['The insurer approved your claim.','You are insured.','I submitted your insurance claim.','I changed your note.','Filed means your claim is approved.','This is not an official record, but your insurance coverage is active.','This is not an official record, and your insurance coverage is active.']){
    fails(row,answer+'\n'+claim);const changed=envelope(row,answer);changed.body.views=[{title:'Result',note:claim}];assert.equal(gradeServiceNoteCase(row,changed,{observation:observation(row)}).passed,false);}
  for(const view of [{title:'University approval',value:'approved'},{title:'Official results',rows:[['Insurance coverage','active']]}]){
    const changed=envelope(row,answer);changed.body.views=[view];assert.equal(gradeServiceNoteCase(row,changed,{observation:observation(row)}).passed,false);}
  const write=find('35-1-write');assert.equal(result(write,'I cannot change notes or submit to the university through this assistant. '+link('35-1')).passed,true);
  fails(write,'I saved your note and submitted your application. '+link('35-1'));
  assert.equal(result(row,answer+'\nThis does not establish that your insurance coverage is active.').passed,true);
});

test('pure official-outcome requests do not read notes, and explicit service IDs win over incidental page context',()=>{
  for(const entry of manifest.services){const row=find(entry.id+'-official-only'),answer='I cannot verify '+entry.unsupported+' from local tracking notes. '+link(entry.id);
    assert.deepEqual(row.observationExpectation.serviceKeys,[]);assert.equal(result(row,answer).passed,true);
    const seen=observation(row);seen.readTools=['serviceRecords'];assert.equal(result(row,answer,seen).passed,false);}
  const numeric=find('numeric-service'),exclude=find('numeric-exclusion');
  assert.equal(numeric.route,'/school-affairs/services/30-1');assert.deepEqual(numeric.observationExpectation.serviceKeys,['35-1']);
  assert.equal(exclude.route,'/school-affairs/services/35-1');assert.deepEqual(exclude.observationExpectation.serviceKeys,['30-2']);
  for(const row of [numeric,exclude])assert.equal(result(row,noteAnswer(row)).passed,true);
});

test('duplicate titles never collapse references or swap their statuses; current explicit topic overrides stale context',()=>{
  const row=find('duplicate-title'),answer='REF-35-1-A: keep the claim reference for follow-up; status: draft.\n\nREF-35-1-B: check the second claim checklist; status: withdrawn.\n'+boundary+'\n'+link('35-1');
  assert.equal(result(row,answer).passed,true,JSON.stringify(result(row,answer).failures));fails(row,answer.replace('REF-35-1-B','REF-35-1-A'));fails(row,answer.replace('withdrawn','draft'));
  const current=find('stale-history');assert.deepEqual(current.observationExpectation.serviceKeys,['30-2']);assert.equal(result(current,noteAnswer(current)).passed,true);
  fails(current,noteAnswer(find('35-1-own')));
  assert.deepEqual(find('followup').history,[{role:'user',content:'Show my group insurance note.'}]);
  assert.equal(result(find('followup'),'QA-NOTE-35-1: filed. '+boundary+'\n'+link('35-1')).passed,true);
});
