import type {VerificationCandidate,VerificationProgress} from './answerVerification.js';
import type {VenueRequestPlan} from './venueRequestIntent.js';
export function answerVenueRequests(options:{
  account:{url:string;key:string;token:string;user:{id:string}};
  question:string;route:string;history:Array<{role:string;content:string}>;asOf:number;deadline:number;
  plan:VenueRequestPlan;onProgress?:(step:VerificationProgress)=>void;
}):Promise<VerificationCandidate>;
