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
export function certificateAwardQuestion(question){
  const text=question.normalize('NFKC').toLowerCase();
  if(/password|write code|javascript|python|密碼|他人/u.test(text))return null;
  if(!/certificate.{0,16}(award|grant|incentive|subsidy|application)|certification.{0,16}(award|grant|incentive|subsidy)|證照.{0,10}(獎|補助|申請|記錄|紀錄)/u.test(text))return null;
  if(/\b(?:status|my|did i|have i)\b|我的|我.{0,10}(?:查|有|通過|進度)|審核狀態/u.test(text)&&
    !/\b(?:how|where)\b|如何|哪裡/u.test(text))return 'status';
  return 'guide';
}
