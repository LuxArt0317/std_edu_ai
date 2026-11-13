import assert from 'node:assert/strict';
import {test} from 'node:test';
import {academicGradeLinks,academicGradeMetadata,academicGradePaths,academicGradeRankings,academicGradeTermLabel,academicGradeTerms,academicGradeTimestamp,academicGradeYearLabel,academicRankingColumns,academicTranscriptColumns,academicWarningColumns,academicWarningSummaryLabels,academicWarningTerm,ownAcademicGrades,type AcademicGradeRecord,type AcademicGradesRecords,type AcademicGradeTermSummary} from '../../src/services/academicGrades';

const base={id:'record-one',userId:'own-account',sourceMode:'local_demo' as const,version:1,createdAt:'2026-11-12T10:00:00Z',updatedAt:'2026-11-12T10:00:00Z'};
const row:AcademicGradeRecord={...base,recordKind:'transcript',academicYear:115,semester:1,courseTitle:'Synthetic course only',courseCode:null,categoryText:'LOCAL-CATEGORY',moduleName:null,requiredElectiveText:'必',credits:0,gradeText:'P',remarkText:null,rowOrder:1};
const summary:AcademicGradeTermSummary={...base,id:'summary-one',summaryKind:'transcript',academicYear:115,semester:1,earnedCredits:null,averageGradeText:null,attemptedCredits:null,passedCredits:null,failedCredits:null};
const empty:AcademicGradesRecords={records:[],termSummaries:[],rankings:[],metadata:[]};

test('academic views own-scope every collection, including summaries, rankings and metadata',()=>{
  const data:AcademicGradesRecords={records:[row,{...row,id:'private-course',userId:'other-account',courseTitle:'OTHER COURSE'}],termSummaries:[summary,{...summary,id:'private-summary',userId:'other-account',earnedCredits:999}],
    rankings:[{...base,id:'private-ranking',userId:'other-account',academicYear:999,semester:1,departmentRankingText:'OTHER RANK',classRankingText:'OTHER CLASS'}],
    metadata:[{...base,id:'private-metadata',userId:'other-account',classLabel:'OTHER CLASS',englishRequirementText:'OTHER STATUS'}]};
  const own=ownAcademicGrades(data,'own-account');
  assert.deepEqual(own.records,[row]);assert.deepEqual(own.termSummaries,[summary]);assert.deepEqual(own.rankings,[]);assert.deepEqual(own.metadata,[]);
  assert.deepEqual(ownAcademicGrades(data,''),empty);assert.deepEqual(ownAcademicGrades(undefined,'own-account'),empty);
});
test('transcript groups ascending terms and row order without deriving averages or earned credits',()=>{
  const data:AcademicGradesRecords={...empty,records:[row,{...row,id:'earlier',academicYear:114,semester:2,rowOrder:3,credits:2.5,gradeText:'棄選'},{...row,id:'first',rowOrder:0,gradeText:'<script>literal text</script>'},
    {...row,id:'warning',recordKind:'warning',courseCode:'LOCAL-WARNING'}],termSummaries:[summary,{...summary,id:'summary-only',academicYear:116,earnedCredits:0,averageGradeText:'0.00'}]};
  const groups=academicGradeTerms(data,'own-account','transcript');
  assert.deepEqual(groups.map(group=>[group.academicYear,group.semester]),[[114,2],[115,1],[116,1]]);
  assert.deepEqual(groups[1].records.map(record=>record.id),['first','record-one']);
  assert.equal(groups[0].summary,null,'No summary is synthesized from course rows.');
  assert.equal(groups[1].summary?.earnedCredits,null);assert.equal(groups[1].summary?.averageGradeText,null);
  assert.equal(groups[2].records.length,0);assert.equal(groups[2].summary?.earnedCredits,0);assert.equal(groups[2].summary?.averageGradeText,'0.00');
  assert.equal(groups[0].records[0].gradeText,'棄選');assert.equal(groups[1].records[1].credits,0);assert.equal(groups[1].records[0].gradeText,'<script>literal text</script>');
  assert.deepEqual(data.records.map(record=>record.id),['record-one','earlier','first','warning'],'Rendering order never mutates snapshot data.');
});
test('warning selects latest own warning term, preserves explicit totals and ignores transcript summary',()=>{
  const warning={...row,recordKind:'warning',courseCode:'LOCAL-WARNING'} as const;
  const data:AcademicGradesRecords={...empty,records:[warning,{...warning,id:'old',academicYear:114},{...warning,id:'other',userId:'other-account',academicYear:999}],
    termSummaries:[{...summary,earnedCredits:99},{...summary,id:'warning-summary',summaryKind:'warning',attemptedCredits:7.5,passedCredits:0,failedCredits:null}]};
  const term=academicWarningTerm(data,'own-account');
  assert.equal(term?.academicYear,115);assert.equal(term?.records.length,1);assert.equal(term?.summary?.attemptedCredits,7.5);assert.equal(term?.summary?.passedCredits,0);assert.equal(term?.summary?.failedCredits,null);
  assert.equal(academicWarningTerm({...empty,records:[row],termSummaries:[summary]},'own-account'),null);
  assert.deepEqual(academicWarningSummaryLabels,['總修習學分數','及格學分數','不及格學分數']);
});
test('rankings remain literal and descending; missing metadata remains unknown',()=>{
  const rank={...base,academicYear:115,semester:1 as const,departmentRankingText:'Synthetic rank 2 (percentile unpublished)',classRankingText:null};
  const data:AcademicGradesRecords={...empty,rankings:[rank,{...rank,id:'later',semester:2},{...rank,id:'earlier',academicYear:114}],
    metadata:[{...base,id:'old',classLabel:'Old local class',englishRequirementText:null},{...base,id:'updated',version:2,classLabel:null,englishRequirementText:'Explicit local status'}]};
  assert.deepEqual(academicGradeRankings(data,'own-account').map(record=>record.id),['later','record-one','earlier']);
  assert.equal(academicGradeRankings(data,'own-account')[0].departmentRankingText,rank.departmentRankingText);
  assert.equal(academicGradeMetadata(data,'own-account')?.classLabel,null);assert.equal(academicGradeMetadata(data,'own-account')?.englishRequirementText,'Explicit local status');assert.equal(academicGradeMetadata(data,'different-account'),null);
});
test('captured headers and local navigation are separate from university student identifiers',()=>{
  assert.deepEqual(academicTranscriptColumns,['選課時間','科目名稱','類別','模組名稱','必選修','學分數','成績']);
  assert.deepEqual(academicWarningColumns,['課程代碼','課程名稱','學分數','成績','備註']);assert.deepEqual(academicRankingColumns,['學年','學期','系排名','班排名']);
  assert.equal(academicGradeLinks.length,7);for(const link of academicGradeLinks)assert.ok(academicGradePaths[link.view].startsWith('/school-affairs/services/13-1/'));
  assert.equal(academicGradePaths.current,'/school-affairs/services/13-1/current');assert.equal(academicGradePaths.graduation,'/school-affairs/services/13-1/graduation');
  assert.equal(academicGradeTermLabel(115,1),'115學年度第一學期');assert.equal(academicGradeTermLabel(115,3),'115學年度暑期');
  assert.equal(academicGradeYearLabel(undefined),'—');assert.equal(academicGradeYearLabel(4),'四');
  assert.equal(academicGradeTimestamp('2026-11-12T10:00:00Z'),'2026/11/12 18:00:00');assert.equal(academicGradeTimestamp('invalid'),'—');assert.equal(academicGradeTimestamp(undefined),'—');
});
