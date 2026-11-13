import type {AffairsAccount} from './affairsWorkspace.js';
import type {ExchangeGrantKind, ExchangeGrantList, ExchangeGrantReceipt} from './exchangeGrantContract.js';
type Account = AffairsAccount & {requestDeadline?:number};
export function loadExchangeGrants(account:Account):Promise<ExchangeGrantList>;
export function manageExchangeGrant(account:Account,kind:ExchangeGrantKind,payload:unknown):Promise<ExchangeGrantReceipt>;
