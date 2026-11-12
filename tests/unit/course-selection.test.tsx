import assert from 'node:assert/strict';
import {test} from 'node:test';
import {courseSelectionPeriods,courseSelectionSchedule,courseSelectionYears,defaultCourseSelectionFilter,filterCourseSelection,type CourseSelectionRecord} from '../../src/services/courseSelection';

const row:CourseSelectionRecord={id:'one',userId:'owner',academicYear:115,semester:1,selectionPhase:'add_drop',termCourseCode:'LOCAL-ONE',courseTitle:'Synthetic course',requiredElectiveText:null,credits:0,instructorOne:null,remarkText:'Y(W)',rowOrder:1,timetableIncluded:true,meetings:[],sourceMode:'local_demo',version:1,createdAt:'2026-11-12T00:00:00Z',updatedAt:'2026-11-12T00:00:00Z'};
const filter={academicYear:115,semester:1,selectionPhase:'add_drop'} as const;
test('selection defaults use observed options and explicit own records only',()=>{
  assert.deepEqual(defaultCourseSelectionFilter([],'owner'),filter);
  const other={...row,userId:'other',academicYear:999};
  assert.deepEqual(courseSelectionYears([other],'owner'),[114,115,116]);
  const alternate={...row,academicYear:112,semester:3,selectionPhase:'summer1'} as const;
  assert.deepEqual(defaultCourseSelectionFilter([other,alternate],'owner'),{academicYear:112,semester:3,selectionPhase:'summer1'});
  assert.deepEqual(courseSelectionYears([alternate,other],'owner'),[112,114,115,116]);
  assert.deepEqual(defaultCourseSelectionFilter([alternate,row],'owner'),filter);
});
test('query preserves literal remarks and zero credits, exact phase, account and order',()=>{
  const records=[{...row,id:'z',rowOrder:0},row,{...row,id:'other',userId:'other'},{...row,id:'phase',selectionPhase:'initial'} as const,{...row,id:'term',semester:2} as const];
  assert.deepEqual(filterCourseSelection(records,'owner',filter).map(record=>record.id),['z','one']);
  assert.equal(filterCourseSelection(records,'owner',filter)[0].credits,0);
  assert.equal(filterCourseSelection(records,'owner',filter)[0].remarkText,'Y(W)');
  assert.deepEqual(records.map(record=>record.id),['z','one','other','phase','term'],'Filtering does not mutate snapshot order.');
});
test('timetable preserves fourteen source periods, multiple meetings and overlaps without duplicate cells',()=>{
  assert.deepEqual(courseSelectionPeriods.map(period=>period.key),['1','2','3','4','午','5','6','7','8','傍','A','B','C','D']);
  assert.equal(courseSelectionPeriods.at(-1)?.end,'21:55');
  const meeting={weekday:1,period:'1',room:'Room A'};
  const records=[{...row,meetings:[meeting,meeting,{...meeting,room:'Room B'},{weekday:7,period:'D',room:''}]},{...row,id:'overlap',rowOrder:2,meetings:[meeting]},
    {...row,id:'unscheduled'},{...row,id:'excluded',timetableIncluded:false},{...row,id:'other',userId:'other',meetings:[meeting]},
    {...row,id:'invalid-slot',meetings:[{weekday:8,period:'1',room:'Invalid'}]}];
  const result=courseSelectionSchedule(records,'owner',filter);
  assert.equal(result.entries.size,2);assert.equal(result.entries.get('1:1')?.length,2);
  assert.deepEqual(result.entries.get('1:1')?.[0].rooms,['Room A','Room B']);
  assert.equal(result.entries.get('7:D')?.[0].record.id,'one');
  assert.deepEqual(result.unscheduled.map(record=>record.id),['invalid-slot','unscheduled']);
  assert.equal([...result.entries.values()].flat().some(entry=>entry.record.userId!=='owner'),false);
});
