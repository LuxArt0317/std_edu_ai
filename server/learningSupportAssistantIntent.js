import {learningSupportPath as path} from '../src/features/public/affairs/studentServices.js';
const topic='learning[- ]support (?:applications?|requests?)';
const statusQuery="(?:what(?: is|[’']s)|show(?: me)?|check|tell me)";
const status=new RegExp('^(?:(?:please )?'+statusQuery+' (?:(?:the )?(?:(?:current|site|saved) )?status of my '+topic+
  '|my '+topic+' (?:(?:current|site|saved) )?status)'+
  '|(?:have|did) i (?:submit(?:ted)?|file(?:d)?) (?:a |my )?'+topic+')$','iu');
const count=new RegExp('^(?:how many (?:saved |of my |my )?'+topic+'(?: do i have| have i submitted| are saved)?'+
  '|(?:please )?count my '+topic+')$','iu');
const scoped=/^(?:what(?: is|[’']s) (?:the )?status of my (?:application|request)|(?:show|check) my (?:application|request) status)$/iu;

export function learningSupportQuestion(question,route=''){
  if(typeof question!=='string'||question.length>300)return null;
  const text=question.normalize('NFKC').trim().replace(/[?.!？。！]+$/u,'').trim();
  const zh=/\p{Script=Han}/u.test(text);
  if(count.test(text)||/^(?:請問)?我(?:有|已送出)?(?:幾筆|多少筆)(?:學習輔導|完善就學)(?:申請|請求)$/u.test(text))return {kind:'count',zh};
  if(status.test(text)||/^(?:請問|查詢|顯示)?我(?:的|已送出)?(?:學習輔導|完善就學)(?:申請|請求)(?:的)?(?:狀態|進度)(?:如何|是什麼)?$/u.test(text))return {kind:'status',zh};
  if([path,path+'/',('https://stu.best'+path),('https://stu.best'+path+'/')].includes(route)&&scoped.test(text))return {kind:'status',zh};
  return null;
}
