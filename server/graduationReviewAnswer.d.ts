import type {AffairsAccount} from './affairsWorkspace.js';
import type {GraduationReviewAnswerSelection} from './graduationReview.js';
export function answerGraduationReview(options:{account:AffairsAccount;question:string;selection:GraduationReviewAnswerSelection;deadline:number;
  onProgress?:(step:{kind:string;label:string;detail:string;status:'running'|'complete'|'unavailable'})=>void}):Promise<Record<string,unknown>>;
