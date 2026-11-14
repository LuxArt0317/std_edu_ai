import type {DtmGradeReportData,DtmGradeReportOverviewData} from '../../server/dtmGradeReport.js';

export type DtmNativeRouteFixtureMode='normal'|'full'|'absent'|'empty'|'failed';
export interface DtmNativeRouteCase {
  id:string;domain:'dtmGradeReport';route:string;question:string;language:'en';mode:'record';
  history:Array<{role:string;content:string}>;fixtureKey:string;fixtureRequirement:string;
  mounted:false;setupEligible:false;expected:Record<string,unknown>;
  nativeExpectation:{fixture:DtmNativeRouteFixtureMode;view:'overview'|'report'|'choose_course'|null;
    read:'ok'|'empty'|'unavailable'|null;reportCalls:number;overviewCalls:number};
}
export const dtmNativeRouteManifest:Readonly<{
  version:1;baseRevision:string;mounted:false;liveReady:false;modelAcceptance:false;
  sourceId:'account:dtmGradeReport';ownerId:string;foreignOwnerId:string;courseId:string;
  fixtureModes:readonly DtmNativeRouteFixtureMode[];sourceContracts:readonly string[];limitations:readonly string[];
  inventory:readonly {routes:readonly string[];source:string;fixture:string;coverage:string}[];
}>;
export function dtmNativeRouteFixture(mode?:DtmNativeRouteFixtureMode):{
  ownerId:string;foreignOwnerId:string;overview:DtmGradeReportOverviewData;report:DtmGradeReportData;
  foreignMarker:string;trackerMarker:string;
};
export function buildDtmNativeRouteCases():readonly DtmNativeRouteCase[];
export function gradeDtmNativeRouteCase(testCase:DtmNativeRouteCase,envelope:unknown,observation:unknown):{
  passed:boolean;failures:Array<{id:string;detail:string}>;modelAcceptance:false;liveAcceptance:false;execution:'mocked';
};
