export interface AccountEvaluationCase {
  id: string;
  question: string;
  route: string;
  fixtureKey: string;
  history?: {role: 'user' | 'assistant';content: string}[];
  expected: {requiredTools: string[];requireUnchangedOwnedRecords?: boolean;[key: string]: unknown};
}

export function buildAccountCases(options?: {
  now?: string;
  includePlannedFeeRemission?: boolean;
  includePlannedHealthExaminations?: boolean;
  includePlannedCounselingAppointments?: boolean;
  includePlannedClearanceApplications?: boolean;
  includePlannedTutorEvaluation?: boolean;
}): AccountEvaluationCase[];
