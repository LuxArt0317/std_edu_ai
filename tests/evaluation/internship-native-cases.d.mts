type View='contract'|'self_assessment'|'company'|'directory';
type Field='title'|'status'|'startsOn'|'endsOn'|'notes'|'reviewStatus';
type RecordType=Exclude<View,'directory'>;
type Companion='charges'|'courses';
type ReadState='ok'|'empty'|'unavailable';

interface SourceRead {
  serviceKey:'internship';
  view:View;
  recordType:RecordType;
  fields:readonly Field[];
  state:ReadState;
}

interface CaseInput {
  id:string;
  fixtureKey:string;
  question:string;
  route:string;
  history:Array<{role:string;content:string}>;
  auth:'anonymous'|'signed-in';
  observationExpectation:{read:SourceRead|null;companion:Companion|null;denial:string|null;unresolvedFields:readonly string[]};
}

interface StorageRow {
  id:string;
  user_id:string;
  service_key:string;
  record_type:string;
  title:string;
  status:string;
  starts_on:string|null;
  ends_on:string|null;
  notes:string;
  review_request_id:string|null;
  updated_at:string;
}

export const internshipNativeManifest:Readonly<{owners:Readonly<{A:string;B:string}>;asOf:string}>;
export function buildInternshipNativeCases():readonly CaseInput[];
export function internshipNativeFixtureForCase(candidate:Pick<CaseInput,'id'|'fixtureKey'>):{
  asOf:string;
  owners:{A:string;B:string};
  rows:StorageRow[];
  requests:Array<{id:string;user_id:string;status:string}>;
  sourceRead:(SourceRead&{ownerId:string;records:Array<{title:string}&Partial<Record<Field,string|null>>>;count:number|null})|null;
  companion:unknown;
  forbidden:string[];
};
