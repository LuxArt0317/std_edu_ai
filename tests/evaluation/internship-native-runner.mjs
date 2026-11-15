import {buildInternshipNativeCases,internshipNativeManifest} from './internship-native-cases.mjs';

const requirement=internshipNativeManifest.fixtureRequirement;
const prefix='account:internship-native-';
const fixturePrefix='offline:internship:';
const legacyRequirement='legacy_internship_rebind';
const legacyIds=new Set(['account:internship-period',
  ...['record','empty','action-boundary'].map(mode=>'service:53-1:'+mode),
]);
const protectedIds=new Set(buildInternshipNativeCases()
  .filter(row=>!row.observationExpectation.companion&&row.observationExpectation.read?.state!=='unavailable').map(row=>row.id));
const detail='The general evaluator cannot attest internship requests. Use the isolated protected operator for its mounted cases.';
export const internshipCaseHasProtectedBinding=testCase=>protectedIds.has(testCase?.id);

export function internshipRunnerCases(){
  return buildInternshipNativeCases().map(row=>{
    const expected=row.auth==='anonymous'?{...row.expected,
      requiredLinks:['/school-affairs/login?next='+encodeURIComponent(row.route)]}:row.expected;
    return {...row,expected,coveredTools:expected.requiredAttemptedTools};
  });
}

export function markLegacyInternshipFixture(testCase){
  if(!legacyIds.has(testCase?.id))return testCase;
  return {...testCase,fixtureRequirement:legacyRequirement,
    fixtureSetupDetail:'The original internship question and oracle are preserved. The old broad service-record fixture needs scoped reader binding or separate unresolved-capability evaluation.'};
}

export function nativeInternshipSetupRequired(testCase){
  return testCase?.fixtureRequirement===requirement||testCase?.fixtureRequirement===legacyRequirement
    ||legacyIds.has(testCase?.id)||typeof testCase?.id==='string'&&testCase.id.startsWith(prefix)
    ||typeof testCase?.fixtureKey==='string'&&testCase.fixtureKey.startsWith(fixturePrefix);
}

export function assertNativeInternshipCaseReady(testCase){
  if(nativeInternshipSetupRequired(testCase))
    throw Object.assign(new Error(detail),{code:'internship_fixture_and_observation_unmounted'});
}

export function internshipSetupSummary(cases){
  const caseIds=cases.filter(nativeInternshipSetupRequired).map(row=>row.id);
  const protectedCaseIds=caseIds.filter(id=>protectedIds.has(id));
  return {registered:caseIds.length,liveEligible:0,observationsMounted:false,protectedEligible:protectedCaseIds.length,
    protectedCaseIds,caseIds,legacyCaseIds:caseIds.filter(id=>legacyIds.has(id))};
}
