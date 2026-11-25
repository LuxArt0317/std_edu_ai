import notice from './data/paymentNotice.json' with {type:'json'};
import {assistantLanguage} from '../src/services/assistantLanguage.js';
const compact=notice.text.replace(/\s+/gu,'');
const dateFromRoc=raw=>{const [y,m,d]=raw.split('/').map(Number);return y>=90&&y<200&&m>=1&&m<=12&&d>=1&&d<=31?`${y+1911}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`:null};
export function publicPaymentFacts(){
 const term=compact.match(/(\d{3})學年度?第(\d)學期註冊繳費事宜/);
 const deadline=compact.match(/繳款日期.*?至(\d{3}\/\d{1,2}\/\d{1,2})\(超商截至(\d{3}\/\d{1,2}\/\d{1,2})\)/);
 const card=compact.match(/信用卡通路繳費約需(\d+)個營業日/),store=compact.match(/超商通路繳費約需(\d+)[~～–-](\d+)個營業日/);
 const extension=compact.match(/註冊繳費:總務處出納組，洽分機(\d+)/);
 const channels=[['bank','銀行臨櫃','Bank counter'],['taiwanpay','台灣pay','Taiwan Pay'],['atm','自動櫃員機(ATM)','ATM bill-payment function'],['card','信用卡','Credit card'],['store','超商','Convenience store']].filter(([,zh])=>compact.toLowerCase().includes(zh.toLowerCase()));
 if(!term||!deadline||!card||!store||!extension||channels.length!==5)return null;
 const regular=dateFromRoc(deadline[1]),convenience=dateFromRoc(deadline[2]);if(!regular||!convenience)return null;
 return{year:Number(term[1]),semester:Number(term[2]),deadline:regular,storeDeadline:convenience,cardBusinessDays:Number(card[1]),storeBusinessDays:[Number(store[1]),Number(store[2])],extension:extension[1],channels,
  storeFee:compact.includes('超商繳費需另付手續費'),sameDay:/台灣Pay、ATM\(eATM\)、網路銀行、語音轉帳、臨櫃繳納等通路為當日銷帳/u.test(compact)};
}
export function publicPaymentAnswer(question){
 if(typeof question!=='string'||question.length>2000||!/\b(?:tuition|fees?|registration)\b|學費|學雜費|註冊/iu.test(question)||!/\b(?:payment (?:options?|methods?|channels?)|pay(?:ment)? deadlines?|when (?:do|must|should) i pay|ways? to pay)\b|繳費方式|繳款方式|繳費期限|繳費截止/iu.test(question))return null;
 if(/\b(?:my|our)\b.{0,30}\b(?:status|paid|balance|outstanding|receipt|history)\b|我的.{0,10}(?:繳費紀錄|餘額|欠費|收據)/iu.test(question))return null;
 const f=publicPaymentFacts();if(!f)return null;const zh=assistantLanguage(question)==='zh-Hant';
 const now=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());const expired=f.deadline<now;
 const show=value=>new Date(value+'T12:00:00Z').toLocaleDateString('en-GB',{day:'numeric',month:'long',year:'numeric',timeZone:'Asia/Taipei'});
 const lines=[zh?'可使用：'+f.channels.map(c=>c[1]).join('、')+'。'+(f.storeFee?'超商需另付手續費。':''):'Payment options listed are **'+f.channels.map(c=>c[2]).join(', ')+'**.'+(f.storeFee?' Convenience stores charge a handling fee.':''),
 zh?`這份通知為 **${f.year}-${f.semester}**：一般繳款截止 **${f.deadline}**，超商截止 **${f.storeDeadline}**。${expired?'這些日期已過，不能當作下一學期的繳費期限。':'請確認您的帳單適用同一學期。'}`:`The saved **${f.year}-${f.semester}** notice lists **${show(f.deadline)}** as the payment deadline and **${show(f.storeDeadline)}** for convenience-store payment. **${expired?'Those dates have passed; they are not the next semester’s deadlines.':'Confirm that your bill is for this term.'}**`,
 zh?`銷帳約需：信用卡 ${f.cardBusinessDays} 個營業日、超商 ${f.storeBusinessDays.join('–')} 個營業日。${f.sameDay?'通知所列台灣 Pay、ATM、網路銀行、語音轉帳及臨櫃等管道為當日銷帳。':''}收據的可下載時間另有說明，付款不一定立即顯示。`:`Allow about **${f.cardBusinessDays} business days for credit-card reconciliation** and **${f.storeBusinessDays.join('–')} business days for convenience stores**.${f.sameDay?' The notice lists same-day reconciliation for Taiwan Pay, ATM/eATM, online banking, phone transfer and counter payment.':''} Receipt availability is separate; a payment need not appear immediately.`,
 zh?`請由[繳費列印及查詢](/school-sites/cash.stu.edu.tw/%E6%9C%8D%E5%8B%99%E9%A0%85%E7%9B%AE/)取得正確學期的繳費單及銀行資料；不要匯款到聊天提供的帳號。需要確認期限或銷帳，請洽出納組 **07-6158000 分機 ${f.extension}**。`:`Get the applicable term’s bill through [Payment Printing & Lookup](/school-sites/cash.stu.edu.tw/%E6%9C%8D%E5%8B%99%E9%A0%85%E7%9B%AE/) and use its bank/payment details—not an account number supplied in chat. For the current deadline or reconciliation issues, contact the Cashier at **07-6158000 ext. ${f.extension}**.`,
 `[${zh?'查看註冊繳費通知':'Read the registration-payment notice'}](${notice.url})`];
 return{status:'answered',answer:lines.join('\n\n'),citations:[{chunkId:'source-payment-notice',title:notice.title,url:notice.url,sourceName:'Cashier · '+notice.capturedOn,claim:'Published payment channels, term-specific deadlines and reconciliation information.',locator:'Registration-payment notice',effectiveAt:null,reviewedAt:null}],suggestedQuestions:[],grounding:{source:'public-page-context',webSearched:false,checkedAt:new Date().toISOString(),retrieverVersion:'published-payment-projection@1'},verification:{status:'verified',attempts:0},activity:[{kind:'source-payment-notice',label:'Read the saved payment notice',detail:'Checked payment channels, the named term and deadline dates, and reconciliation notes; no personal payment was queried or changed.',status:'complete'}]};
}
