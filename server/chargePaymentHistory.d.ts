import type {AffairsAccount} from './affairsWorkspace.js';
import type {ChargePaymentHistory, ChargePaymentKind, ChargePaymentReceipt, ChargePaymentSelection} from './chargePaymentContract.js';

type Account = AffairsAccount & {requestDeadline?: number};
export function readChargePaymentHistory(account: Account, filter?: ChargePaymentSelection): Promise<ChargePaymentHistory>;
export function changeChargePayment(account: Account, kind: ChargePaymentKind, payload: unknown): Promise<ChargePaymentReceipt>;
