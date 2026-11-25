import type {DtmGradeReportData, DtmGradeReportOverviewData} from '../../server/dtmGradeReport.js';
import type {DtmNativeRouteCase} from './dtm-native-route-cases.mjs';

type FixtureRole = 'A' | 'B';
type FixtureOwner = {id: string; email: string; runMarker: string};
type CourseBinding = Pick<DtmGradeReportOverviewData['courses'][number], 'id' | 'code' | 'title' | 'term'>;

interface DtmGradeReportPreviewFixture {
  plans: Record<string, {
    courseBindings: Record<FixtureRole, CourseBinding>;
    expectedByOwner: Record<string, DtmGradeReportData>;
  }>;
}

export function buildDtmGradePreview(
  runId: string,
  owners: Record<FixtureRole, FixtureOwner>,
): DtmGradeReportPreviewFixture;

export function dtmGradePreviewCases(fixture: DtmGradeReportPreviewFixture):
  Array<Pick<DtmNativeRouteCase, 'id' | 'question' | 'route' | 'history' | 'fixtureKey' | 'expected'>>;
