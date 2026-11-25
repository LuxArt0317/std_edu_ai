export type LearningPlatform='dtm'|'elearning';
export type LearningEntryRoute={context:string;platform:LearningPlatform;kind:string;destination:string;guest:string};
export type LearningEntrySelection=LearningEntryRoute&{topic:'credentials'|'destination'|'login'};
export function learningLoginReturn(platform:LearningPlatform,value:unknown):string;
export function learningLoginReturnFromQuery(platform:LearningPlatform,search:string):string;
export function legacyDtmWorkspacePath(pathname:unknown):string|null;
export function legacyElearningDestination(pathname:string,search:string):string;
export function learningEntryRoute(route:unknown):LearningEntryRoute|null;
export function learningEntryIntent(question:unknown,route:unknown):LearningEntrySelection|null;
export function answerLearningEntry(question:string,selection:LearningEntrySelection,signedIn:boolean):{
  status:'answered';answer:string;citations:Array<{chunkId:string;title:string;url:string;sourceName:string}>;suggestedQuestions:string[];
  grounding:{source:'directory';webSearched:false};
};
