import type {VerificationCandidate,VerificationProgress} from './answerVerification.js';
import type {GuidanceVerificationContext} from './answerVerificationModel.js';
export type SavedPublicSourceContext=Omit<GuidanceVerificationContext,'candidate'>&{candidate?:VerificationCandidate};
export function composeSavedPublicSource(context:SavedPublicSourceContext,dependencies:{
 compose:(context:SavedPublicSourceContext)=>Promise<VerificationCandidate>;
 repair:(context:GuidanceVerificationContext)=>Promise<VerificationCandidate>;
 onActivity?:(event:VerificationProgress)=>void;
 now?:()=>number;
}):Promise<VerificationCandidate>;
