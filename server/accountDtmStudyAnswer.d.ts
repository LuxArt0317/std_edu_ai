import type {AffairsAccount} from './affairsWorkspace.js';
import type {VerificationCandidate,VerificationProgress} from './answerVerification.js';
export type DtmStudySelection={kind:'term'|'role'|'notes'|'absence'|'next';courseId:string|null;term?:string;name?:string;date?:string};
export function dtmStudySelection(question:string,route:string):DtmStudySelection|null;
export function answerDtmStudyRecords(options:{account:AffairsAccount;selection:DtmStudySelection;question:string;route:string;deadline:number;
  onProgress?:(step:VerificationProgress)=>void}):Promise<VerificationCandidate>;
