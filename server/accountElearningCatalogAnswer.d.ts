import type {AffairsAccount} from './affairsWorkspace.js';
import type {ElearningCatalogPageSelection} from './elearningCatalogPageIntent.js';
import type {VerificationCandidate,VerificationProgress} from './answerVerification.js';

export function elearningCatalogBoundary(question:string,selection:ElearningCatalogPageSelection|null,signedIn:boolean):VerificationCandidate;
export function answerElearningCatalog(options:{account:AffairsAccount&{requestDeadline?:number};question:string;route:string;
  deadline:number;onProgress?:(step:VerificationProgress)=>void}):Promise<VerificationCandidate>;
