import type { FirstSelectionNotice } from '../src/features/public/affairs/firstSelection.js';
export function parseFirstSelectionNotice(rows: unknown): FirstSelectionNotice;
export function loadFirstSelectionNotice(options?: {fetchNotice?: typeof fetch}): Promise<FirstSelectionNotice>;
export function serveFirstSelectionNotice(request: {method?:string;query?:Record<string,unknown>},
  response: {setHeader(name:string,value:string):void;status(code:number):{json(body:unknown):void}}): Promise<void>;
