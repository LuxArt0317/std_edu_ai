export const feeRemissionPath = '/school-affairs/services/21-3';
export const feeRemissionKinds = ['save_fee_remission', 'delete_fee_remission'];
export const feeRemissionFields = [
  ['academic_year_text', '學年', 40],
  ['semester_text', '學期', 40],
  ['student_number', '學號', 80],
  ['category_text', '類別', 160],
  ['amount_text', '金額', 80],
  ['check_status_text', '檢核狀態', 160],
  ['notes_text', '備註說明', 2000],
];
export const feeRemissionMaxPayloadBytes = 8192;
export const feeRemissionMaxResponseBytes = 3 * 1024 * 1024;
export const feeRemissionMaxRows = 250;

const cellKeys = feeRemissionFields.map(([key]) => key);
const editableKeys = [...cellKeys, 'row_order'];
const identifiers = ['id', 'user_id', 'request_id'];
const envelopeKeys = [...identifiers, 'expected_version'];

export const feeRemissionUuid = value => typeof value === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value);
const integer = (value, minimum, maximum) => Number.isSafeInteger(value) && value >= minimum && value <= maximum;
const exact = (value, keys) => value !== null && typeof value === 'object' &&
  [Object.prototype, null].includes(Object.getPrototypeOf(value)) &&
  Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
function cellsValid(row) {
  return integer(row.row_order, 0, 10000) && feeRemissionFields.every(([key, , limit]) => {
    const value = row[key];
    if (value === null) return true;
    if (typeof value !== 'string' || value.includes('\0') || [...value].some(char => char.length === 1 && /[\uD800-\uDFFF]/u.test(char))) return false;
    return [...value].length <= limit;
  });
}
export function validateFeeRemissionPayload(kind, payload) {
  if (!feeRemissionKinds.includes(kind)) return false;
  const saving = kind === 'save_fee_remission';
  if (!exact(payload, saving ? [...envelopeKeys, ...editableKeys] : envelopeKeys)) return false;
  if (!identifiers.every(key => feeRemissionUuid(payload[key])) ||
    !integer(payload.expected_version, saving ? 0 : 1, 999999998) || (saving && !cellsValid(payload))) return false;
  // JSONB's text format adds one space after every colon and comma for flat objects.
  return new TextEncoder().encode(JSON.stringify(payload)).length + Object.keys(payload).length * 2 - 1 <= feeRemissionMaxPayloadBytes;
}
export function parseFeeRemission(value, userId) {
  if (!feeRemissionUuid(userId) || !exact(value, ['userId', 'records']) || value.userId !== userId ||
    !Array.isArray(value.records) || value.records.length > feeRemissionMaxRows) {
    throw new Error('Invalid fee remission history.');
  }
  const ids = new Set();
  let previous;
  for (const row of value.records) {
    if (!exact(row, ['id', 'version', ...editableKeys]) || !feeRemissionUuid(row.id) || ids.has(row.id) ||
      !integer(row.version, 1, 999999999) || !cellsValid(row) ||
      (previous && (row.row_order < previous.row_order ||
        (row.row_order === previous.row_order && row.id <= previous.id)))) {
      throw new Error('Invalid fee remission history row.');
    }
    ids.add(row.id);
    previous = row;
  }
  return value;
}
export function parseFeeRemissionReceipt(value, action) {
  if (!exact(value, ['id', 'kind', 'version']) || value.id !== action.payload.id ||
    value.kind !== action.kind || value.version !== action.payload.expected_version + 1) {
    throw new Error('Invalid fee remission operation receipt.');
  }
  return value;
}

export async function readFeeRemissionJson(response, limit = feeRemissionMaxResponseBytes) {
  if (!response.body || Number(response.headers.get('content-length')) > limit) {
    void response.body?.cancel().catch(() => {});
    throw new Error('Fee remission response is unavailable.');
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8', {fatal: true});
  let length = 0;
  let json = '';
  try {
    while (true) {
      const {done, value} = await reader.read();
      if (done) return JSON.parse(json + decoder.decode());
      length += value.byteLength;
      if (length > limit) throw new Error('Fee remission response exceeds its size limit.');
      json += decoder.decode(value, {stream: true});
    }
  } catch (error) {
    void reader.cancel().catch(() => {});
    throw error;
  } finally {
    reader.releaseLock();
  }
}
