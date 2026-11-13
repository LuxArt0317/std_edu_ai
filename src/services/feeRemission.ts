import {affairsClient} from '../features/public/affairs/authClient';
import {
  feeRemissionUuid, parseFeeRemission, parseFeeRemissionReceipt, readFeeRemissionJson,
  validateFeeRemissionPayload, type FeeRemissionAction,
} from '../../server/feeRemissionContract.js';

export class FeeRemissionRequestError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function request(path: string, callerId: string, signal: AbortSignal, action?: FeeRemissionAction) {
  const bounded = AbortSignal.any([signal, AbortSignal.timeout(25000)]);
  async function verifySession() {
    bounded.throwIfAborted();
    const result = await affairsClient?.auth.getSession();
    bounded.throwIfAborted();
    if (!result || result.error || result.data.session?.user.id !== callerId) {
      throw new FeeRemissionRequestError('登入狀態已變更，請重新登入。', 401);
    }
    return result.data.session.access_token;
  }
  const token = await verifySession();
  const response = await fetch(path, {
    method: action ? 'POST' : 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      ...(action ? {'Content-Type': 'application/json'} : {}),
    },
    body: action ? JSON.stringify(action) : undefined,
    credentials: 'omit',
    cache: 'no-store',
    redirect: 'error',
    signal: bounded,
  });
  if (!response.ok) {
    void response.body?.cancel().catch(() => {});
    const messages: Record<number, string> = {
      400: '請檢查學雜費減免欄位及紀錄數。',
      401: '登入已逾時，請重新登入。',
      403: '目前帳戶無法存取此學雜費減免紀錄。',
      409: '紀錄已變更，請重新載入。',
    };
    throw new FeeRemissionRequestError(messages[response.status] ?? '暫時無法確認學雜費減免紀錄，請重試。', response.status);
  }
  const value = await readFeeRemissionJson(response);
  await verifySession();
  return value;
}

export async function loadFeeRemissionHistory(callerId: string, signal: AbortSignal, selectedUser?: string) {
  if (!feeRemissionUuid(callerId) || (selectedUser !== undefined && !feeRemissionUuid(selectedUser))) {
    throw new FeeRemissionRequestError('請選擇有效的帳戶。', 400);
  }
  const scope = selectedUser ? `fee-remission-admin&user_id=${selectedUser}` : 'fee-remission';
  return parseFeeRemission(await request(`/api/affairs-data?scope=${scope}`, callerId, signal), selectedUser ?? callerId);
}

export async function saveFeeRemissionHistory(callerId: string, action: FeeRemissionAction, signal: AbortSignal) {
  if (!validateFeeRemissionPayload(action.kind, action.payload)) {
    throw new FeeRemissionRequestError('請檢查學雜費減免欄位。', 400);
  }
  const requestAction = {...action, payload: {...action.payload}} as FeeRemissionAction;
  const value = await request('/api/affairs-manage', callerId, signal, requestAction);
  return parseFeeRemissionReceipt(value, requestAction);
}
