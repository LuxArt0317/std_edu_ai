import assert from 'node:assert/strict';
import {test} from 'node:test';
import {buildAccountCases} from './account-cases.mjs';
import {gradeCase} from './grading.mjs';

const bank=buildAccountCases();
const salaryPath='/school-affairs/services/37-1/salary',claimsPath='/school-affairs/services/37-1';
function caseWithFields(id){
  const item=structuredClone(bank.find(row=>row.id==='account:aid-payments-'+id));assert.ok(item);
  for(const fact of item.expected.facts||[]){
    if(!['2026-09 local period','2026-10 local period'].includes(fact.label))continue;
    assert.equal(fact.kind,'text');assert.deepEqual(fact.values,[fact.label]);
    assert.equal(fact.fields?.length,1);assert.equal(fact.fields[0].label,id==='salary-tax'?'tax':'net pay');
    const expected=id==='salary-tax'?(fact.label.startsWith('2026-09')?0:{anyOf:['not recorded','null','missing','no tax value']}):(fact.label.startsWith('2026-09')?5400:6200);
    assert.deepEqual(fact.fields[0].values,[expected]);
  }
  return item;
}
function envelope(item,answer){return {statusCode:200,execution:'recorded',fixtureKey:item.fixtureKey,
  events:[{kind:'account-read:aidPayments:1',status:'complete'}],body:{status:'answered',answer:'Saved local records.\n\n'+answer,
    verification:{status:'verified',attempts:1},citations:[{chunkId:'account:aidPayments',url:salaryPath},{chunkId:'account:aidPayments',url:claimsPath}]}};}
function passes(item,answer){const result=gradeCase(item,envelope(item,answer));assert.equal(result.passed,true,JSON.stringify(result.failures));}
function failsField(item,answer){const result=gradeCase(item,envelope(item,answer));assert.equal(result.passed,false,answer);assert.ok(result.failures.some(value=>/^fact\./u.test(value.id)),JSON.stringify(result));}

test('tax oracle accepts labelled literal zero and missing values in natural prose or indented fields',()=>{
  const item=caseWithFields('salary-tax');
  for(const answer of [
    '2026-09 local period: tax is 0.\n2026-10 local period: tax is not recorded.',
    '2026-09 local period: zero tax.\n2026-10 local period: tax: null.',
    '2026-09 local period: tax is 0.\n2026-10 local period: tax: no tax value recorded.',
    '- 2026-09 local period\n  - Tax: 0\n  - Net pay: 5400\n- 2026-10 local period\n  - Tax: missing\n  - Net pay: 6200',
    '2026-09 local period：所得稅：０。\n2026-10 local period：所得稅：null。',
    '2026-09 local period: your tax is 0. I cannot access another student’s records.\n2026-10 local period: tax is not recorded.',
    '2026-09 local period: tax is 0, not another student’s tax.\n2026-10 local period: tax is not recorded.',
  ])passes(item,answer);
});

test('tax oracle rejects opposite taxes, unrelated zero fields and values from another record',()=>{
  const item=caseWithFields('salary-tax');
  for(const answer of [
    '2026-09 local period: Net pay is 0; tax is 99.\n2026-10 local period: Tax is not recorded.',
    '2026-09 local period: rate: 0; tax is 99.\n2026-10 local period: tax: not recorded.',
    '2026-09 local period: tax is not recorded.\n2026-10 local period: tax is 0.',
    '2026-09 local period: tax is unknown; net pay is 0.\n2026-10 local period: tax: not recorded.',
    '2026-09 local period: rate 0. Another student: tax 0.\n2026-10 local period: tax: not recorded.',
    '2026-09 local period: tax 99; 2026-10 local period: tax 0, tax not recorded.',
    '2026-09 local period: tax 0.\n2026-09 local period: tax 99.\n2026-10 local period: tax null.',
    '2026-09 local period: tax 0 or 99.\n2026-10 local period: tax null.',
    '2026-09 local period: tax is not 0.\n2026-10 local period: tax null.',
    '2026-09 local period: not zero tax.\n2026-10 local period: tax null.',
    '2026-09 local period: tax 0 and tax 99.\n2026-10 local period: tax null.',
    '2026-09 local period: another student\'s tax is 0.\n2026-10 local period: tax is not recorded.',
    '2026-09 local period: another student’s tax is 0.\n2026-10 local period: tax is not recorded.',
    '2026-09 local period：其他學生的所得稅：0。\n2026-10 local period：所得稅：null。',
  ])failsField(item,answer);
});

test('net amount fields cannot receive credit from gross pay or an adjacent period',()=>{
  for(const id of ['salary-multipart','both']){
    const item=caseWithFields(id),prefix='Salary records: 2.\nReason: Library work-study materials.\n';
    passes(item,prefix+'2026-09 local period: net pay: 5,400; gross: 5800.\n2026-10 local period: net: 6,200; gross: null.');
    for(const answer of [
      '2026-09 local period: gross pay 5400; net pay 99.\n2026-10 local period: gross pay 6200; net pay 99.',
      '2026-09 local period: net pay 6200.\n2026-10 local period: net pay 5400.',
      '2026-09 local period: gross 5400.\nAnother student: net pay 5400.\n2026-10 local period: net pay 6200.',
      '2026-09 local period: net pay 5400.\n2026-09 local period: net pay 5401.\n2026-10 local period: net pay 6200.',
    ])failsField(item,prefix+answer);
  }
});

test('bounded Markdown tables bind each named field to its own header and record cell',()=>{
  const item=caseWithFields('salary-tax');
  passes(item,'| Payment period | Net pay | Tax |\n|---|---:|---:|\n|2026-09 local period|5400|0|\n|2026-10 local period|6200|not recorded|');
  passes(item,'| Tax | Payment period |\n|---|---|\n|0|2026-09 local period|\n|null|2026-10 local period|');
  passes(item,'| Payment period | Account | Tax |\n|---|---|---|\n|2026-09 local period|Your account|0|\n|2026-10 local period|Your account|not recorded|');
  for(const answer of [
    '| Payment period | Net pay | Tax |\n|---|---:|---:|\n|2026-09 local period|0|99|\n|2026-10 local period|6200|not recorded|',
    '| Payment period | Gross |\n|---|---|\n|2026-09 local period|0|\n|2026-10 local period|not recorded|',
    '| Payment period | Tax | Tax |\n|---|---|---|\n|2026-09 local period|0|99|\n|2026-10 local period|null|99|',
    '| Payment period | Tax |\n|---|---|\n|2026-09 local period and 2026-10 local period|0|',
    '|2026-09 local period|0|\n|2026-10 local period|not recorded|',
    '| Payment period | Account | Tax |\n|---|---|---|\n|2026-09 local period|Another student|0|\n|2026-10 local period|Your account|not recorded|',
    '| Tax | Owner | Payment period |\n|---|---|---|\n|0|Other account|2026-09 local period|\n|null|Your account|2026-10 local period|',
  ])failsField(item,answer);
});

test('missing, malformed and forged-link field evidence fails closed while legacy facts stay unchanged',()=>{
  const item=caseWithFields('salary-tax'),valid='2026-09 local period: tax 0.\n2026-10 local period: tax null.';
  for(const fields of [[],null,[{label:'tax',kind:'number',values:[]}],[{label:'tax',kind:'unknown',values:[0]}]]){
    const changed=structuredClone(item);changed.expected.facts[0].fields=fields;failsField(changed,valid);
  }
  failsField(item,'2026-09 local period: [details](https://stu.best/?tax=0).\n2026-10 local period: tax null.');
  const original=structuredClone(item);for(const fact of original.expected.facts)delete fact.fields;
  passes(original,'2026-09 local period: Net pay is 0; tax is 99.\n2026-10 local period: Tax is not recorded.');
});

test('foreign account case allows only the account boundary event, no aid reads or own data',()=>{
  const item=bank.find(row=>row.id==='account:aid-payments-foreign');assert.ok(item);
  const denied={statusCode:200,execution:'recorded',fixtureKey:item.fixtureKey,events:[{kind:'account-access',status:'complete'}],
    body:{status:'handoff',answer:'I can only check your signed-in stu.best account. I can’t show another student’s salary or aid claim records.',citations:[]}};
  assert.equal(gradeCase(item,denied).passed,true);
  assert.equal(gradeCase(item,{...denied,events:[...denied.events,{kind:'account-read:aidPayments:1',status:'complete'}]}).passed,false);
  assert.equal(gradeCase(item,{...denied,body:{...denied.body,answer:denied.body.answer+' 2026-09 local period.'}}).passed,false);
});

test('native DTM report telemetry is registered independently from tracker grades',()=>{
  const item={id:'native-dtm-reader',mode:'record',expected:{behavior:'answer',requiredTools:['dtmGradeReport'],allowedTools:['dtmGradeReport'],requireToolExecution:true,
    facts:[{label:'feedback',kind:'text',values:['Review examples']} ]}};
  const value={statusCode:200,execution:'recorded',events:[{kind:'account-read:dtmGradeReport:1',status:'complete'}],
    body:{status:'answered',answer:'Feedback: Review examples.',verification:{status:'verified',attempts:1},citations:[{chunkId:'account:dtmGradeReport',url:'/dtm/grades'}]}};
  assert.equal(gradeCase(item,value).passed,true);
  assert.equal(gradeCase(item,{...value,events:[{kind:'account-read:dtm:1',status:'complete'}]}).passed,false);
});
