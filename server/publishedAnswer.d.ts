export type PublishedAnswer=Record<string,unknown>&{status:'answered';answer:string;activity:Array<{kind:string;label:string;detail:string;status:'complete'}>};
