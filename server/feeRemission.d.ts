import type {AffairsAccount} from './affairsWorkspace.js';
import type {FeeRemissionHistory, FeeRemissionKind, FeeRemissionReceipt} from './feeRemissionContract.js';
type Account = AffairsAccount & {requestDeadline?: number};
export function loadFeeRemission(account: Account, userId?: string): Promise<FeeRemissionHistory>;
export function manageFeeRemission(account: Account, kind: FeeRemissionKind, payload: unknown): Promise<FeeRemissionReceipt>;
