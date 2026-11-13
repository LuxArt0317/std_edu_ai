import { feeRemissionUuid as uuid } from './feeRemissionContract.js';

export const programRegistrationPath = '/school-affairs/services/7-3';
export const programRegistrationScope = 'program-registrations';
export const programRegistrationAction = 'change_program_registration';
export const programCode = value => typeof value === 'string' && /^PU[0-9]{3}$/.test(value);
const integer = (value,min,max) => Number.isInteger(value) && value >= min && value <= max;
const term = (year,semester) => (year === null && semester === null) || (integer(year,88,500) && integer(semester,1,2));
const exact = (value,keys) => !!value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value,key));

export function validProgramRegistrationAction(value) {
  return exact(value,['request_id','program_code','operation','expected_version'])
    && uuid(value.request_id) && programCode(value.program_code)
    && (value.operation === 'register' ? value.expected_version === 0
      : value.operation === 'withdraw' && integer(value.expected_version,1,999999));
}

export function parseProgramRegistrations(value,userId) {
  if (!Array.isArray(value) || value.length > 500) throw new Error('Invalid registration history.');
  const codes = new Set();
  for (const row of value) {
    if (!exact(row,['user_id','program_code','academic_year','semester','withdrawn_year','withdrawn_semester','completed_year','completed_semester','version'])
      || row.user_id !== userId || !programCode(row.program_code) || codes.has(row.program_code)
      || !integer(row.academic_year,88,500) || !integer(row.semester,1,2)
      || !term(row.withdrawn_year,row.withdrawn_semester) || !term(row.completed_year,row.completed_semester)
      || (row.withdrawn_year !== null && row.completed_year !== null)
      || (row.withdrawn_year !== null && row.withdrawn_year*2+row.withdrawn_semester < row.academic_year*2+row.semester)
      || (row.completed_year !== null && row.completed_year*2+row.completed_semester < row.academic_year*2+row.semester)
      || !integer(row.version,1,1000000)) throw new Error('Invalid registration history row.');
    codes.add(row.program_code);
  }
  return value;
}

export function parseProgramRegistrationReceipt(value,userId,payload) {
  if (!exact(value,['userId','requestId','programCode','version']) || value.userId !== userId
    || value.requestId !== payload.request_id || value.programCode !== payload.program_code
    || value.version !== payload.expected_version + 1) throw new Error('Invalid registration receipt.');
  return value;
}

export function isProgramRegistrationQuestion(question) {
  return /^(?:what (?:are|is) my (?:interdisciplinary|interdepartmental)(?: credit)? program registrations?|which (?:interdisciplinary|interdepartmental)(?: credit)? programs? (?:have i registered for|am i registered for)|(?:list|show)(?: me)? my (?:interdisciplinary|interdepartmental)(?: credit)? program registrations?|我的跨院系學分學程(?:登記|紀錄|記錄|登記紀錄)?|我(?:已)?登記了?哪些跨院系學分學程)[?？。!\s]*$/i.test(question.trim());
}
