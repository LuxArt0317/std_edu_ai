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
  const match=/^(\d{2}):(\d{2})/.exec(time||'');
  return match?Number(match[1])*60+Number(match[2]):null;
}
function meeting(course,day) {
  const weekday=new Date(`${day}T00:00:00Z`).getUTCDay()||7;
  return course.status==='enrolled' && course.weekday===weekday
    && course.termStartsOn<=day && course.termEndsOn>=day && minutes(course.startsAt)!==null;
}
export function studyCalendar(courses,instant=new Date().toISOString()) {
  const now=clock(instant);
  const current=courses.filter(course=>course.status==='enrolled' && course.termStartsOn<=now.day && course.termEndsOn>=now.day);
  const upcoming=courses.filter(course=>course.status==='enrolled' && course.termStartsOn>now.day);
  const historical=courses.filter(course=>course.status!=='withdrawn' && (course.status==='completed' || course.termEndsOn<now.day));
  const today=current.filter(course=>meeting(course,now.day)).sort((a,b)=>minutes(a.startsAt)-minutes(b.startsAt));
  let next=null;
  const start=new Date(`${now.day}T00:00:00Z`);
  for(let offset=0;offset<21 && !next;offset++) {
    const day=new Date(start.getTime()+offset*86_400_000).toISOString().slice(0,10);
    const options=current.filter(course=>meeting(course,day) && (offset>0 || minutes(course.startsAt)>now.minute))
      .sort((a,b)=>minutes(a.startsAt)-minutes(b.startsAt));
    if(options.length)next={course:options[0],day};
  }
  return {today,current,upcoming,historical,next,day:now.day,timeZone:campusZone};
}
