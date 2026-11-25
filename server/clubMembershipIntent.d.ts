export const clubMembershipPath:string;
export type ClubMembershipSelection={reason:'foreign'}|{courses:boolean;courseFirst:boolean;partial:boolean;reason?:never};
export function clubMembershipSelection(question:string,route?:string):ClubMembershipSelection|null;
