export const studentLeaveDraftAction='create_student_leave_draft';

export const studentLeaveDraftCategories={
  personal:['Personal leave','事假'],
  sick:['Sick leave','病假'],
  official:['Official duty','公假'],
  bereavement:['Bereavement leave','喪假'],
  nursing:['Nursing leave','哺育假'],
  mental_health:['Mental health leave','心理假'],
  maternity:['Maternity leave','產假'],
  menstrual:['Menstrual leave','生理假'],
};

const fields=['starts_on','ends_on','leave_category','periods','leave_time_period','notes'];
const control=/[\p{Cs}\p{Cc}]/u;
const validText=(value,min,max)=>typeof value==='string'&&value===value.trim()&&!control.test(value)
  &&[...value].length>=min&&[...value].length<=max;

function leaveDate(date){
  if(!/^(?:20\d{2}|2100)-\d{2}-\d{2}$/u.test(date))return false;
  const time=new Date(date+'T00:00:00Z');
  return Number.isFinite(time.getTime())&&time.toISOString().slice(0,10)===date;
}

export function validStudentLeaveDraft(payload){
  if(!payload||typeof payload!=='object'||Array.isArray(payload)
    ||Object.keys(payload).length!==fields.length||!fields.every(field=>Object.hasOwn(payload,field)))return false;
  const {starts_on,ends_on,leave_category,periods,leave_time_period,notes}=payload;
  return typeof starts_on==='string'&&typeof ends_on==='string'&&leaveDate(starts_on)&&leaveDate(ends_on)&&starts_on<=ends_on
    &&typeof leave_category==='string'&&Object.hasOwn(studentLeaveDraftCategories,leave_category)
    &&(leave_category==='mental_health'?['am','pm','day'].includes(leave_time_period):leave_time_period==='')
    &&validText(periods,1,80)&&validText(notes,0,2000);
}

const englishAction=/^(?:create|save|prepare)\s+(?:(?:a|my|the)\s+)?(?:(?:personal|sick|official|bereavement|nursing|mental health|maternity|menstrual|student)\s+)?leave draft\b/iu;
const englishRequest=/^(?:help me )?draft\s+((?:(?:a|my|the)\s+)?(?:(?:personal|sick|official|bereavement|nursing|mental health|maternity|menstrual|student)\s+)?leave) (?:form|request|application)\b/iu;
const chineseAction=/^(?:幫我|帮我)?(?:建立|新增|儲存|保存|準備)(?:我的|一筆)?(?:學生)?(?:請假|事假|病假|公假|喪假|哺育假|心理假|產假|生理假)(?:假單)?草稿/u;
const englishDetails=/^(?:create|save|prepare)\s+(?:(?:a|my|the)\s+)?(personal|sick|official|bereavement|nursing|mental health|maternity|menstrual) leave draft (?:for|on) (\d{4}-\d{2}-\d{2})(?: (?:to|through) (\d{4}-\d{2}-\d{2}))?,? periods ["“]([^"”\r\n]+)["”](?:,? time (am|pm|day))?(?:,? (?:with )?(?:notes?|reason) ["“]([^"”\r\n]*)["”])?$/iu;
const chineseDetails=/^(?:幫我|帮我)?(?:建立|新增|儲存|保存|準備)(?:我的|一筆)?(?:學生)?(事假|病假|公假|喪假|哺育假|心理假|產假|生理假)(?:假單)?草稿\s+(\d{4}-\d{2}-\d{2})(?:\s*至\s*(\d{4}-\d{2}-\d{2}))?\s*[,，]?\s*節次「([^」\r\n]+)」(?:\s*[,，]?\s*時段(上午|下午|全天))?(?:\s*[,，]?\s*(?:事由|備註)「([^」\r\n]*)」)?$/u;
const chineseTimes={上午:'am',下午:'pm',全天:'day'};

export function parseStudentLeaveDraft(command){
  const text=command.replace(englishRequest,'prepare $1 draft');
  if(!englishAction.test(text)&&!chineseAction.test(text))return null;
  const match=englishDetails.exec(text)??chineseDetails.exec(text);
  if(!match)return {kind:studentLeaveDraftAction,draft:null,ambiguous:true};
  const [,category,start,end,periods,time,notes]=match;
  const key=Object.keys(studentLeaveDraftCategories).find(key=>
    key.replace('_',' ')===category.toLowerCase()||studentLeaveDraftCategories[key][1]===category);
  const draft={
    starts_on:start,ends_on:end??start,leave_category:key,periods:periods.trim(),
    leave_time_period:time?(chineseTimes[time]??time.toLowerCase()):'',notes:notes?.trim()??'',
  };
  return validStudentLeaveDraft(draft)
    ?{kind:studentLeaveDraftAction,draft,ambiguous:false}
    :{kind:studentLeaveDraftAction,draft:null,ambiguous:true};
}
