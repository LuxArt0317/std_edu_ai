/** Date-only school timetable calculations in the campus time zone. */
const campusZone='Asia/Taipei';
const two=value=>String(value).padStart(2,'0');
function clock(instant) {
  const parts=Object.fromEntries(new Intl.DateTimeFormat('en-US',{
    timeZone:campusZone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23',
  }).formatToParts(new Date(instant)).filter(part=>part.type!=='literal').map(part=>[part.type,Number(part.value)]));
  const day=`${parts.year}-${two(parts.month)}-${two(parts.day)}`;
  return {day,minute:parts.hour*60+parts.minute};
}
function minutes(time) {
  const match=/^(\d{2}):(\d{2})(?::\d{2})?$/.exec(time||'');
  return match&&Number(match[1])<24&&Number(match[2])<60?Number(match[1])*60+Number(match[2]):null;
}
function validDay(day) {
  if(typeof day!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(day))return false;
  const instant=Date.parse(day+'T00:00:00Z');
  return Number.isFinite(instant)&&new Date(instant).toISOString().slice(0,10)===day;
}
const validWindow=course=>validDay(course.termStartsOn)&&validDay(course.termEndsOn)&&course.termStartsOn<=course.termEndsOn;
const weekday=day=>new Date(`${day}T00:00:00Z`).getUTCDay()||7;
const addDays=(day,days)=>new Date(Date.parse(day+'T00:00:00Z')+days*86_400_000).toISOString().slice(0,10);
function meeting(course,day) {
  return course.status==='enrolled' && course.weekday===weekday(day) && validWindow(course)
    && course.termStartsOn<=day && course.termEndsOn>=day && minutes(course.startsAt)!==null;
}
export function studyCalendar(courses,instant=new Date().toISOString()) {
  const now=clock(instant);
  const current=courses.filter(course=>course.status==='enrolled' && validWindow(course) && course.termStartsOn<=now.day && course.termEndsOn>=now.day);
  const upcoming=courses.filter(course=>course.status==='enrolled' && validWindow(course) && course.termStartsOn>now.day);
  const historical=courses.filter(course=>course.status!=='withdrawn' && (course.status==='completed' || validDay(course.termEndsOn)&&course.termEndsOn<now.day));
  const today=current.filter(course=>meeting(course,now.day)).sort((a,b)=>minutes(a.startsAt)-minutes(b.startsAt));
  // Find each enrollment's first eligible weekly meeting directly. Future terms
  // can begin beyond an arbitrary 21-day window and still be the next known class.
  const candidates=[...current,...upcoming].flatMap(course=>{
    if(!Number.isInteger(course.weekday)||course.weekday<1||course.weekday>7||minutes(course.startsAt)===null)return [];
    const start=course.termStartsOn>now.day?course.termStartsOn:now.day;
    let day=addDays(start,(course.weekday-weekday(start)+7)%7);
    if(day===now.day&&minutes(course.startsAt)<=now.minute)day=addDays(day,7);
    return day<=course.termEndsOn?[{course,day}]:[];
  }).sort((a,b)=>a.day.localeCompare(b.day)||minutes(a.course.startsAt)-minutes(b.course.startsAt));
  return {today,current,upcoming,historical,next:candidates[0]||null,day:now.day,timeZone:campusZone};
}
