import type {HousingApplicationLookupContext} from './housingApplicationEvidenceIntent.js';
import type {VerificationEvidence} from './answerVerification.js';
export function housingApplicationGuide(question:string,context:HousingApplicationLookupContext,signedIn?:boolean):{status:string;answer:string;citations:unknown[];suggestedQuestions:never[];grounding:{source:string;webSearched:boolean}};
export function formatHousingApplicationAnswer(source:VerificationEvidence,question:string):{answer:string;views:Array<{id:string;title:string;url:string;columns:string[];rows:string[][];total:number;checkedAt:string;note:string}>};
