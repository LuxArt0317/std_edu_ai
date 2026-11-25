export const clubEquipmentPath:string;
export const clubEquipmentRoute:RegExp;
type EquipmentField='status'|'pickup'|'return'|'items';
export type ClubEquipmentSelection={reason:null;id:string|null;latest:boolean;countOnly:boolean;status:string|null;fields:EquipmentField[]}
  | {reason:'foreign'|'excluded'|'action'|'navigation'|'detail'|'scope'|'mixed'};
export type ClubEquipmentPlan={selection:ClubEquipmentSelection;feeQuestion:string|null;feeFirst:boolean};
export function clubEquipmentPlan(question:string,route?:string,history?:Array<{role:string;content:string}>):ClubEquipmentPlan|null;
export function clubEquipmentBoundary(question:string,selection:ClubEquipmentSelection,signedIn:boolean):{
  status:string;answer:string;citations:Array<{chunkId:string;title:string;url:string}>;suggestedQuestions:string[];grounding:{source:string;webSearched:boolean};
};
