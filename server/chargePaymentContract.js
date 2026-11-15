export const chargePaymentHistoryScope = 'fee-payment-history';
export const chargePaymentHistoryAdminScope = 'fee-payment-history-admin';
export const chargePaymentHistoryPath = '/school-affairs/services/39-1/payment-history';
export const chargePaymentPageSize = 25;
export const chargePaymentMaxPage = 201;
export const chargePaymentActions = Object.freeze(['record_charge_payment', 'reverse_charge_payment']);
export const chargePaymentMaxPayloadBytes = 1500;

const ids = ['request_id', 'student_id', 'charge_id'];
const selectionKeys = ['from', 'through', 'chargeId', 'page'];
const entryKeys = ['id', 'chargeId', 'entryKind', 'paidOn', 'amount', 'currency', 'sourceMode', 'reversesPaymentId'];
const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(value);
const plain = value => value !== null && typeof value === 'object' &&
  [Object.prototype, null].includes(Object.getPrototypeOf(value));
const exact = (value, keys) => plain(value) && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
const boundedText = value => typeof value === 'string' && [...value].length <= 160 && !/[\0\p{Cs}]/u.test(value);

export function chargePaymentDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/u.test(value) || value < '1900-01-01' || value > '2100-12-31') return false;
  const day = new Date(value + 'T00:00:00.000Z');
  return Number.isFinite(day.getTime()) && day.toISOString().slice(0, 10) === value;
}

export function chargePaymentCents(value) {
  if (typeof value !== 'string' || !/^(?:0|[1-9]\d{0,9})(?:\.\d{1,2})?$/u.test(value)) return null;
  const [whole, fraction = ''] = value.split('.');
  return Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
}

export function chargePaymentSelection(value = {}) {
  if (!plain(value) || Object.keys(value).some(key => !selectionKeys.includes(key))) return null;
  const {from, through, chargeId, page = 1} = value;
  if (from !== undefined && !chargePaymentDate(from) || through !== undefined && !chargePaymentDate(through)
    || from !== undefined && through !== undefined && from > through || chargeId !== undefined && !uuid(chargeId)
    || !Number.isInteger(page) || page < 1 || page > chargePaymentMaxPage) return null;
  return {from, through, chargeId, page};
}

export function chargePaymentQuery(query) {
  if (!plain(query) || query.scope !== chargePaymentHistoryScope
    || Object.keys(query).some(key => !['scope', 'from', 'through', 'charge_id', 'page'].includes(key))) return null;
  return querySelection(query);
}

function querySelection(query) {
  const {from, through, charge_id: chargeId, page} = query;
  if (page !== undefined && (typeof page !== 'string' || !/^[1-9]\d{0,2}$/u.test(page))) return null;
  return chargePaymentSelection({from, through, chargeId, page: page === undefined ? 1 : Number(page)});
}

export function chargePaymentAdminSelection(value) {
  if (!plain(value)) return null;
  const {studentId, ...filter} = value;
  if (!uuid(studentId) || !uuid(filter.chargeId)) return null;
  const selection = chargePaymentSelection(filter);
  return selection && {...selection, studentId};
}

export function chargePaymentAdminQuery(query) {
  if (!plain(query) || query.scope !== chargePaymentHistoryAdminScope
    || Object.keys(query).some(key => !['scope', 'student_id', 'from', 'through', 'charge_id', 'page'].includes(key))) return null;
  const selection = querySelection(query);
  return selection && chargePaymentAdminSelection({...selection, studentId: query.student_id});
}

function validEntry(value) {
  return uuid(value.id) && uuid(value.chargeId) && chargePaymentDate(value.paidOn) && chargePaymentCents(value.amount) > 0
    && value.currency === 'TWD' && value.sourceMode === 'local_recorded'
    && (value.entryKind === 'payment' && value.reversesPaymentId === null
      || value.entryKind === 'reversal' && uuid(value.reversesPaymentId) && value.reversesPaymentId !== value.id);
}

export function parseChargePaymentHistory(value, userId, filter = {}) {
  const invalid = () => {throw new TypeError('Invalid dated payment history.');};
  const selection = chargePaymentSelection(filter);
  if (!selection || !exact(value, ['userId', 'studentRecordFound', 'rows', 'total', 'hasUndatedPaidAmount']) || !uuid(userId)
    || value.userId !== userId || typeof value.studentRecordFound !== 'boolean' || typeof value.hasUndatedPaidAmount !== 'boolean'
    || !value.studentRecordFound && (value.hasUndatedPaidAmount || value.total !== 0)) invalid();
  validateHistoryRows(value, selection, invalid);
  return value;
}

export function parseChargePaymentAdminHistory(value, filter) {
  const invalid = () => {throw new TypeError('Invalid administrator payment history.');};
  const selection = chargePaymentAdminSelection(filter);
  if (!selection || !exact(value, ['studentId', 'chargeId', 'rows', 'total', 'hasUndatedPaidAmount'])
    || value.studentId !== selection.studentId || value.chargeId !== selection.chargeId
    || typeof value.hasUndatedPaidAmount !== 'boolean') invalid();
  validateHistoryRows(value, selection, invalid, true);
  return value;
}

function validateHistoryRows(value, selection, invalid, admin = false) {
  if (!Number.isSafeInteger(value.total) || value.total < 0 || !Array.isArray(value.rows)) invalid();
  const {from, through, chargeId, page} = selection;
  if (value.rows.length !== Math.min(chargePaymentPageSize, Math.max(0, value.total - (page - 1) * chargePaymentPageSize))) invalid();
  const keys = [...entryKeys, 'chargeLabel', 'chargeCategory'];
  if (admin) keys.push('canReverse');
  const byId = new Map(), reversals = new Set();
  let previous;
  for (const row of value.rows) {
    if (!exact(row, keys) || !validEntry(row) || byId.has(row.id)
      || admin && (typeof row.canReverse !== 'boolean' || row.entryKind === 'reversal' && row.canReverse)
      || !boundedText(row.chargeLabel) || !row.chargeLabel.trim() || row.chargeCategory !== null && !boundedText(row.chargeCategory)
      || from && row.paidOn < from || through && row.paidOn > through
      || chargeId && row.chargeId !== chargeId || row.reversesPaymentId && reversals.has(row.reversesPaymentId)
      || previous && (row.paidOn > previous.paidOn || row.paidOn === previous.paidOn && row.id >= previous.id)) invalid();
    byId.set(row.id, row);
    if (row.reversesPaymentId) reversals.add(row.reversesPaymentId);
    previous = row;
  }
  for (const row of value.rows) {
    const original = byId.get(row.reversesPaymentId);
    if (original && (original.entryKind !== 'payment' || row.chargeId !== original.chargeId
      || chargePaymentCents(row.amount) !== chargePaymentCents(original.amount) || row.paidOn < original.paidOn
      || admin && original.canReverse)) invalid();
  }
}

const taipeiDate = new Intl.DateTimeFormat('en-CA', {timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit'});

export function validateChargePaymentAction(kind, payload) {
  if (!chargePaymentActions.includes(kind)) return false;
  const recording = kind === 'record_charge_payment';
  return exact(payload, [...ids, 'paid_on', ...(recording ? ['amount', 'currency'] : ['payment_id'])])
    && ids.every(key => uuid(payload[key])) && chargePaymentDate(payload.paid_on) && payload.paid_on <= taipeiDate.format(Date.now())
    && (recording ? chargePaymentCents(payload.amount) > 0 && payload.currency === 'TWD' : uuid(payload.payment_id));
}

export function parseChargePaymentReceipt(value, kind, payload) {
  const invalid = () => {throw new TypeError('Invalid dated payment receipt.');};
  const recording = kind === 'record_charge_payment';
  if (!validateChargePaymentAction(kind, payload) || !exact(value, [...entryKeys, 'studentId', 'amountPaid', 'legacyAmountPaid'])
    || !validEntry(value) || value.chargeId !== payload.charge_id || value.studentId !== payload.student_id || value.paidOn !== payload.paid_on
    || value.entryKind !== (recording ? 'payment' : 'reversal') || !recording && value.reversesPaymentId !== payload.payment_id) invalid();
  const paid = chargePaymentCents(value.amountPaid), undated = chargePaymentCents(value.legacyAmountPaid), recorded = chargePaymentCents(value.amount);
  if (paid === null || undated === null || paid < undated || recording && (paid - undated < recorded || recorded !== chargePaymentCents(payload.amount))) invalid();
  return value;
}
