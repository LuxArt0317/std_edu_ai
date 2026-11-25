import {internshipEvidencePath,internshipLookupContext} from './internshipEvidenceIntent.js';
import {ownFeeBalanceLabel} from './pendingFeesAnswer.js';
import {schoolSubjectRecordsPath} from '../src/features/public/affairs/studentServices.js';

const feePath='/school-affairs/services/39-1';
const excluded=/^(?:(?:please\s+)?(?:do not|don['’]t|never|skip|avoid|exclude)\b|(?:without|not|excluding)\b|(?:請|请)?不要|排除|不含)/iu;
const independentRead=/^(?:please )?(?:what|how much|show|tell me|check|find|when|where)\b|^(?:請|请)?(?:顯示|显示|查詢|查询|告訴我|告诉我|多少|何時|何时)/iu;
const literalTuitionLabel=/\b(?:tuition|fees?|charges?)\b|學費|学费|費用|费用/iu;

export function internshipAssistantPlan(question,route,history){
  const lookup=internshipLookupContext(question,route,history);
  if(!lookup.recognized)return null;
  const companion=lookup.otherQuestion.replace(/^(?:(?:also|then|separately)\s+)+|[?!.。！？，,]+$/giu,'').trim();
  const label=ownFeeBalanceLabel(companion);
  const explicitCompanion=lookup.reason!=='unsupported_operation'||independentRead.test(companion);
  const feeQuestion=explicitCompanion&&lookup.companion==='charges'&&(!label||literalTuitionLabel.test(label))?companion:'';
  const classQuestion=explicitCompanion&&lookup.companion==='courses'?companion:'';
  const companionFirst=Boolean((feeQuestion||classQuestion)&&question.normalize('NFKC').trimStart().startsWith(lookup.otherQuestion));
  return {...lookup,feeQuestion,feeLabel:feeQuestion?label:null,companionFirst,classQuestion,gradeQuestion:'',
    hasOtherQuestion:Boolean(companion&&!feeQuestion&&!classQuestion&&!excluded.test(companion))};
}

export function internshipSelectedTools(plan){
  return [...(plan.selection?['internshipRecords']:[]),...(plan.feeQuestion?['charges']:[]),...(plan.classQuestion?['courses']:[])];
}

export function internshipUnavailable(plan){
  return ['foreign_request','unsupported_operation','unsupported_authority','unsupported_field'].includes(plan.reason);
}

export function internshipBoundary(plan,question){
  const zh=/\p{Script=Han}/u.test(question),t=(en,cn)=>zh?cn:en;
  const lines=[];
  switch(plan.reason){
    case 'foreign_request':lines.push(t("I cannot show another student's internship records. I can check the records saved to your own account.", '我只能查詢本人帳戶的實習紀錄，無法查詢其他學生的紀錄。'));break;
    case 'unsupported_operation':lines.push(t('I cannot submit, sign or edit internship records here. No action was taken.','無法在此代為送出、簽署或修改實習紀錄。未執行操作。'));break;
    case 'unsupported_authority':lines.push(t('I cannot verify school approval, official filing, placement or institutional company registration here.','無法在此查驗校方核准、正式送出、實習分發或企業登錄。'));break;
    case 'unsupported_field':lines.push(t('The requested detail is unavailable in the saved internship records.','已儲存的實習紀錄無法提供此項資料。'));break;
    case 'excluded':lines.push(t('I skipped the excluded internship records.','已略過您排除的實習紀錄。'));break;
    case 'ambiguous_selector':
    case 'invalid_reference':
    case 'invalid_route':lines.push(t('Choose the exact internship contract, self-assessment, company application or directory view you want to check.','請選擇要查詢的實習合約、自評、企業申請或企業名單頁面。'));break;
  }
  if(plan.hasOtherQuestion)lines.push(t('Ask the other part separately so I can check the right records.','請單獨詢問另一部分，以便查核對應的紀錄。'));
  return lines.join('\n\n');
}

export function internshipGuestAnswer(plan,question){
  const zh=/\p{Script=Han}/u.test(question),t=(en,cn)=>zh?cn:en;
  const targets=[
    ...(plan.selection?[[plan.selection.route,t('Sign in to view your saved internship records','登入查看已儲存的實習紀錄')]]:[]),
    ...(plan.feeQuestion?[[feePath,t('Sign in to check your fee balance','登入查看學雜費')]]:[]),
    ...(plan.classQuestion?[[schoolSubjectRecordsPath,t('Sign in to check your next class','登入查看下一堂課')]]:[]),
  ];
  const citations=targets.map(([path,title])=>({
    chunkId:'directory:internship:'+path,title,url:'/school-affairs/login?next='+encodeURIComponent(path),
    claim:title,sourceName:'School Affairs',
  }));
  return {status:citations.length||internshipUnavailable(plan)?'handoff':'clarification',
    answer:[internshipBoundary(plan,question),...citations.map(({title,url})=>'['+title+']('+url+')')].filter(Boolean).join('\n\n'),
    citations,suggestedQuestions:[],grounding:{source:'directory',webSearched:false}};
}

export const internshipEvidenceUrls=Object.freeze(['contract','self_assessment','company','directory'].map(view=>internshipEvidencePath+'/'+view));
