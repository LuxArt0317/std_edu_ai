import { affairsClient } from '@/features/public/affairs/authClient';
import {
  healthExaminationScope, healthReportId, healthReportLimit, validHealthReportUrl,
  validHealthExaminations, type HealthExaminationResult,
} from '../../server/healthExaminationContract.js';

async function access(userId: string, signal: AbortSignal) {
  signal.throwIfAborted();
  const result = await affairsClient?.auth.getSession();
  signal.throwIfAborted();
  if (result?.error || result?.data.session?.user.id !== userId) {
    throw new Error('請重新登入校務系統。');
  }
  return result.data.session.access_token;
}

export async function loadHealthExaminations(userId: string, page: number, signal: AbortSignal): Promise<HealthExaminationResult> {
  const bounded = AbortSignal.any([signal, AbortSignal.timeout(18000)]);
  const params = new URLSearchParams({ scope: healthExaminationScope, page: String(page) });
  const response = await fetch('/api/affairs-data?' + params, {
    credentials: 'omit',
    redirect: 'error',
    cache: 'no-store',
    signal: bounded,
    headers: { Authorization: 'Bearer ' + await access(userId, bounded) },
  });
  if (!response.ok) {
    void response.body?.cancel().catch(() => {});
    throw new Error('無法讀取健檢紀錄。');
  }
  const result: unknown = await response.json();
  await access(userId, bounded);
  if (!validHealthExaminations(result, userId)) throw new Error('無法確認健檢紀錄。');
  return result;
}

export async function downloadHealthReport(userId: string, id: string, signal: AbortSignal) {
  const origin = import.meta.env.VITE_SUPABASE_URL?.trim();
  if (!origin || !healthReportId(userId) || !healthReportId(id)) {
    throw new Error('無法確認健檢報告。');
  }
  const bounded = AbortSignal.any([signal, AbortSignal.timeout(18000)]);
  const params = new URLSearchParams({ scope: healthExaminationScope, report: id });
  const authorization = await fetch('/api/affairs-data?' + params, {
    credentials: 'omit', redirect: 'error', cache: 'no-store', signal: bounded,
    headers: { Authorization: 'Bearer ' + await access(userId, bounded) },
  });
  if (!authorization.ok) {
    void authorization.body?.cancel().catch(() => {});
    throw new Error('無法下載健檢報告。');
  }
  const result = await authorization.json();
  if (typeof result?.url !== 'string') throw new Error('無法下載健檢報告。');
  const signed = new URL(result.url);
  if (!validHealthReportUrl(signed, origin, userId, id)) throw new Error('無法確認健檢報告。');
  await access(userId, bounded);
  const response = await fetch(signed, {
    credentials: 'omit', redirect: 'error', cache: 'no-store', signal: bounded, referrerPolicy: 'no-referrer',
  });
  if (!response.ok || response.headers.get('content-type') !== 'application/pdf' ||
      Number(response.headers.get('content-length')) > healthReportLimit) {
    void response.body?.cancel().catch(() => {});
    throw new Error('無法下載健檢報告。');
  }
  const data = await response.blob();
  if (!data.size || data.size > healthReportLimit) throw new Error('無法下載健檢報告。');
  await access(userId, bounded);

  // Force a download so report contents are never inserted into the workspace.
  const url = URL.createObjectURL(data);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'health-examination-report.pdf';
  try {
    document.body.append(link);
    link.click();
  } finally {
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
