export type NativeAcademicEvidenceKey='academicGrades'|'graduationReview'|'academicAttendance';
export type NativeAcademicEvidenceScalar=string|number|boolean|null;
export type NativeAcademicEvidenceRow=Record<string,NativeAcademicEvidenceScalar>;
export type NativeAcademicEvidenceCoverage={
  scope:'loaded_owned_snapshot';callerPresent:boolean;historyCompleteness:'unknown';
  projectionPartial:boolean;suppressedValues:number;ownedReports?:number;multipleReports?:boolean;
  academicServicesReports?:number;legacyReports?:number;duplicateReportKind?:boolean;suppressedReportKinds?:number;
  currentTermSource?:'explicit_metadata';statisticsDerivedFromDetails?:false;detailRowsAreDateCount?:false;
};
export type NativeAcademicEvidenceCount={collection:string;availableRows:number;includedRows:number;partial:false};
type CollectionBase={coverage:NativeAcademicEvidenceCoverage[];counts:NativeAcademicEvidenceCount[]};
export type AcademicGradesEvidenceCollection=CollectionBase&{
  records:NativeAcademicEvidenceRow[];termSummaries:NativeAcademicEvidenceRow[];
  rankings:NativeAcademicEvidenceRow[];metadata:NativeAcademicEvidenceRow[];
};
export type GraduationReviewEvidenceCollection=CollectionBase&{
  reportMetadata:NativeAcademicEvidenceRow[];statuses:NativeAcademicEvidenceRow[];
  languageRequirements:NativeAcademicEvidenceRow[];categories:NativeAcademicEvidenceRow[];
  requirements:NativeAcademicEvidenceRow[];matchedCourses:NativeAcademicEvidenceRow[];otherCourses:NativeAcademicEvidenceRow[];
};
export type AcademicAttendanceEvidenceCollection=CollectionBase&{
  statistics:NativeAcademicEvidenceRow[];details:NativeAcademicEvidenceRow[];metadata:NativeAcademicEvidenceRow[];
};
export type NativeAcademicEvidenceCollection=AcademicGradesEvidenceCollection|GraduationReviewEvidenceCollection|AcademicAttendanceEvidenceCollection;
export function nativeAcademicCollection(snapshot:unknown,key:'academicGrades'):AcademicGradesEvidenceCollection;
export function nativeAcademicCollection(snapshot:unknown,key:'graduationReview'):GraduationReviewEvidenceCollection;
export function nativeAcademicCollection(snapshot:unknown,key:'academicAttendance'):AcademicAttendanceEvidenceCollection;
export function nativeAcademicCollection(snapshot:unknown,key:NativeAcademicEvidenceKey):NativeAcademicEvidenceCollection;
export function nativeAcademicCollection(snapshot:unknown,key:string):NativeAcademicEvidenceCollection|null;
