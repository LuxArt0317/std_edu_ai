import assert from 'node:assert/strict';
import {test} from 'node:test';
import {graduationCategoryColumns,graduationDetailIds,graduationLanguageColumns,graduationOtherCourseColumns,graduationRequirementColumns,graduationReviewPath,graduationReviewTimestamp,ownGraduationReview,type GraduationActualCourse,type GraduationRequirement,type GraduationRequirementCategory,type GraduationReviewReport} from '../../src/services/graduationReview';

const actual:GraduationActualCourse={id:'match-one',sequenceText:null,title:'Synthetic matched course',credits:2.5,requiredElectiveText:null,yearText:'Local year',transferText:null};
const requirement:GraduationRequirement={id:'requirement-one',sequenceText:'R-A',title:'Synthetic requirement',moduleText:null,credits:0,requiredElectiveText:'Local required',yearText:null,transferText:null,indicator:'attention',matchedCourses:[actual]};
const category:GraduationRequirementCategory={id:'category-one',label:'Synthetic category',requiredElectiveText:null,requiredCredits:8,completedCredits:9,matchedCredits:7,excludedCredits:0,status:{text:'Stored review text',indicator:'passed'},requirements:[requirement],detailSubtotalCredits:2.5};
const report:GraduationReviewReport={id:'report-one',userId:'own-account',reportKind:'academic_services',sourceMode:'local_demo',version:1,createdAt:'2026-11-12T08:00:00Z',updatedAt:'2026-11-12T09:00:00Z',reportedAt:null,
  identity:{studentNumber:null,studentName:'Synthetic student',departmentName:null,yearText:null,enrollmentStatusText:null,curriculumCohortText:null,doubleMajorText:null,minorText:null},
  educationProgram:{text:'N',indicator:null},foreignLanguageCompletion:{text:'N',indicator:'attention'},englishRequirement:{text:null,indicator:null},graduationReview:{text:'Explicitly pending',indicator:'attention',note:'Synthetic report note'},
  languageRequirements:[{id:'language-one',label:'Synthetic language rule',status:{text:'Stored language text',indicator:null},requiredCredits:8,matchedCredits:0,missingCredits:null}],categories:[category],otherCourses:[actual],
};

test('graduation reports are scoped by authenticated owner before any identity or course data is selected',()=>{
  const other={...report,id:'other-report',userId:'another-account',identity:{...report.identity,studentName:'OTHER PRIVATE NAME'}};
  assert.equal(ownGraduationReview({reports:[other,report]},'own-account'),report);
  assert.equal(ownGraduationReview({reports:[other]},'own-account'),null);
  assert.equal(ownGraduationReview({reports:[report]},''),null);
  assert.equal(ownGraduationReview(undefined,'own-account'),null);
  assert.equal(ownGraduationReview(null,'own-account'),null);
});

test('modern and legacy reports coexist for one owner without cross-kind fallback or leaking another owner',()=>{
  const legacy:GraduationReviewReport={...report,id:'legacy-report',reportKind:'legacy',graduationReview:{...report.graduationReview,text:'Distinct legacy review'}};
  const foreignLegacy={...legacy,id:'foreign-legacy',userId:'another-account',identity:{...legacy.identity,studentName:'OTHER PRIVATE LEGACY NAME'}};
  const bundle={reports:[foreignLegacy,legacy,report]},before=JSON.stringify(bundle);
  assert.equal(ownGraduationReview(bundle,'own-account'),report,'The omitted selector deliberately means academic_services.');
  assert.equal(ownGraduationReview(bundle,'own-account','academic_services'),report);
  assert.equal(ownGraduationReview(bundle,'own-account','legacy'),legacy);
  assert.equal(ownGraduationReview({reports:[legacy]},'own-account'),null,'A legacy-only report must not populate the modern view.');
  assert.equal(ownGraduationReview({reports:[report]},'own-account','legacy'),null,'A modern-only report must not populate the legacy view.');
  assert.equal(ownGraduationReview({reports:[foreignLegacy]},'own-account','legacy'),null);
  assert.equal(ownGraduationReview(bundle,'','legacy'),null);assert.equal(JSON.stringify(bundle),before);
});

test('credit totals, unknown values and zero values retain their independent reported meaning',()=>{
  const saved=ownGraduationReview({reports:[report]},'own-account')!;
  assert.equal(saved.categories[0].requiredCredits,8);
  assert.equal(saved.categories[0].completedCredits,9);
  assert.equal(saved.categories[0].matchedCredits,7);
  assert.equal(saved.categories[0].excludedCredits,0);
  assert.equal(saved.categories[0].detailSubtotalCredits,2.5);
  assert.equal(saved.categories[0].requirements[0].credits,0);
  assert.equal(saved.languageRequirements[0].matchedCredits,0);
  assert.equal(saved.languageRequirements[0].missingCredits,null,'Missing credits are not inferred by subtracting the other fields.');
  assert.equal(saved.identity.studentNumber,null,'A student identifier is not invented from the account ID.');
});

test('literal statuses never imply an indicator or graduation eligibility',()=>{
  const saved=ownGraduationReview({reports:[report]},'own-account')!;
  assert.deepEqual(saved.educationProgram,{text:'N',indicator:null});
  assert.deepEqual(saved.foreignLanguageCompletion,{text:'N',indicator:'attention'});
  assert.deepEqual(saved.englishRequirement,{text:null,indicator:null});
  assert.equal(saved.categories[0].status.indicator,'passed','A reported passed category is retained even when its numeric fields differ.');
  assert.equal(saved.graduationReview.indicator,'attention','Category indicators do not compute the overall review.');
  assert.equal(saved.graduationReview.note,'Synthetic report note');
});

test('array order and repeated course matches are preserved across requirements and the other-course list',()=>{
  const saved={...report,categories:[{...category,requirements:[requirement,{...requirement,id:'requirement-two',sequenceText:'R-Z',matchedCourses:[actual]}]},{...category,id:'category-two',label:'Second synthetic category'}]};
  const before=JSON.stringify(saved),selected=ownGraduationReview({reports:[saved]},'own-account')!;
  assert.deepEqual(selected.categories.map(row=>row.id),['category-one','category-two']);
  assert.deepEqual(selected.categories[0].requirements.map(row=>row.sequenceText),['R-A','R-Z']);
  assert.equal(selected.categories[0].requirements[0].matchedCourses[0],actual);
  assert.equal(selected.categories[0].requirements[1].matchedCourses[0],actual);
  assert.equal(selected.otherCourses[0],actual,'An actual course also present in another section is not removed.');
  assert.equal(JSON.stringify(saved),before);
});

test('detail controls use stable category IDs and retain an explicitly reported zero subtotal',()=>{
  const saved={...report,categories:[{...category,id:'empty',requirements:[],detailSubtotalCredits:null},{...category,id:'zero-subtotal',requirements:[],detailSubtotalCredits:0},category]};
  assert.deepEqual(graduationDetailIds(saved),['zero-subtotal','category-one']);
  assert.deepEqual(graduationDetailIds({...saved,categories:[category,...saved.categories.slice(0,2)]}),['category-one','zero-subtotal']);
  assert.deepEqual(graduationDetailIds(null),[]);
});

test('reported timestamps never fall back to persistence timestamps; source labels preserve observed spelling',()=>{
  assert.equal(graduationReviewTimestamp(report.reportedAt),'—');
  assert.equal(graduationReviewTimestamp(undefined),'—');assert.equal(graduationReviewTimestamp('invalid'),'—');
  assert.equal(graduationReviewTimestamp('2026-11-12T08:01:02Z'),'2026/11/12 16:01:02');
  assert.equal(graduationReviewPath,'/school-affairs/services/13-1/graduation');
  assert.deepEqual(graduationLanguageColumns,['課程類別','是否通過','應修學分','符合學分','尚缺學分']);
  assert.deepEqual(graduationCategoryColumns,['編程名稱','必選修','應修學分','已修學分','符合學分','不計入此類學分','通過']);
  assert.deepEqual(graduationRequirementColumns,['#','應修習課程','模組','學分','必選修','年級','扺免']);
  assert.deepEqual(graduationOtherCourseColumns,['#','實際修習課程','學分','必選修','年級','抵免']);
});
