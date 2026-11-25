import type { VerificationEvidence } from './answerVerification.d.ts';

export const housingBedPath: '/school-affairs/services/34-1';
export function housingBedGuide(question:string,context:{selection?:{reason?:string|null;fields:readonly string[];unsupported?:readonly string[]}|null;foreign?:boolean;excluded?:boolean;navigation?:boolean},signedIn?:boolean):{
  status:string;answer:string;citations:{chunkId:string;title:string;url:string;claim:string;sourceName:string}[];
  suggestedQuestions:string[];grounding:{source:string;webSearched:boolean};
};
export function formatHousingBedAnswer(source:VerificationEvidence,question:string,unsupported?:readonly string[]):{
  answer:string;views:{id:string;title:string;url:string;columns:string[];rows:string[][];total:number;checkedAt?:string;note:string}[];
};
