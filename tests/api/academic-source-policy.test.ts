import test from 'node:test';import assert from 'node:assert/strict';
import {academicSourceRecords,academicSourceViews} from '../../server/academicSourcePolicy.js';
test('temporary subjects and practice scores are excluded; actual captured DTM and unrelated records retained',()=>{
 const input={courses:[{code:'SAMP101',sourceMode:'sample'},{code:'REAL',sourceMode:'verified',grades:[{score:8,sourceMode:'sample'},{score:85,sourceMode:'verified'}]}],dtm:{courses:[{id:'seed',source_mode:'sample'},{id:'92665',title:'Operating Systems',gradeText:'-',sourceMode:'personal'}]},charges:[{sourceMode:'sample',amountDue:1}]};
 const result=academicSourceRecords(input);assert.equal(result.courses.length,1);assert.equal(result.courses[0].grades?.length,1);assert.equal(result.dtm.courses.length,1);assert.equal(result.dtm.courses[0].id,'92665');assert.equal(result.charges.length,1);assert.equal(input.courses.length,2);
});
test('restored sample subject tables are hidden while literal actual grade rows remain',()=>{
 const views=[{id:'courses',columns:['Subject','Data'],rows:[['SAMP101 Orientation','sample']],total:5},{id:'dtm',columns:['Course','Data'],rows:[['Operating Systems','personal']],total:1}];const result=academicSourceViews(views);assert.equal(result.length,1);assert.equal(result[0].rows[0][0],'Operating Systems');
});
