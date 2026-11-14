import type { verifyAffairsToken } from './affairsWorkspace.js';
import type { HealthExaminationResult } from './healthExaminationContract.js';

export function readHealthExaminations(
  account: Awaited<ReturnType<typeof verifyAffairsToken>> & { requestDeadline?: number },
  query: Record<string, string | string[] | undefined>,
): Promise<HealthExaminationResult>;

export function authorizeHealthReport(
  account: Awaited<ReturnType<typeof verifyAffairsToken>> & { requestDeadline?: number },
  query: Record<string, string | string[] | undefined>,
): Promise<{ url: string }>;
