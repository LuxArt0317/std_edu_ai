import { useState, type ChangeEvent, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { savePersonalSchoolRecord, type DeadlineImport } from '@/services/schoolAffairsWorkspace';
import { calendarFileLimit, calendarSelectionLimit, parseMoodleCalendar } from './calendarImport';
import { deadlineLabel, type DtmTranslate } from './locale';

export function CalendarDeadlineImport({courseId,t,onImported}:{
  courseId:string;t:DtmTranslate;onImported:(count:number)=>void;
}) {
  const [events,setEvents] = useState<DeadlineImport[]>([]);
  const [selected,setSelected] = useState<Set<string>>(new Set());
  const [skipped,setSkipped] = useState(0);
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState('');

  async function readFile(event:ChangeEvent<HTMLInputElement>) {
    const file=event.currentTarget.files?.[0];
    setError('');
    setEvents([]);
    setSelected(new Set());
    setSkipped(0);
    if (!file) return;
    if (file.size>calendarFileLimit) {
      setError(t('請選擇小於 256 KB 的行事曆檔案。','Choose a calendar file under 256 KB.'));
      return;
    }
    setBusy(true);
    try {
      const parsed=await parseMoodleCalendar(await file.text());
      setEvents(parsed.events);
      setSkipped(parsed.skipped);
      if (!parsed.events.length) setError(t('找不到可匯入的日期。','No supported calendar dates were found.'));
    } catch (reason) {
      setError(reason instanceof Error?reason.message:t('無法讀取行事曆。','Unable to read this calendar.'));
    } finally {setBusy(false);}
  }
  function toggle(key:string) {
    setSelected(current=>{
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else if (next.size<calendarSelectionLimit) next.add(key);
      return next;
    });
  }
  async function submit(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !selected.size) return;
    setBusy(true);
    setError('');
    try {
      const result = await savePersonalSchoolRecord({kind:'import_dtm_deadlines',payload:{
        course_id:courseId, events:events.filter(item=>selected.has(item.import_key)),
      }});
      onImported(result.imported ?? 0);
    } catch (reason) {
      setError(reason instanceof Error?reason.message:t('無法匯入作業日期。','Unable to import these deadlines.'));
    } finally {setBusy(false);}
  }
  return <form className="dtm-record-form" onSubmit={submit}>
    <p>{t('從 Moodle 行事曆下載 .ics 檔，選取屬於這門課的作業日期。','Download an .ics file from Moodle Calendar and select the assignment deadlines for this course.')}</p>
    <p className="dtm-note">{t('僅儲存選取的標題與日期。日期與時間以臺灣時間顯示。','The import saves the selected titles and dates. Deadlines display in Taipei time.')}</p>
    <label>{t('Moodle 行事曆檔案','Moodle calendar file')}<Input type="file" accept=".ics,text/calendar" disabled={busy} onChange={event=>void readFile(event)}/></label>
    {skipped>0 && <p className="dtm-note">{t('略過無效、重複或不支援的事件','Skipped invalid, duplicate, or unsupported events')}: {skipped}</p>}
    {events.length>0 && <fieldset className="dtm-import-events">
      <legend>{t('選擇要匯入的截止日期','Choose deadlines to import')} ({selected.size}/{calendarSelectionLimit})</legend>
      {events.map(item=><label key={item.import_key}>
        <input type="checkbox" checked={selected.has(item.import_key)} disabled={busy||selected.size===calendarSelectionLimit&&!selected.has(item.import_key)} onChange={()=>toggle(item.import_key)}/>
        <span>{item.title}<small>{deadlineLabel(item.due_at,t)}</small></span>
      </label>)}
    </fieldset>}
    {error && <p role="alert" className="dtm-error">{error}</p>}
    <div className="dtm-form-actions"><Button type="submit" disabled={busy||!selected.size}>{t('匯入已選取的日期','Import selected deadlines')}</Button></div>
  </form>;
}
