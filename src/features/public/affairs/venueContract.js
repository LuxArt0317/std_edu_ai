export const venuePaths={apply:'/school-affairs/services/44-1',schedule:'/school-affairs/services/47-1',manage:'/school-affairs/admin/venues'};
export const venuePeriods=[
  ['M','07:10-08:00'],['1','08:10-09:00'],['2','09:10-10:00'],['3','10:10-11:00'],['4','11:10-12:00'],
  ['N','12:10-13:00'],['5','13:10-14:00'],['6','14:10-15:00'],['7','15:10-16:00'],['8','16:10-17:00'],
  ['E','17:10-18:00'],['A','18:20-19:10'],['B','19:15-20:05'],['C','20:10-21:00'],['D','21:05-21:55'],
];
export const venueCode=value=>typeof value==='string'&&/^[A-Z0-9-]{2,10}$/.test(value);
export function venueDate(value){
  if(typeof value!=='string'||!/^20\d\d-\d\d-\d\d$/.test(value))return false;
  const time=Date.parse(value);
  return Number.isFinite(time)&&new Date(time).toISOString().slice(0,10)===value;
}
export const moveVenueDate=(date,days)=>new Date(Date.parse(date)+days*86400000).toISOString().slice(0,10);
export function venueWeek(date=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())){
  return moveVenueDate(date,-((new Date(date).getUTCDay()+6)%7));
}
export function venueScheduleSelection(params){
  const code=params.get('code'),week=params.get('week');
  if(params.size!==2||!venueCode(code)||!venueDate(week)||venueWeek(week)!==week)return null;
  return {code,week};
}
export function venueQuestion(question){
  const topic=/\b(?:venues?|room bookings?|classroom bookings?|room reservations?|borrow (?:a )?(?:room|space))\b|場地借用|場地使用|場地預約/iu.test(question);
  if(!topic)return null;
  const personal=/\b(?:my|our|status of|pending|did i)\b|我的|申請進度|審核結果/iu.test(question);
  if(personal)return {view:'mine'};
  const match=question.match(/\b[A-Z]{1,3}\d{3,7}\b/i);
  const code=match?.[0].toUpperCase();
  const date=question.match(/\b20\d\d-\d\d-\d\d\b/)?.[0];
  const wantsAvailability=/\b(?:available|availability|schedule|free|occupied)\b|空堂|時段|使用狀況|有空/iu.test(question);
  return {view:wantsAvailability?'schedule':/\b(?:apply|request|reserve|borrow|book)\b|申請|預約/iu.test(question)?'apply':'schedule',code:venueCode(code)?code:undefined,date:venueDate(date)?date:undefined};
}
