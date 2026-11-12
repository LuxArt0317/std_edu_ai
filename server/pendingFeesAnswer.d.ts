export function answerPendingFees(question:string,snapshot:Record<string,unknown>,route?:string,history?:Array<{role:string;content:string}>):{answer:string;title:string;url:string}|null;

export function isPendingFeeQuestion(question:string,route?:string,history?:Array<{role:string;content:string}>):boolean;
