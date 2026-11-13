import {feeRemissionUuid as isUuid} from './feeRemissionContract.js';

export const exchangeGrantKinds = ['save_exchange_grant_draft', 'save_exchange_grant_report', 'delete_exchange_grant_draft'];
export const exchangeGrantMaxPayloadBytes = 32768;
const textFields = {department: 160, activity_category: 160, activity_name: 250, activity_location: 250, topic: 400, region: 160};
const formKeys = [...Object.keys(textFields), 'starts_on', 'ends_on', 'lodging'];
const baseKeys = ['id', 'request_id', 'expected_version'];
const exact = (value, keys) => value && typeof value === 'object' && !Array.isArray(value) &&
  Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
function validText(text, limit) {
  return typeof text === 'string' && Boolean(text.trim()) && !text.includes('\0') &&
    [...text].length <= limit && ![...text].some(char => char.length === 1 && /[\uD800-\uDFFF]/u.test(char));
}
function validDate(text) {
  if (typeof text !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(text) || text < '1900-01-01') return false;
  const date = new Date(text + 'T00:00:00Z');
  return Number.isFinite(date.valueOf()) && date.toISOString().slice(0, 10) === text;
}
function validForm(row) {
  return Object.entries(textFields).every(([key, limit]) => validText(row[key], limit)) &&
    validDate(row.starts_on) && validDate(row.ends_on) && row.ends_on >= row.starts_on && typeof row.lodging === 'boolean';
}
export function validateExchangeGrant(kind, payload) {
  if (!exchangeGrantKinds.includes(kind)) return false;
  const draft = kind === 'save_exchange_grant_draft';
  const report = kind === 'save_exchange_grant_report';
  const keys = draft ? [...baseKeys, ...formKeys] : report ? [...baseKeys, 'report_text'] : baseKeys;
  return Boolean(exact(payload, keys) && isUuid(payload.id) && isUuid(payload.request_id) &&
    Number.isInteger(payload.expected_version) && payload.expected_version >= (draft ? 0 : 1) && payload.expected_version < 999999999 &&
    (!draft || validForm(payload)) && (!report || validText(payload.report_text, 5000)) &&
    new TextEncoder().encode(JSON.stringify(payload)).length + keys.length * 2 - 1 <= exchangeGrantMaxPayloadBytes);
}
export function parseExchangeGrants(value, callerId) {
  if (!isUuid(callerId) || !exact(value, ['userId', 'records']) || value.userId !== callerId ||
    !Array.isArray(value.records) || value.records.length > 100) throw new Error('Invalid grant draft list.');
  let previous = '';
  for (const row of value.records) {
    if (!exact(row, ['id', 'version', 'report_text', ...formKeys]) || !isUuid(row.id) || row.id <= previous ||
      !Number.isInteger(row.version) || row.version < 1 || row.version > 999999999 || !validForm(row) ||
      (row.report_text !== null && !validText(row.report_text, 5000))) throw new Error('Invalid grant draft.');
    previous = row.id;
  }
  return value;
}
export function parseExchangeGrantReceipt(value, action) {
  if (!exact(value, ['id', 'kind', 'version']) || value.id !== action.payload.id || value.kind !== action.kind ||
    value.version !== action.payload.expected_version + 1) throw new Error('Invalid grant operation receipt.');
  return value;
}
