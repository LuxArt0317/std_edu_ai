import type {TeachingFeedbackClarificationReason} from './teachingFeedbackEvidenceIntent.js';
type View='survey'|'immediate';
type Reason='foreign_request'|'unsupported_operation'|'invalid_route'|'ambiguous_selector'|'outside_scope';
export function teachingFeedbackGuide(question:string,options?:{views?:readonly View[];navigation?:View|readonly View[]|null;reason?:Reason|null;signedIn?:boolean;excluded?:boolean;returnToService?:boolean}):{
  status:'answered'|'handoff'|'clarification';answer:string;citations:Array<{chunkId:string;title:string;url:string;claim:string;sourceName:string;locator:null;effectiveAt:null;reviewedAt:null}>;
  suggestedQuestions:string[];grounding:{source:'directory';webSearched:false};
};

export function teachingFeedbackClarification(question:string,reason:TeachingFeedbackClarificationReason):ReturnType<typeof teachingFeedbackGuide>;
