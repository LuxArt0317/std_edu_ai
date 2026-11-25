import {feeRemissionUuid} from './feeRemissionContract.js';

export const certificateAwardPath='/school-affairs/services/52-1';
export const certificateAwardScope='certificate-awards';
export const certificateProofBucket='affairs-certificate-proofs';
export const certificateProofLimit=5242880;
export const certificateAwardStudentOps=['draft','reserve','attach','detach','discard','submit','add_award'];
export const certificateAwardManagerOps=['review','payout','catalog'];
export const certificateAwardLabels={
  draft:['草稿','Draft'],submitted:['申請中','Submitted'],reviewing:['審查中','Under review'],
  needs_documents:['需補件','Documents required'],approved:['通過','Approved'],
};
export function certificateAwardRecordId(route){
  const prefix=certificateAwardPath+'/record/';
  const path=route.split(/[?#]/u,1)[0].replace(/\/$/u,'');
  if(!path.startsWith(prefix))return null;
  const id=path.slice(prefix.length);
  return feeRemissionUuid(id)?id:null;
}
export const certificateAwardBankReceiptNote = [
  '申請狀態與已儲存金額無法確認款項是否已入帳。',
  'I can’t verify whether the payout reached your bank. The saved award amount reflects the application record.',
];

export function certificateAwardBankReceiptQuestion(question) {
  const text = question.normalize('NFKC').toLowerCase();
  const receipt = /\bbank (?:receipt|deposit)\b/u;
  const destination = /\b(?:reach(?:ed)?|arrive[ds]? (?:at|in)|(?:credited|deposited|paid|transferred) (?:to|in|into)) (?:(?:my|the) )?bank(?: account)?\b/u;
  return receipt.test(text) || destination.test(text) || /入[帳賬]|到[帳賬]|收到匯款|款項.{0,8}匯入/u.test(text);
}

export function certificateAwardQuestion(question,route=''){
  const text=question.normalize('NFKC').toLowerCase();
  if(/password|write code|javascript|python|密碼|他人|\banother student['’]s\b|\bsomeone else['’]s\b/u.test(text))return null;
  const asksForBankReceipt = certificateAwardBankReceiptQuestion(text);
  const path = route.split(/[?#]/u,1)[0].replace(/\/$/u,'');
  if(asksForBankReceipt&&(path===certificateAwardPath||certificateAwardRecordId(route)))return 'status';
  if(!/certificate.{0,16}(award|grant|incentive|subsidy|application)|certification.{0,16}(award|grant|incentive|subsidy)|證照.{0,10}(獎|補助|申請|記錄|紀錄)/u.test(text))return null;
  if(/\b(?:status|my|did i|have i)\b|我的|我.{0,10}(?:查|有|通過|進度)|審核狀態/u.test(text)&&
    (asksForBankReceipt||!/\b(?:how|where)\b|如何|哪裡/u.test(text)))return 'status';
  return 'guide';
}
