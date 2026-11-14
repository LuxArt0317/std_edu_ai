import { AffairsWorkspaceError } from './affairsWorkspace.js';
import { readFeeRemissionJson } from './feeRemissionContract.js';
import { healthExaminationScope, healthPageSize, healthReportBucket, healthReportId, validHealthExaminations, validHealthReportUrl } from './healthExaminationContract.js';

export async function readHealthExaminations(account, query) {
  const { scope, page = '1', ...unknown } = query;
  if (scope !== healthExaminationScope || Object.keys(unknown).length ||
      typeof page !== 'string' || !/^[1-9]\d{0,2}$/.test(page) || Number(page) > 201) {
    throw new AffairsWorkspaceError('Invalid health examination inquiry.', 400);
  }

  const unavailable = () => new AffairsWorkspaceError('Health examination records are temporarily unavailable.', 503);
  const timeout = Math.min(8000, (account.requestDeadline ?? Date.now() + 8000) - Date.now());
  if (timeout <= 0) throw unavailable();

  let result;
  try {
    result = await fetch(account.url + '/rest/v1/rpc/affairs_read_health_examinations', {
      method: 'POST',
      redirect: 'error',
      signal: AbortSignal.timeout(timeout),
      headers: {
        apikey: account.key,
        Authorization: 'Bearer ' + account.token,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ p_offset: (Number(page) - 1) * healthPageSize }),
    });
  } catch {
    throw unavailable();
  }
  if (!result.ok) {
    void result.body?.cancel().catch(() => {});
    if (result.status === 401 || result.status === 403) {
      throw new AffairsWorkspaceError('School Affairs sign-in is required.', 403);
    }
    throw unavailable();
  }

  const value = await readFeeRemissionJson(result).catch(() => { throw unavailable(); });
  if (!validHealthExaminations(value, account.user.id)) throw unavailable();
  return value;
}

export async function authorizeHealthReport(account, query) {
  const { scope, report, ...unknown } = query;
  if (scope !== healthExaminationScope || Object.keys(unknown).length || !healthReportId(report)) {
    throw new AffairsWorkspaceError('Invalid health report request.', 400);
  }
  const unavailable = () => new AffairsWorkspaceError('Health report download is temporarily unavailable.', 503);
  const timeout = Math.min(10000, (account.requestDeadline ?? Date.now() + 10000) - Date.now());
  if (timeout <= 0 || !healthReportId(account.user.id)) throw unavailable();
  const signal = AbortSignal.timeout(timeout);
  const allowed = await fetch(account.url + '/rest/v1/rpc/affairs_can_download_health_report', {
    method: 'POST', redirect: 'error', signal,
    headers: { apikey: account.key, Authorization: 'Bearer ' + account.token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_record_id: report }),
  }).catch(() => { throw unavailable(); });
  if (!allowed.ok) {
    void allowed.body?.cancel().catch(() => {});
    throw unavailable();
  }
  const access = await readFeeRemissionJson(allowed).catch(() => { throw unavailable(); });
  if (access === false) throw new AffairsWorkspaceError('This report is unavailable.', 404);
  if (access !== true) throw unavailable();

  const serviceKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) throw unavailable();
  const path = '/object/sign/' + healthReportBucket + '/' + account.user.id + '/' + report + '.pdf';
  const result = await fetch(account.url + '/storage/v1' + path, {
    method: 'POST', redirect: 'error', signal,
    headers: { apikey: serviceKey, Authorization: 'Bearer ' + serviceKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ expiresIn: 30 }),
  }).catch(() => { throw unavailable(); });
  if (!result.ok) {
    void result.body?.cancel().catch(() => {});
    throw unavailable();
  }
  const value = await readFeeRemissionJson(result).catch(() => { throw unavailable(); });
  if (typeof value?.signedURL !== 'string' || !value.signedURL.startsWith(path + '?')) throw unavailable();
  const url = new URL('/storage/v1' + value.signedURL, account.url);
  if (!validHealthReportUrl(url, account.url, account.user.id, report)) throw unavailable();
  return { url: url.href };
}
