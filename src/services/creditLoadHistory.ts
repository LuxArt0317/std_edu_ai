export type CreditLoadHistoryRecord={
  id:string;userId:string;academicYear:number;semester:number;category:'over'|'under';
  requestedCredits:number;processText:string|null;resultText:string|null;
  sourceMode:'local_demo';version:number;createdAt:string;updatedAt:string;
};
export type CreditLoadHistoryRecords={records:CreditLoadHistoryRecord[]};
export type CreditLoadHistoryProfile={user_id:string;display_name:string;email:string};
export type CreditLoadHistorySaveAction={kind:'save_credit_load_history';payload:Record<string,string>};
export const creditLoadHistoryPath='/school-affairs/services/11-3';
export const creditLoadApplicationPath='/school-affairs/services/7-1';
export const officialCreditLoadHistoryUrl='https://infosys.stu.edu.tw/WebSelectCourse/Login/AspLogin/AppCreditHistory';
export const creditLoadHistoryColumns=['申請學年','申請學期','類別','申請超修或減修學分數','申請進度','審核結果'] as const;
export const creditLoadCategoryLabels={over:'超修',under:'減修'};
// Public instructions captured on 2026-11-12, not an eligibility or approval engine.
export const creditLoadHistoryNotes=[
  '申請超修者，送出資料時會由系統判斷是否符合資格及學分，符合者，直接核予超修學分數後，請同學自行於加退選階段上網加課。',
  '不符合超修資格或學分，但有特殊原因者，請列印申請表，經就讀系所主管簽核後，送交教務處辦理，以完成申請程序。',
  '申請減修者，經導師及系主任簽核同意後，請同學自行於加退選階段上網退課。',
] as const;
export function creditLoadApplicantLabel(profile:CreditLoadHistoryProfile) {
  const identity=profile.email || profile.user_id;
  return profile.display_name && profile.display_name!==identity?`${profile.display_name} (${identity})`:identity;
}
export function creditLoadHistoryTimestamp(value?:string) {
  const date=new Date(value ?? '');
  return Number.isNaN(date.getTime())?'—':new Intl.DateTimeFormat('sv-SE',{
    timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false,
  }).format(date).replaceAll('-','/');
}
