import assert from 'node:assert/strict';
import {test} from 'node:test';
import {scholarshipApplicantLabel,scholarshipDate,scholarshipPeriodState,type ScholarshipPeriod} from '../../src/services/scholarship';

const period:ScholarshipPeriod={id:'local-period',termLabel:'Local demonstration',opensAt:'2026-11-12T00:00:00Z',
  closesAt:'2026-11-13T00:00:00Z',published:true,instructions:'',sourceMode:'local_demo',version:1};
test('scholarship availability includes opening and excludes the exact closing instant',()=>{
  assert.equal(scholarshipPeriodState(period,Date.parse(period.opensAt)-1),'upcoming');
  assert.equal(scholarshipPeriodState(period,Date.parse(period.opensAt)),'open');
  assert.equal(scholarshipPeriodState(period,Date.parse(period.closesAt)-1),'open');
  assert.equal(scholarshipPeriodState(period,Date.parse(period.closesAt)),'closed');
  assert.equal(scholarshipPeriodState({...period,published:false},Date.parse(period.opensAt)),'draft');
});
test('scholarship application dates consistently render Taipei time',()=>{
  assert.match(scholarshipDate(period.opensAt),/2026.*11.*12.*08:00/);
  assert.match(scholarshipDate('2026-11-12T17:30:00Z'),/2026.*11.*13.*01:30/);
});
test('scholarship manager distinguishes duplicate names with the account email or stable ID',()=>{
  const one=scholarshipApplicantLabel({user_id:'student-one',display_name:'Alex Chen',email:'one@example.invalid'});
  const two=scholarshipApplicantLabel({user_id:'student-two',display_name:'Alex Chen',email:'two@example.invalid'});
  assert.equal(one,'Alex Chen (one@example.invalid)');
  assert.equal(two,'Alex Chen (two@example.invalid)');
  assert.notEqual(one,two);
  assert.equal(scholarshipApplicantLabel({user_id:'stable-student-id',display_name:'Alex Chen',email:''}),'Alex Chen (stable-student-id)');
});
