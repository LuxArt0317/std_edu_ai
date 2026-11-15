import type {VerificationProgress} from './answerVerification.js';
import type {readElearningEvidence} from './accountElearningEvidence.js';

type Selection={question:string;enrollment:boolean;assignments:boolean;assignmentFirst:boolean};
export function selectExactElearningReply(question:string,route:string,history?:readonly unknown[]):Selection|null;
export function answerExactElearning(input:{account:Parameters<typeof readElearningEvidence>[0];question:string;route:string;
  plan:Selection;deadline:number;read?:typeof readElearningEvidence;onProgress?:(step:VerificationProgress)=>void}):Promise<Record<string,unknown>>;
