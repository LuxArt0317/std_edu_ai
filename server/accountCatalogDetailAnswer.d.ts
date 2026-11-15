import type {VerificationCandidate,VerificationProgress} from './answerVerification.js';
import type {CatalogDetailSelection} from './catalogDetailIntent.js';
import type {SyllabusAccount} from './syllabusSearch.js';
export function catalogDetailGuestAnswer(question:string,selection:CatalogDetailSelection):VerificationCandidate;
export function answerCatalogDetail(options:{account:SyllabusAccount;question:string;selection:CatalogDetailSelection;deadline:number;
  onProgress?:(step:VerificationProgress)=>void}):Promise<VerificationCandidate>;
