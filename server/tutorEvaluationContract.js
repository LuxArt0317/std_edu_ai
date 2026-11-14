import {feeRemissionUuid as isUuid} from './feeRemissionContract.js';
export {tutorEvaluationPath} from '../src/features/public/affairs/studentServices.js';

export const tutorEvaluationKind = 'submit_tutor_evaluation';
export const tutorEvaluationMaxBytes = 24576;
export const tutorEvaluationEvidenceMaxBytes=26000;
const exact = (value, keys) => value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value,key));
const validText = (value,limit) => typeof value === 'string' && [...value].length <= limit &&
  !value.includes('\0') && ![...value].some(char => char.length === 1 && /[\uD800-\uDFFF]/u.test(char));
const validRatings = ratings => Array.isArray(ratings) && ratings.length === 10 &&
  Array.from(ratings).every(score => Number.isInteger(score) && score >= 1 && score <= 5);
const validTimestamp = text => typeof text === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(text) && Number.isFinite(Date.parse(text));

export function validTutorEvaluation(payload) {
  return Boolean(exact(payload,['request_id','ratings','comment']) && isUuid(payload.request_id) &&
    validRatings(payload.ratings) && validText(payload.comment,4000) &&
    new TextEncoder().encode(JSON.stringify(payload)).length + 32 <= tutorEvaluationMaxBytes);
}

export function parseTutorEvaluation(value,userId) {
  if (!isUuid(userId) || !exact(value,['userId','student','evaluation']) || value.userId !== userId) throw new Error('Invalid evaluation account.');
  const {student,evaluation} = value;
  if (student !== null && (!exact(student,['number','name','department','year']) ||
    !validText(student.number,200) || !validText(student.name,200) || !validText(student.department,200) ||
    !Number.isInteger(student.year) || student.year < 1 || student.year > 8)) throw new Error('Invalid evaluation student.');
  if (evaluation !== null && (!exact(evaluation,['ratings','comment','submittedAt']) || !validRatings(evaluation.ratings) ||
    !validText(evaluation.comment,4000) || !validTimestamp(evaluation.submittedAt))) throw new Error('Invalid evaluation response.');
  return value;
}

export function parseTutorEvaluationReceipt(value,userId,requestId) {
  if (!exact(value,['userId','requestId','submittedAt']) || value.userId !== userId || value.requestId !== requestId ||
    !isUuid(userId) || !isUuid(requestId) || !validTimestamp(value.submittedAt)) throw new Error('Invalid evaluation receipt.');
  return value;
}
