import {AffairsWorkspaceError} from './affairsWorkspace.js';
import {
  feeRemissionUuid, parseFeeRemission, parseFeeRemissionReceipt,
  readFeeRemissionJson, validateFeeRemissionPayload,
} from './feeRemissionContract.js';

async function rpc(account, operation, body) {
  const remaining = Math.min(12000, Math.floor((account.requestDeadline ?? Date.now() + 12000) - Date.now()));
  if (!Number.isFinite(remaining) || remaining <= 0) throw new AffairsWorkspaceError('Fee remission request timed out.');
  let response;
  try {
    response = await fetch(`${account.url}/rest/v1/rpc/${operation}`, {
      method: 'POST',
      headers: {apikey: account.key, Authorization: `Bearer ${account.token}`, 'Content-Type': 'application/json'},
      body: JSON.stringify(body),
      redirect: 'error',
      signal: AbortSignal.timeout(remaining),
    });
  } catch {
    throw new AffairsWorkspaceError('Fee remission history is temporarily unavailable.');
  }
  if (!response.ok) {
    void response.body?.cancel().catch(() => {});
    if ([401, 403].includes(response.status)) throw new AffairsWorkspaceError('Fee remission history is unavailable to this account.', 403);
    if (response.status === 409) throw new AffairsWorkspaceError('Fee remission history changed. Reload and retry.', 409);
    if ([400, 413, 422].includes(response.status)) throw new AffairsWorkspaceError('Check the fee remission fields.', 400);
    throw new AffairsWorkspaceError('Fee remission history is temporarily unavailable.');
  }
  return readFeeRemissionJson(response);
}

export async function loadFeeRemission(account, userId) {
  if (!feeRemissionUuid(userId ?? account.user.id)) throw new AffairsWorkspaceError('Choose one student account.', 400);
  const result = await rpc(account, 'affairs_read_fee_remission', userId === undefined ? {} : {p_user_id: userId});
  return parseFeeRemission(result, userId ?? account.user.id);
}

export async function manageFeeRemission(account, kind, payload) {
  if (!validateFeeRemissionPayload(kind, payload)) throw new AffairsWorkspaceError('Check the fee remission fields.', 400);
  const action = {kind, payload: {...payload}};
  const result = await rpc(account, 'affairs_manage_fee_remission', {p_kind: kind, p_payload: action.payload});
  return parseFeeRemissionReceipt(result, action);
}
