export const repairPaths:{report:string;history:string;manage:string};
export type RepairStatus='submitted'|'in_progress'|'resolved'|'cancelled';
export const repairStatuses:Record<RepairStatus,[string,string]>;
export function repairId(value:unknown):value is string;
export function repairQuestion(question:string):'network'|'history'|'report'|null;
