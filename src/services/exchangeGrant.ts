import {affairsClient} from '../features/public/affairs/authClient';
import {readFeeRemissionJson as readBoundedJson} from '../../server/feeRemissionContract.js';
import {
  parseExchangeGrants, parseExchangeGrantReceipt, validateExchangeGrant, type ExchangeGrantAction,
} from '../../server/exchangeGrantContract.js';

export class ExchangeGrantError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function request(userId: string, signal: AbortSignal, action?: ExchangeGrantAction) {
  const bounded = AbortSignal.any([signal, AbortSignal.timeout(25000)]);
  async function session() {
    bounded.throwIfAborted();
    const result = await affairsClient?.auth.getSession();
    bounded.throwIfAborted();
    if (!result || result.error || result.data.session?.user.id !== userId) throw new ExchangeGrantError('請重新登入。', 401);
    return result.data.session.access_token;
  }
  const token = await session();
  const response = await fetch(action ? '/api/affairs-action' : '/api/affairs-data?scope=exchange-grant', {
    method: action ? 'POST' : 'GET', headers: {Authorization:`Bearer ${token}`, Accept:'application/json', ...(action ? {'Content-Type':'application/json'} : {})},
    body: action ? JSON.stringify(action) : undefined, credentials:'omit', cache:'no-store', redirect:'error', signal:bounded,
  });
  if (!response.ok) {
    void response.body?.cancel().catch(() => {});
    const messages: Record<number, string> = {400:'請檢查欄位及活動日期。',401:'請重新登入。',403:'目前帳戶無法存取紀錄。',409:'紀錄已更新，請重新載入。'};
    throw new ExchangeGrantError(messages[response.status] ?? '暫時無法確認紀錄，請重試。', response.status);
  }
  const value = await readBoundedJson(response);
  await session();
  return value;
}
export async function loadExchangeGrantDrafts(userId: string, signal: AbortSignal) {
  return parseExchangeGrants(await request(userId,signal), userId);
}
export async function saveExchangeGrantDraft(userId: string, action: ExchangeGrantAction, signal: AbortSignal) {
  if (!validateExchangeGrant(action.kind, action.payload)) throw new ExchangeGrantError('請檢查欄位及活動日期。',400);
  const current = {...action,payload:{...action.payload}} as ExchangeGrantAction;
  return parseExchangeGrantReceipt(await request(userId,signal,current),current);
}
