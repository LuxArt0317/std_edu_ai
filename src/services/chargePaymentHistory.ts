import {affairsClient} from '@/features/public/affairs/authClient';
import {
  chargePaymentHistoryScope, chargePaymentHistoryAdminScope,
  chargePaymentAdminSelection, parseChargePaymentAdminHistory, parseChargePaymentHistory, parseChargePaymentReceipt,
  validateChargePaymentAction, type ChargePaymentAction, type ChargePaymentAdminHistory, type ChargePaymentHistory,
  type ChargePaymentReceipt, type ChargePaymentSelection,
} from '../../server/chargePaymentContract.js';
import {chargePaymentHistoryParams} from '@/features/public/affairs/chargePaymentHistoryRoute';

export class ChargePaymentRequestError extends Error {
  readonly status: number;

  constructor(status: number) {
    super('Payment history request failed.');
    this.status = status;
  }
}

async function requestChargePayment(userId: string, path: string, signal: AbortSignal, action?: ChargePaymentAction): Promise<unknown> {
  const bounded = AbortSignal.any([signal, AbortSignal.timeout(18000)]);
  async function access() {
    bounded.throwIfAborted();
    const result = await affairsClient?.auth.getSession();
    bounded.throwIfAborted();
    if (result?.error || result?.data.session?.user.id !== userId) throw new ChargePaymentRequestError(401);
    return result.data.session.access_token;
  }
  const authorization = 'Bearer ' + await access();
  const response = await fetch(path, {
    method: action ? 'POST' : 'GET',
    headers: {Authorization: authorization, ...(action ? {'Content-Type': 'application/json'} : {})},
    ...(action ? {body: JSON.stringify(action)} : {}),
    credentials: 'omit', redirect: 'error', cache: 'no-store', signal: bounded,
  });
  if (!response.ok) {
    void response.body?.cancel().catch(() => {});
    throw new ChargePaymentRequestError(response.status);
  }
  const value: unknown = await response.json();
  await access();
  return value;
}

export async function loadChargePaymentHistory(userId: string, selection: ChargePaymentSelection, signal: AbortSignal): Promise<ChargePaymentHistory> {
  const params = new URLSearchParams({scope: chargePaymentHistoryScope});
  chargePaymentHistoryParams(selection).forEach((value, key) => params.set(key, value));
  const value = await requestChargePayment(userId, '/api/affairs-data?' + params, signal);
  return parseChargePaymentHistory(value, userId, selection);
}

export async function loadManagedChargePayments(managerId: string, studentId: string, chargeId: string, page: number, signal: AbortSignal): Promise<ChargePaymentAdminHistory> {
  const selection = chargePaymentAdminSelection({studentId, chargeId, page});
  if (!selection) throw new ChargePaymentRequestError(400);
  const params = new URLSearchParams({scope: chargePaymentHistoryAdminScope, student_id: studentId, charge_id: chargeId, page: String(page)});
  const value = await requestChargePayment(managerId, '/api/affairs-data?' + params, signal);
  return parseChargePaymentAdminHistory(value, selection);
}

export async function changeManagedChargePayment(managerId: string, action: ChargePaymentAction, signal: AbortSignal): Promise<ChargePaymentReceipt> {
  if (!validateChargePaymentAction(action.kind, action.payload)) throw new ChargePaymentRequestError(400);
  const value = await requestChargePayment(managerId, '/api/affairs-manage', signal, action);
  return parseChargePaymentReceipt(value, action.kind, action.payload);
}
