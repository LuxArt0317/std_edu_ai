import type {AffairsAccount} from './affairsWorkspace.js';
import type {ElearningCatalogPageSelection} from './elearningCatalogPageIntent.js';
import type {ElearningMetadataSelection} from './elearningMetadataIntent.js';
import type {VerificationCandidate,VerificationProgress} from './answerVerification.js';

export function elearningCatalogBoundary(question:string,selection:ElearningCatalogPageSelection|null,signedIn:boolean):VerificationCandidate;
export function elearningMetadataBoundary(question:string,selection:ElearningMetadataSelection|null,signedIn:boolean):VerificationCandidate;
type PageAnswerOptions={account:AffairsAccount&{requestDeadline?:number};question:string;route:string;deadline:number;
  onProgress?:(step:VerificationProgress)=>void};
export function answerElearningCatalog(options:PageAnswerOptions):Promise<VerificationCandidate>;
export function answerElearningMetadata(options:PageAnswerOptions):Promise<VerificationCandidate>;
