import {AffairsWorkspaceError} from './affairsWorkspace.js';
import {readFeeRemissionJson as readBoundedJson} from './feeRemissionContract.js';
import {validateExchangeGrant, parseExchangeGrants, parseExchangeGrantReceipt} from './exchangeGrantContract.js';

async function grantRpc(account, name, body) {
  const remaining = Math.min(12000, Math.floor((account.requestDeadline ?? Date.now() + 12000) - Date.now()));
  if (!Number.isFinite(remaining) || remaining <= 0) throw new AffairsWorkspaceError('Grant request timed out.');
  let response;
  try {
    response = await fetch(`${account.url}/rest/v1/rpc/${name}`, {
      method: 'POST', headers: {apikey: account.key, Authorization: `Bearer ${account.token}`, 'Content-Type': 'application/json'},
      body: JSON.stringify(body), redirect: 'error', signal: AbortSignal.timeout(remaining),
    });
  } catch {
    throw new AffairsWorkspaceError('Grant records are temporarily unavailable.');
  }
  if (!response.ok) {
    void response.body?.cancel().catch(() => {});
    if ([401, 403].includes(response.status)) throw new AffairsWorkspaceError('Grant records are unavailable to this account.', 403);
    if (response.status === 409) throw new AffairsWorkspaceError('Grant draft changed. Reload and retry.', 409);
    if ([400, 413, 422].includes(response.status)) throw new AffairsWorkspaceError('Check the grant fields and dates.', 400);
    throw new AffairsWorkspaceError('Grant records are temporarily unavailable.');
  }
  return readBoundedJson(response);
}
export async function loadExchangeGrants(account) {
  const value = await grantRpc(account, 'affairs_read_exchange_grants', {});
  return parseExchangeGrants(value, account.user.id);
}
export async function manageExchangeGrant(account, kind, payload) {
  if (!validateExchangeGrant(kind, payload)) throw new AffairsWorkspaceError('Check the grant fields and dates.', 400);
  const action = {kind, payload: {...payload}};
  const value = await grantRpc(account, 'affairs_manage_exchange_grant', {p_kind:kind, p_payload:action.payload});
  return parseExchangeGrantReceipt(value, action);
}
