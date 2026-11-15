import type {AffairsAccount} from './affairsWorkspace.js';
import type {GraduationReviewKind} from './graduationReview.js';
export function answerGraduationReviewStatus(options:{account:AffairsAccount;question:string;kind:GraduationReviewKind;deadline:number;
  onProgress?:(step:{kind:string;label:string;detail:string;status:'running'|'complete'|'unavailable'})=>void}):Promise<Record<string,unknown>>;
