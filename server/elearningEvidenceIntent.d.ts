type History=Array<{role:string;content:string}>;
/** Own local enrollment or unavailable remote coursework; bare/named foreign subjects never select own rows. */
export function selectElearningEvidence(question:unknown,route?:string,history?:History):{enrollment:boolean;unsupported:boolean}|null;
export function isElearningEvidenceQuestion(question:unknown,route?:string,history?:History):boolean;
export function isForeignElearningRecordsQuestion(question:unknown,route?:string):boolean;
export function hasIndependentDtmWork(question:unknown,route?:string,history?:History):boolean;
/** Keeps independent service clauses after resolving shared remote-course noun qualifiers. */
export function independentElearningQuestion(question:unknown,route?:string,history?:History):string;
