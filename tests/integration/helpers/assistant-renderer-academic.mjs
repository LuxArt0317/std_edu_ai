import assert from 'node:assert/strict';
import {normalizeCourseOffering} from '../../../server/courseCatalog.js';
import {parseSubstitutionResults} from '../../../server/courseSubstitution.js';
import {courseCatalogPath,newCourseOffering} from '../../../src/features/public/affairs/courseCatalogModel.js';
import {newCourseSyllabus} from '../../../src/features/public/affairs/courseSyllabusModel.js';
import {courseSubstitutionPath,substitutionTrack} from '../../../src/features/public/affairs/courseSubstitution.js';
import {curriculumDocument,curriculumPlansPath} from '../../../src/features/public/affairs/curriculumPlans.js';
import {fixtureIds as ids} from './assistant-renderer-inventory.mjs';

const selectedCourse = {...newCourseOffering(),id:ids.offering,version:1,published:true,
  course_code:'QA-CAT-101',course_name:'Renderer fixture catalog course',english_name:'Renderer course title',
  department_code:'01',department_name:'資訊管理系',classification_code:'IMU',admission_code:'1',admission_name:'四技日間部',
  instructor:'Renderer fixture instructor',credits:3,lecture_hours:3,
  syllabus:{...newCourseSyllabus(),objectives:'Renderer fixture selected syllabus objective.'}};
normalizeCourseOffering(selectedCourse);

const substitutionFilters = {year:'110',track:'1',department:'01'};
const substitution = {year:substitutionFilters.year,track:substitutionTrack(substitutionFilters.track),
  department:{code:substitutionFilters.department,name:'資訊管理系'},source:'snapshot',checkedOn:'2026-11-13'};
const previous = 'QAOLD01', replacement = 'QANEW01';
const courses = parseSubstitutionResults(`
  <div id="vdata"><table class="master">
  <caption>屆別：${substitution.year} 學制：${substitution.track} 開課單位：${substitution.department.name}</caption>
  <tbody><tr><td>${previous}</td><td>Renderer fixture old course</td><td>2</td><td></td></tr>
  <tr><td><table><tbody><tr><td>A</td><td>${replacement}</td><td>Renderer fixture replacement</td><td>2</td>
  <td>必修</td><td></td></tr></tbody></table></td></tr></tbody></table></div>`,substitution);

const planCode = '115101', plan = curriculumDocument(planCode);
assert.ok(plan);
export const curriculumPdfApiPath = '/api/affairs-data?scope=curriculum-plan&code='+planCode;
// A complete one-page PDF with a text stream and exact byte offsets for Chrome.
function documentBytes() {
  const stream = 'BT /F1 14 Tf 36 100 Td (Synthetic curriculum plan) Tj ET\n';
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 260 160] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    '<< /Length '+Buffer.byteLength(stream)+' >>\nstream\n'+stream+'endstream',
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = objects.map((object,index)=>{
    const offset = String(Buffer.byteLength(pdf)).padStart(10,'0');
    pdf += (index+1)+' 0 obj\n'+object+'\nendobj\n';
    return offset+' 00000 n \n';
  });
  const xref = Buffer.byteLength(pdf);
  pdf += 'xref\n0 6\n0000000000 65535 f \n'+offsets.join('')+'trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n'+xref+'\n%%EOF\n';
  return Buffer.from(pdf);
}
export const rendererCurriculumPdf = documentBytes();

export function rendererAcademicRead(url,authorization) {
  const scope = url.searchParams.get('scope');
  const query = Object.fromEntries(url.searchParams);
  if(scope==='catalog'&&url.searchParams.has('id')){
    assert.deepEqual(query,{scope,id:ids.offering});
    assert.match(authorization??'',/^Bearer /u);
    return {rows:[selectedCourse],total:1,can_manage:false,page:0,page_size:100,
      terms:[{value:selectedCourse.term_code,label:selectedCourse.term_label}]};
  }
  if(scope==='course-substitution'){
    assert.deepEqual(query,{scope,...substitutionFilters});
    assert.equal(authorization,undefined);
    return {...substitution,courses};
  }
  return null;
}

const catalogReadback = (selector,text)=>({scope:'catalog',selector,text});
const expectations = new Map([
  [courseCatalogPath+'?course='+ids.offering,catalogReadback('.catalog-detail tbody',selectedCourse.english_name)],
  [courseCatalogPath+'?syllabus='+ids.offering,catalogReadback('.syllabus-objectives tbody',selectedCourse.syllabus.objectives)],
  [curriculumPlansPath+'/plan/'+planCode,{scope:'curriculum-plan',selector:'iframe[title="'+plan.text+' 課程規劃 PDF"]',pdf:true}],
  [courseSubstitutionPath+'/results/110/1/01',{scope:'course-substitution',selector:'#course-'+previous,text:previous,
    disclose:'替代科目明細 '+previous,replacementSelector:'#course-'+previous+'-details',replacement}],
]);
export function rendererAcademicExpectation(path){return expectations.get(path);}
