import type {StudentConductScope} from './studentConductEvidenceScope.js';
export function studentConductGuide(question:string,scope:StudentConductScope,signedIn:boolean):{status:'answered'|'handoff';answer:string;
  citations:Array<{chunkId:string;title:string;url:string;claim:string;sourceName:string;locator:null;effectiveAt:null;reviewedAt:null}>;
  suggestedQuestions:string[];grounding:{source:'directory';webSearched:false};};
