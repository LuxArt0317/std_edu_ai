import {buildInternshipNativeCases,internshipNativeManifest} from './internship-native-cases.mjs';

const requirement=internshipNativeManifest.fixtureRequirement;
const prefix='account:internship-native-';
const fixturePrefix='offline:internship:';
const legacyRequirement='legacy_internship_rebind';
const legacyIds=new Set(['account:internship-period',
  ...['record','empty','action-boundary'].map(mode=>'service:53-1:'+mode),
]);
const detail='Native internship cases require isolated caller-bound fixtures and independent request observations. This case was not executed.';

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
  return {registered:caseIds.length,liveEligible:0,observationsMounted:false,caseIds,legacyCaseIds:caseIds.filter(id=>legacyIds.has(id))};
}
