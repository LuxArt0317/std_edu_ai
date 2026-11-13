import type { AdjustmentRow } from './courseAdjustmentContract.js';
import type { verifyAffairsToken } from './affairsWorkspace.js';
type Account = Awaited<ReturnType<typeof verifyAffairsToken>> & { requestDeadline?:number };
export function serveAdjustmentNotice(request:{method?:string;query?:Record<string,unknown>},response:{setHeader(name:string,value:string):void;status(code:number):{json(value:unknown):void}}):Promise<void>;
export function readAdjustmentScope(account:Account,query:Record<string,unknown>):Promise<unknown>;
export function changeAdjustment(account:Account,payload:unknown):Promise<AdjustmentRow>;
