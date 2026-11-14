import type {AidPaymentView} from './aidPaymentsContract.js';
import type {AidPaymentsEvidenceSelection} from './aidPaymentsEvidenceIntent.js';

type Scope={selection:AidPaymentsEvidenceSelection|null;foreign:boolean;excluded:boolean};
export function aidPaymentsUnsupportedAction(question:string,scope:Scope&{otherQuestion:string}):'document'|'write'|null;
export function aidPaymentsGuide(question:string,scope:Scope,navigation?:AidPaymentView|null):{
  status:'answered'|'handoff'|'clarification';answer:string;citations:Array<{chunkId:string;title:string;url:string;claim:string;sourceName:string;locator:null;effectiveAt:null;reviewedAt:null}>;
  suggestedQuestions:string[];grounding:{source:'directory';webSearched:false};
};
export function aidPaymentsCapabilityGuide(question:string,scope:Scope,action:'document'|'write'):ReturnType<typeof aidPaymentsGuide>;
