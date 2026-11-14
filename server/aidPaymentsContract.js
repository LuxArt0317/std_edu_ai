export const aidPaymentsScope='aid-payments';
export const aidPaymentsPageSize=25;
export const aidPaymentsPaths={claims:'/school-affairs/services/37-1',salary:'/school-affairs/services/37-1/salary'};
export const aidPaymentsFields={
  claims:[['reason','請款事由'],['amount','請領金額'],['approval_result','簽核結果'],['approval_status','各單位簽核狀態']],
  salary:[['appointment_type','任用類別'],['payment_period','給付起迄日'],['rate','單位薪資'],['work_units','工讀基數'],['gross','給付金額'],
    ['employer_labor','勞保(單)'],['employer_health','健保(單)'],['employer_pension','退休金(單)'],['employer_supplement','補充保費(單)'],
    ['subtotal','小計'],['student_labor','勞保(個)'],['student_health','健保(個)'],['student_pension','退休金(個)'],
    ['student_supplement','補充保費(個)'],['tax','所得稅'],['net','給付淨額'],['bank_last4','銀行帳號']],
};
const textFields=new Set(['reason','approval_result','approval_status','appointment_type','payment_period']);
const uuid=/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
export function validAidPayments(value,userId,view){
  const columns=aidPaymentsFields[view];
  return !!columns&&value?.userId===userId&&value?.view===view&&Number.isSafeInteger(value.total)&&value.total>=0&&
    Array.isArray(value.rows)&&value.rows.length<=aidPaymentsPageSize&&value.rows.length<=value.total&&
    value.rows.every(row=>row&&typeof row.id==='string'&&uuid.test(row.id)&&
      Object.keys(row).length===columns.length+1&&columns.every(([key])=>{
        const cell=row[key];
        if(key==='reason')return typeof cell==='string'&&cell.trim().length>0&&cell.length<=320;
        if(cell===null)return true;
        if(key==='bank_last4')return typeof cell==='string'&&/^\d{4}$/.test(cell);
        if(textFields.has(key))return typeof cell==='string'&&cell.length<=600;
        return typeof cell==='number'&&Number.isFinite(cell)&&Math.abs(cell)<=9999999999.99;
      }));
}
export function aidPaymentsQuestion(question){
  const text=question.normalize('NFKC');
  if(/學生薪資|工讀薪資|工讀給付|\b(?:student|work[- ]study|campus job) (?:payroll|salary|pay)\b/iu.test(text))return 'salary';
  if(/學生助學金查詢|助學金請款|請款查詢|\b(?:student aid|financial aid) (?:payment|claim)s?\b/iu.test(text))return 'claims';
  return null;
}
