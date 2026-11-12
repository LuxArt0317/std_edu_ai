import type { DeadlineImport } from '@/services/schoolAffairsWorkspace';

export const calendarFileLimit = 256 * 1024;
export const calendarSelectionLimit = 50;

function parseStart(value:string, parameters:string) {
  const zone = /(?:^|;)TZID="?([^";]+)"?/i.exec(parameters)?.[1];
  if (zone && !['Asia/Taipei','UTC','Etc/UTC'].includes(zone)) return null;
  const match = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/.exec(value);
  if (!match) return null;
  const [,year,month,day,hour='23',minute='59',second='00',utc] = match;
  if (Number(year)<2000 || Number(year)>2100 || Number(hour)>23 || Number(minute)>59 || Number(second)>59) return null;
  const date = year+'-'+month+'-'+day;
  const midnight = new Date(date+'T00:00:00Z');
  if (!Number.isFinite(midnight.getTime()) || midnight.toISOString().slice(0,10)!==date) return null;
  const zoneOffset = utc || zone==='UTC' || zone==='Etc/UTC' ? 'Z' : '+08:00';
  return new Date(date+'T'+hour+':'+minute+':'+second+zoneOffset).toISOString();
}

function unescapeSummary(value:string) {
  return value.replace(/\\([nN,;\\])/g,(_,character:string)=>/[nN]/.test(character)?' ':character).trim();
}

export async function parseMoodleCalendar(text:string):Promise<{events:DeadlineImport[];skipped:number}> {
  if (new TextEncoder().encode(text).byteLength>calendarFileLimit) throw new Error('Choose a calendar file under 256 KB.');
  const lines = text.replace(/^\uFEFF/,'').replace(/\r\n|\r/g,'\n').replace(/\n[ \t]/g,'').split('\n');
  if (!lines.some(line=>line.trim().toUpperCase()==='BEGIN:VCALENDAR')) throw new Error('Choose a Moodle calendar .ics export.');
  let event: {title:string;due:string|null;uid:string;skip:boolean}|null = null;
  let skipped = 0;
  let depth = 0;
  const events:DeadlineImport[] = [];
  const keys = new Set<string>();
  for (const line of lines) {
    const separator = line.indexOf(':');
    if (separator<0) continue;
    const name = line.slice(0,separator);
    const property = name.split(';',1)[0].toUpperCase();
    const value = line.slice(separator+1).trim();
    if (property==='BEGIN' && value.toUpperCase()==='VEVENT' && !event) {
      event={title:'',due:null,uid:'',skip:false};
      depth=0;
      continue;
    }
    if (!event) continue;
    if (property==='BEGIN') {depth++;continue;}
    if (property==='END' && depth>0) {depth--;continue;}
    if (depth>0) continue;
    if (property==='END' && value.toUpperCase()==='VEVENT') {
      if (event.skip || Array.from(event.title).length<3 || !event.due || events.length>=250) {
        skipped++;
      } else {
        const fingerprint = new TextEncoder().encode('moodle-calendar\0'+(event.uid || event.title+'\0'+event.due));
        const hash = new Uint8Array(await crypto.subtle.digest('SHA-256',fingerprint));
        const importKey = Array.from(hash,byte=>byte.toString(16).padStart(2,'0')).join('');
        if (!keys.has(importKey)) {
          keys.add(importKey);
          events.push({title:Array.from(event.title).slice(0,160).join(''),due_at:event.due,import_key:importKey});
        } else skipped++;
      }
      event=null;
    } else if (property==='SUMMARY') event.title=unescapeSummary(value);
    else if (property==='DTSTART') event.due=parseStart(value,name);
    else if (property==='UID') event.uid=value;
    else if (property==='RRULE'||(property==='STATUS'&&value.toUpperCase()==='CANCELLED')) event.skip=true;
  }
  return {events:events.sort((a,b)=>a.due_at.localeCompare(b.due_at)),skipped};
}
