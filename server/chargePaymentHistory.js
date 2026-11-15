import {AffairsWorkspaceError, requestAffairsRpc} from './affairsWorkspace.js';
import {readFeeRemissionJson as readBoundedJson} from './feeRemissionContract.js';
import {
  chargePaymentAdminSelection, chargePaymentPageSize, chargePaymentSelection, parseChargePaymentAdminHistory,
  parseChargePaymentHistory, parseChargePaymentReceipt, validateChargePaymentAction,
} from './chargePaymentContract.js';

const readErrors = {
  400: 'Check the payment history filters.',
  401: 'Sign in to School Affairs again.',
  403: 'Payment history is unavailable to this account.',
};
const adminReadErrors = {
  ...readErrors,
  403: 'Only a verified School Affairs administrator can see the selected payment ledger.',
  404: 'The selected student charge is unavailable.',
};
const writeErrors = {
  400: 'Check the local payment fields and business date.',
  401: 'Sign in to School Affairs again.',
  403: 'Only a verified School Affairs administrator can change the payment ledger.',
  404: 'The selected charge or payment is unavailable.',
  409: 'The payment conflicts with the current charge or an earlier request. Refresh before making a new change.',
};

export async function readChargePaymentHistory(account, filter = {}) {
  const selection = chargePaymentSelection(filter);
  if (!selection) throw new AffairsWorkspaceError(readErrors[400], 400);
  const {from, through, chargeId, page} = selection;
  const value = await requestAffairsRpc(account, 'affairs_read_charge_payment_history', {
    p_from: from ?? null, p_through: through ?? null, p_charge_id: chargeId ?? null,
    p_offset: (page - 1) * chargePaymentPageSize, p_limit: chargePaymentPageSize,
  }, {readJson: response => readBoundedJson(response, 65536), errorMessages: readErrors});
  try { return parseChargePaymentHistory(value, account.user.id, selection); }
  catch { throw new AffairsWorkspaceError('The payment history response could not be verified.'); }
}

export async function readChargePaymentAdminHistory(account, filter) {
  const selection = chargePaymentAdminSelection(filter);
  if (!selection) throw new AffairsWorkspaceError(adminReadErrors[400], 400);
  const {studentId, chargeId, from, through, page} = selection;
  const value = await requestAffairsRpc(account, 'affairs_read_charge_payment_history_admin', {
    p_student_id: studentId, p_charge_id: chargeId, p_from: from ?? null, p_through: through ?? null,
    p_offset: (page - 1) * chargePaymentPageSize, p_limit: chargePaymentPageSize,
  }, {readJson: response => readBoundedJson(response, 65536), errorMessages: adminReadErrors});
  try { return parseChargePaymentAdminHistory(value, selection); }
  catch { throw new AffairsWorkspaceError('The selected payment history response could not be verified.'); }
}

export async function changeChargePayment(account, kind, payload) {
  if (!validateChargePaymentAction(kind, payload)) throw new AffairsWorkspaceError(writeErrors[400], 400);
  const exactPayload = {...payload};
  const value = await requestAffairsRpc(account, 'affairs_change_charge_payment', {p_kind: kind, p_payload: exactPayload},
    {readJson: response => readBoundedJson(response, 8192), errorMessages: writeErrors});
  try { return parseChargePaymentReceipt(value, kind, exactPayload); }
  catch { throw new AffairsWorkspaceError('The payment receipt could not be verified. Retry with the same request.'); }
}
