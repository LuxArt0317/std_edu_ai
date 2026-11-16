import {feeRemissionUuid} from './feeRemissionContract.js';

export const studentProfilePath='/school-affairs/services/8-1';
export const studentProfileScope='student-profile';
export const profileFieldLengths={
  student_number:40,name_zh:120,name_en:160,identity_last_four:4,birthday_label:40,gender:6,
  overseas:0,overseas_place:120,indigenous:0,indigenous_place:120,registered_address:300,mailing_address:300,
  postal_code:20,home_phone:40,contact_phone:40,original_mobile:40,guardian:120,occupation:120,
};
export const profileFieldLabels={
  student_number:'學號',name_zh:'中文姓名',name_en:'英文姓名',identity_last_four:'身份證字號末四碼',birthday_label:'生日',
  gender:'性別',overseas:'是否僑生',overseas_place:'僑居地',indigenous:'是否原住民',indigenous_place:'原住民地',
  registered_address:'戶籍地址',mailing_address:'通訊地址',postal_code:'郵遞區號',home_phone:'戶籍電話',
  contact_phone:'聯絡電話',original_mobile:'原行動電話',guardian:'監護人',occupation:'職業',
};
const fields=Object.keys(profileFieldLengths);
const exact=(value,keys)=>Boolean(value&&typeof value==='object'&&!Array.isArray(value)&&
  Object.keys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key)));
const version=(value,min,max)=>Number.isInteger(value)&&value>=min&&value<=max;
const date=value=>value===null||(typeof value==='string'&&/^\d{4}-\d{2}-\d{2}T/u.test(value)&&Number.isFinite(Date.parse(value)));
export const validProfileMobile=value=>value===null||(typeof value==='string'&&/^[+0-9 ()-]{3,20}$/u.test(value)&&/[0-9]/u.test(value));

function validDetails(record){
  return exact(record,fields)&&typeof record.student_number==='string'&&Boolean(record.student_number.trim())&&
    typeof record.name_zh==='string'&&Boolean(record.name_zh.trim())&&fields.every(key=>{
      const value=record[key];
      if(value===null)return true;
      if(key==='gender')return ['male','female'].includes(value);
      if(key==='identity_last_four')return typeof value==='string'&&/^[A-Za-z0-9]{4}$/u.test(value);
      const max=profileFieldLengths[key];
      return max===0?typeof value==='boolean':typeof value==='string'&&[...value].length<=max;
    });
}

export function parseStudentProfile(value,userId){
  if(!exact(value,['userId','record'])||value.userId!==userId)throw new Error('Invalid student profile response.');
  if(value.record===null)return value;
  const {user_id,version:revision,confirmed_at,updated_mobile,...details}=value.record;
  if(user_id!==userId||!version(revision,1,1000000)||!date(confirmed_at)||!validProfileMobile(updated_mobile)||!validDetails(details))
    throw new Error('Invalid student profile record.');
  return value;
}

export function validProfileAction(operation,payload){
  if(!payload||!feeRemissionUuid(payload.request_id)||!version(payload.expected_version,0,999999))return false;
  if(operation==='confirm')return exact(payload,['updated_mobile','confirmed','expected_version','request_id'])&&
    payload.confirmed===true&&payload.expected_version>0&&validProfileMobile(payload.updated_mobile);
  return operation==='save'&&exact(payload,['user_id','record','expected_version','request_id'])&&
    feeRemissionUuid(payload.user_id)&&validDetails(payload.record);
}

export function parseProfileReceipt(value,userId,expected,operation){
  if(!exact(value,['userId','version','confirmedAt'])||value.userId!==userId||value.version!==expected+1||
    !date(value.confirmedAt)||(operation==='confirm'?value.confirmedAt===null:value.confirmedAt!==null))
    throw new Error('Invalid student profile receipt.');
  return value;
}

export function studentProfileQuestion(question) {
  const q=question.normalize('NFKC').trim();
  if(/\b(?:password|token|code this|python|javascript|write code)\b|密碼|密码/iu.test(q))return null;
  const subject=/\bstudent (?:profile|(?:basic )?information|details)\b|學生基本資料|學籍基本資料/iu.test(q);
  if(/\b(?:another|other) student(?:['’]s)?\b|\bmy (?:classmate|friend|roommate)['’]s\b|別人|别人|他人|其他學生|其他学生/iu.test(q))
    return subject?'foreign':null;
  if(subject&&(
    /\b(?:have i|did i)\b.{0,30}\b(?:confirm(?:ed)?|complete(?:d)?)\b|\b(?:is|was) my\b.{0,55}\b(?:confirmed|complete(?:d)?)\b|\bmy\b.{0,45}\bconfirmation status\b/iu.test(q)||
    /我(?:的|已|有|是否)|確認狀態/u.test(q)&&/已(?:經)?確認|確認了嗎|是否確認|有沒有確認|確認狀態/u.test(q)
  ))return 'status';
  if(/學生基本資料確認|學籍基本資料確認|更新行動電話|\b(?:student (?:profile|information|details) confirmation|update (?:my |the )?(?:student profile|mobile number)|confirm (?:my |the )?student (?:profile|information|details))\b/iu.test(q))return 'guide';
  return null;
}

export function studentProfileForeignAnswer(question){
  return {status:'handoff',answer:/[\u3400-\u9fff]/u.test(question)
    ?'我無法查閱另一位學生的基本資料。':'I can’t access another student’s profile records.',citations:[],suggestedQuestions:[]};
}
