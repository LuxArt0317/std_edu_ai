import type {AffairsAccount} from './affairsWorkspace.js';
import type {VerificationCandidate,VerificationProgress} from './answerVerification.js';
import type {LearningSupportQuestion} from './learningSupportAssistantIntent.js';
export function learningSupportGuest(selection:LearningSupportQuestion):VerificationCandidate;
export function answerLearningSupport(options:{account:AffairsAccount;selection:LearningSupportQuestion;question:string;
  deadline:number;onProgress?:(step:VerificationProgress)=>void}):Promise<VerificationCandidate>;
