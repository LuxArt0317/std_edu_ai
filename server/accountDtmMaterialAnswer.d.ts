import type { DtmMaterialSelection } from './dtmMaterialIntent.js';
import type { VerificationCandidate, VerificationProgress } from './answerVerification.js';
import type { loadDtmCourseResource, loadDtmCourseMaterialList } from './dtmCourseResource.js';
export function answerDtmMaterial(options: {
  account: {url: string; key: string; token: string; user: {id: string}; requestDeadline?: number};
  selection: DtmMaterialSelection;
  question: string;
  deadline: number;
  onProgress?: (step: VerificationProgress) => void;
}, loaders?: {loadResource: typeof loadDtmCourseResource; loadMaterials: typeof loadDtmCourseMaterialList}): Promise<VerificationCandidate>;
