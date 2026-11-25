import assert from 'node:assert/strict';
import test from 'node:test';
import {buildInternshipNativeCases,internshipNativeFixtureForCase,internshipNativeManifest} from './internship-native-cases.mjs';

const cases=buildInternshipNativeCases();
const find=(suffix)=>cases.find(item=>item.id==='account:internship-native-'+suffix);
const fixture=(suffix)=>internshipNativeFixtureForCase(find(suffix));
const tool='internshipRecords';
const titles=(rows)=>rows.map(row=>row.title);
const owner=internshipNativeManifest.owners.A;
const foreign=internshipNativeManifest.owners.B;

test('has stable IDs, four exact routes, bilingual coverage and no live acceptance claim',()=>{
  assert.equal(cases.length,30);
  assert.equal(new Set(cases.map(row=>row.id)).size,cases.length);
  assert.deepEqual(Object.keys(internshipNativeManifest.views),['contract','self_assessment','company','directory']);
  assert.ok(cases.some(row=>row.language==='zh-TW'));
  assert.ok(cases.some(row=>row.language==='en'));
  assert.ok(cases.every(row=>Object.isFrozen(row)&&row.mounted===false&&row.setupEligible===false&&row.liveAcceptance===false
    &&row.capability.gap===true&&row.expected.noAction===true&&row.expected.forbidPublicResearch===true));
  assert.ok(Object.isFrozen(cases)&&Object.isFrozen(internshipNativeManifest));
  for(const view of Object.values(internshipNativeManifest.views)){
    assert.ok(cases.some(row=>row.observationExpectation.read&&row.route===view.path));
  }
});

test('each positive view has only its own literal title and tracking state',()=>{
  const contract=fixture('contract-list').sourceRead;
  const selfAssessment=fixture('self-assessment-list-zh').sourceRead;
  const company=fixture('company-list').sourceRead;
  const directory=fixture('directory-personal').sourceRead;
  assert.deepEqual(contract.records,[{title:'QA Harbor Analytics',status:'filed'},{title:'QA Mountain Systems',status:'withdrawn'}]);
  assert.deepEqual(selfAssessment.records,[{title:'QA Internship Reflection',status:'draft'}]);
  assert.deepEqual(company.records,[{title:'QA Canyon Data',status:'draft'},{title:'QA Lakeside Tools',status:'filed'}]);
  assert.deepEqual(directory.records,company.records);
  assert.equal(directory.recordType,'company');
  assert.equal(directory.view,'directory');
  assert.equal(company.view,'company');
  for(const row of [contract,selfAssessment,company,directory]){
    assert.equal(row.ownerId,owner);
    assert.deepEqual(row.fields,['title','status']);
    assert.equal(row.count,row.records.length);
  }
  for(const suffix of ['directory-personal','directory-zh']){
    const row=find(suffix);
    assert.equal(row.expected.requiredLinks[0],internshipNativeManifest.views.directory.path);
    assert.deepEqual(row.expected.requiredSourceBindings,[{sourceId:'account:internshipRecords',url:row.route}]);
    assert.ok(row.expected.forbiddenAccountMarkers.includes('QA foreign company'));
    assert.ok(row.expected.forbiddenAccountMarkers.includes('QA Harbor Analytics'));
    assert.ok(!row.expected.forbiddenAccountMarkers.includes('QA Canyon Data'));
  }
});

test('contract dates, personal reflections and linked reviews each require their own request',()=>{
  const dates=fixture('contract-dates').sourceRead.records;
  assert.deepEqual(dates,[
    {title:'QA Harbor Analytics',status:'filed',startsOn:'2026-10-05',endsOn:'2027-01-22'},
    {title:'QA Mountain Systems',status:'withdrawn',startsOn:null,endsOn:null},
  ]);
  const reflection=fixture('self-assessment-reflection').sourceRead.records;
  assert.deepEqual(reflection,[{title:'QA Internship Reflection',status:'draft',notes:'QA reflection: Drafted a data-quality checklist.'}]);
  const list=fixture('self-assessment-no-note').sourceRead.records;
  assert.ok(!Object.hasOwn(list[0],'notes'));
  assert.ok(find('self-assessment-no-note').expected.forbiddenAccountMarkers.includes(reflection[0].notes));
  const reviews=fixture('contract-linked-review').sourceRead.records;
  assert.deepEqual(reviews,[
    {title:'QA Harbor Analytics',status:'filed',reviewStatus:'in_review',reviewState:'recorded'},
    {title:'QA Mountain Systems',status:'withdrawn',reviewStatus:null,reviewState:'not_requested'},
  ]);
  assert.deepEqual(fixture('company-review-zh').sourceRead.records.map(row=>row.reviewStatus),['open',null]);
  assert.doesNotMatch(JSON.stringify(reviews),/53010000|review_request_id|user_id|notes|date/iu);
});

test('empty, failed and denied fixtures encode different scope and availability',()=>{
  for(const suffix of ['contract','self-assessment','company','directory']){
    const row=find('empty-'+suffix);
    const {rows,sourceRead}=internshipNativeFixtureForCase(row);
    assert.ok(rows.some(item=>item.user_id===foreign&&item.record_type===sourceRead.recordType));
    assert.ok(rows.some(item=>item.user_id===owner&&item.record_type!==sourceRead.recordType));
    assert.equal(sourceRead.state,'empty');
    assert.equal(sourceRead.count,0);
    assert.deepEqual(sourceRead.records,[]);
    assert.deepEqual(row.expected.toolTerminalStates[tool],['complete']);
  }
  const failed=fixture('reader-failed').sourceRead;
  assert.equal(failed.state,'unavailable');
  assert.equal(failed.count,null);
  assert.deepEqual(failed.records,[]);
  assert.deepEqual(find('reader-failed').expected.requiredTools,[]);
  assert.deepEqual(find('reader-failed').expected.requiredAttemptedTools,[tool]);
  assert.deepEqual(find('reader-failed').expected.toolTerminalStates[tool],['unavailable','error']);
  for(const [suffix,reason]of [
    ['foreign-prefix','foreign_request'],['foreign-postfix','foreign_request'],['foreign-zh','foreign_request'],
    ['public-enterprises','unsupported_authority'],['subtype-conflict','ambiguous_selector'],
    ['official-submit','unsupported_operation'],['anonymous','sign_in_required'],
  ]){
    const row=find(suffix);
    assert.equal(row.observationExpectation.denial,reason);
    assert.equal(internshipNativeFixtureForCase(row).sourceRead,null);
    assert.equal(row.expected.noAction,true);
    assert.deepEqual(row.expected.requiredAttemptedTools,[]);
  }
  const bounded=find('filed-boundary');
  assert.deepEqual(bounded.observationExpectation.unresolvedFields,['officialReceipt']);
  assert.ok(bounded.expected.requiredText.some(item=>item.anyOf?.includes('does not prove submission')));
});

test('compound questions retain independent fee or course observations in both orders',()=>{
  for(const [before,after,source]of [['fees','fees-reversed','charges'],['next-class','next-class-reversed','courses']]){
    const first=find(before);
    const second=find(after);
    assert.notEqual(first.question,second.question);
    assert.deepEqual(first.observationExpectation,second.observationExpectation);
    assert.deepEqual(first.expected.allowedTools,[tool,source]);
    assert.deepEqual(first.expected.requiredSourceBindings.map(item=>item.sourceId),['account:internshipRecords','account:'+source]);
    const observed=internshipNativeFixtureForCase(first);
    assert.equal(observed.companion.sourceId,'account:'+source);
    assert.equal(observed.companion.state,'ok');
    assert.ok(observed.companion.records.length>0);
    assert.ok(titles(observed.sourceRead.records).length>0);
  }
  const partial=fixture('failed-companion');
  assert.equal(partial.sourceRead.state,'unavailable');
  assert.equal(partial.companion.records[0].remaining,23000);
  assert.deepEqual(find('failed-companion').expected.requiredTools,['charges']);
});

test('independent fixture lookup refuses unknown keys and yields isolated copies',()=>{
  const row=find('contract-list');
  assert.throws(()=>internshipNativeFixtureForCase({...row,fixtureKey:'offline:internship:invented'}),TypeError);
  assert.throws(()=>internshipNativeFixtureForCase({id:'unknown'}),TypeError);
  const first=internshipNativeFixtureForCase(row);
  first.sourceRead.records[0].title='Tampered';
  first.rows[0].notes='Injected';
  const second=internshipNativeFixtureForCase(row);
  assert.equal(second.sourceRead.records[0].title,'QA Harbor Analytics');
  assert.equal(second.rows[0].notes,'QA private contract note for the internship coordinator.');
});
