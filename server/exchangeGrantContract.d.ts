export const exchangeGrantKinds: readonly ['save_exchange_grant_draft','save_exchange_grant_report','delete_exchange_grant_draft'];
export const exchangeGrantMaxPayloadBytes: number;
export type ExchangeGrantKind = typeof exchangeGrantKinds[number];
export type ExchangeGrantFields = {
  department:string; activity_category:string; starts_on:string; ends_on:string;
  activity_name:string; activity_location:string; topic:string; region:string; lodging:boolean;
};
export type ExchangeGrantRecord = ExchangeGrantFields & {id:string; version:number; report_text:string|null};
export type ExchangeGrantList = {userId:string; records:ExchangeGrantRecord[]};
type Envelope = {id:string; request_id:string; expected_version:number};
export type ExchangeGrantAction =
  | {kind:'save_exchange_grant_draft'; payload:Envelope & ExchangeGrantFields}
  | {kind:'save_exchange_grant_report'; payload:Envelope & {report_text:string}}
  | {kind:'delete_exchange_grant_draft'; payload:Envelope};
export type ExchangeGrantReceipt = {id:string; kind:ExchangeGrantKind; version:number};
export function validateExchangeGrant(kind:unknown,payload:unknown):boolean;
export function parseExchangeGrants(value:unknown,callerId:string):ExchangeGrantList;
export function parseExchangeGrantReceipt(value:unknown,action:ExchangeGrantAction):ExchangeGrantReceipt;
