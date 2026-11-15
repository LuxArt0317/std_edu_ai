export const serviceNoteKeys: readonly string[];
export type ServiceNoteLookup = {keys:string[];noteQuestion:string;otherQuestion:string;foreign:boolean;excluded:boolean;invalidService:boolean;statusOnly:boolean;
  officialOnly:boolean;operation:boolean;boundaryKeys:string[]};
export function serviceNoteLookup(question:string,route?:string,history?:Array<{role:string;content:string}>):ServiceNoteLookup;
export function serviceNotePageNavigation(question:string,route?:string):string|null;
export function isServiceNoteEvidenceQuestion(question:string,route?:string,history?:Array<{role:string;content:string}>):boolean;
export function isServiceNoteNextClass(value:string):boolean;
