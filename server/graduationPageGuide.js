import {curriculumPlansPath,curriculumPrograms} from '../src/features/public/affairs/curriculumPlans.js';
import {graduationReviewPaths} from './graduationReview.js';

/** Navigation and schema capabilities, not a programme's graduation rules. */
export function graduationPageGuide(reportKind){
 if(!Object.hasOwn(graduationReviewPaths,reportKind))return null;
 return {
  curriculum:{url:curriculumPlansPath,selectors:['programme/degree type','department','admission academic year'],
   programmes:curriculumPrograms.map(({code,label})=>({code,label})),
   capability:'Directory of programme-, department- and year-specific curriculum documents. A listed document is not proof its contents were read or its download is currently available.'},
  review:{url:graduationReviewPaths[reportKind],reportKind,
   fields:['identity.curriculumCohortText','categories.requiredCredits','categories.requiredElectiveText','categories.requirements','categories.requirements.matchedCourses','languageRequirements','englishRequirement','graduationReview'],
   capability:'Compare explicitly recorded requirement categories, matched courses, language conditions and review status in the selected owned report. A missing field is unknown.'},
  interpretation:'Use the department, programme and entry-year curriculum that actually applies. Current year level does not establish entry cohort. Total credits alone do not establish completed compulsory subjects, language conditions or graduation eligibility. Current and legacy review reports are separate; do not substitute one for the other.',
 };
}
