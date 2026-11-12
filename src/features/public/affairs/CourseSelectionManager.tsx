import {useRef,useState,type FormEvent} from 'react';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Textarea} from '@/components/ui/textarea';
import {courseSelectionPeriods,selectionPhaseOptions,semesterOptions,type CourseSelectionRecord} from '@/services/courseSelection';

export type CourseSelectionManagerProfile={user_id:string;display_name:string;email:string};
export type CourseSelectionSaveAction={kind:'save_course_selection';payload:Record<string,unknown>};
type MeetingDraft={key:string;weekday:string;period:string;room:string};
type Draft={userId:string;academicYear:string;semester:string;selectionPhase:string;termCourseCode:string;courseTitle:string;
  requiredElectiveText:string;credits:string;instructorOne:string;remarkText:string;rowOrder:string;timetableIncluded:boolean;meetings:MeetingDraft[]};
const selectClass='min-h-10 w-full min-w-0 rounded-md border border-input bg-background px-3 py-2 text-sm';
const weekdays=['星期一','星期二','星期三','星期四','星期五','星期六','星期日'];
const accountLabel=(profile:CourseSelectionManagerProfile)=>profile.display_name?`${profile.display_name} (${profile.email||profile.user_id})`:profile.email||profile.user_id;
const blank=():Draft=>({userId:'',academicYear:'',semester:'',selectionPhase:'',termCourseCode:'',courseTitle:'',requiredElectiveText:'',credits:'',instructorOne:'',remarkText:'',rowOrder:'0',timetableIncluded:false,meetings:[]});
const draftOf=(record:CourseSelectionRecord):Draft=>({userId:record.userId,academicYear:String(record.academicYear),semester:String(record.semester),selectionPhase:record.selectionPhase,
  termCourseCode:record.termCourseCode,courseTitle:record.courseTitle,requiredElectiveText:record.requiredElectiveText??'',credits:String(record.credits),
  instructorOne:record.instructorOne??'',remarkText:record.remarkText??'',rowOrder:String(record.rowOrder),timetableIncluded:record.timetableIncluded,
  meetings:record.meetings.map(slot=>({...slot,key:crypto.randomUUID(),weekday:String(slot.weekday)}))});
// Match jsonb's separators when enforcing the database's byte limit, including Unicode room labels.
const jsonText=(value:unknown):string=>Array.isArray(value)?'['+value.map(jsonText).join(', ')+']':value!==null&&typeof value==='object'
  ?'{'+Object.entries(value).map(([key,item])=>JSON.stringify(key)+': '+jsonText(item)).join(', ')+'}':JSON.stringify(value);

export function CourseSelectionManager({records,profiles,busy,onSave,onRefresh}:{
  records:CourseSelectionRecord[];profiles:CourseSelectionManagerProfile[];busy:boolean;
  onSave:(action:CourseSelectionSaveAction)=>Promise<boolean>;onRefresh?:()=>void|Promise<void>;
}) {
  const [editing,setEditing]=useState<CourseSelectionRecord|null>(null),[id,setId]=useState(()=>crypto.randomUUID()),[draft,setDraft]=useState<Draft>(blank);
  const [saving,setSaving]=useState(false),[refreshing,setRefreshing]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
  const receipt=useRef<{body:string;requestId:string}|null>(null),inFlight=useRef(false);
  const locked=busy||saving||refreshing,latest=records.find(record=>record.id===(editing?.id??id));
  const stale=Boolean(latest&&latest.version!==(editing?.version??0));
  const profileMap=new Map(profiles.map(profile=>[profile.user_id,accountLabel(profile)]));
  function change<K extends keyof Draft>(key:K,value:Draft[K]){setDraft(prior=>({...prior,[key]:value}));setError('');setMessage('');}
  function reset(){setEditing(null);setId(crypto.randomUUID());setDraft(blank());receipt.current=null;setError('');setMessage('');}
  function edit(record:CourseSelectionRecord){setEditing(record);setDraft(draftOf(record));receipt.current=null;setError('');setMessage('');}
  function meetingChange(key:string,field:'weekday'|'period'|'room',value:string){change('meetings',draft.meetings.map(slot=>slot.key===key?{...slot,[field]:value}:slot));}
  async function refresh(){
    if(locked||!onRefresh)return;
    setRefreshing(true);setError('');
    try{await onRefresh();setMessage('Refreshing saved records. Your draft is retained; load the latest saved version to replace it.');}
    catch(reason){setError(reason instanceof Error?reason.message:'Saved records could not be refreshed.');}
    finally{setRefreshing(false);}
  }
  async function submit(event:FormEvent<HTMLFormElement>){
    event.preventDefault();if(locked||inFlight.current)return;
    setError('');setMessage('');
    if(stale){setError('This record has a newer saved version. Load that version before saving.');return;}
    const integer=(value:string,min:number,max:number)=>/^\d+$/.test(value)&&Number(value)>=min&&Number(value)<=max;
    if(!draft.userId||!integer(draft.academicYear,1,9999)||!integer(draft.semester,1,3)
      ||!selectionPhaseOptions.some(option=>option.value===draft.selectionPhase)||!integer(draft.rowOrder,0,999999)){
      setError('Choose an account and phase, academic year 1–9999, semester 1–3, and display order 0–999999.');return;
    }
    if(!/^(?:\d+(?:\.\d{0,2})?|\.\d{1,2})$/.test(draft.credits)||Number(draft.credits)>999.99){
      setError('Credits must be from 0 to 999.99 with at most two decimal places.');return;
    }
    const textFields:[string,number,boolean][]=[[draft.termCourseCode,80,true],[draft.courseTitle,160,true],[draft.requiredElectiveText,30,false],[draft.instructorOne,160,false],[draft.remarkText,300,false]];
    if(textFields.some(([value,max,required])=>Array.from(value.trim()).length>max||(required&&!value.trim()))){setError('Enter a course code and title, and keep each label within its displayed length limit.');return;}
    const meetings=draft.meetings.map(slot=>({weekday:Number(slot.weekday),period:slot.period,room:slot.room.trim()}));
    if(meetings.length>98||meetings.some(slot=>!Number.isInteger(slot.weekday)||slot.weekday<1||slot.weekday>7
      ||!courseSelectionPeriods.some(period=>period.key===slot.period)||Array.from(slot.room).length>80)){
      setError('Use up to 98 meeting slots, a weekday and listed period for each, and room labels up to 80 characters.');return;
    }
    if(new Set(meetings.map(slot=>`${slot.weekday}:${slot.period}`)).size!==meetings.length){setError('Each weekday and period may appear only once in this record.');return;}
    const payload={id:editing?.id??id,user_id:editing?.userId??draft.userId,expected_version:String(editing?.version??0),
      academic_year:Number(draft.academicYear),semester:Number(draft.semester),selection_phase:draft.selectionPhase,
      term_course_code:draft.termCourseCode.trim(),course_title:draft.courseTitle.trim(),required_elective_text:draft.requiredElectiveText.trim(),
      credits:Number(draft.credits),instructor_one:draft.instructorOne.trim(),remark_text:draft.remarkText.trim(),row_order:Number(draft.rowOrder),
      timetable_included:draft.timetableIncluded,meetings};
    const body=JSON.stringify(payload);
    if(receipt.current?.body!==body)receipt.current={body,requestId:crypto.randomUUID()};
    const operation={...payload,request_id:receipt.current.requestId};
    if(new TextEncoder().encode(jsonText(operation)).length>10000){setError('This record exceeds the storage size limit. Shorten text or meeting room labels before saving.');return;}
    inFlight.current=true;setSaving(true);
    try{
      if(await onSave({kind:'save_course_selection',payload:operation})){reset();setMessage('Local course-selection record saved.');}
      else setError('The record was not saved. Your draft is retained. Retry, or refresh and load the latest saved version if it changed.');
    }catch(reason){setError(reason instanceof Error?reason.message:'Course-selection record could not be saved. Your draft is retained.');}
    finally{inFlight.current=false;setSaving(false);}
  }
  return <section className="course-selection-manager mt-8 min-w-0 space-y-4" aria-label="Course-selection record manager">
    <header><h3>Course-selection records · 選課紀錄與課表</h3><p>Maintain stu.best local records for each selection phase. Choose timetable inclusion explicitly and enter the saved meeting slots.</p></header>
    {error&&<p role="alert" className="text-destructive">{error}</p>}{message&&<p role="status">{message}</p>}
    {stale&&<p role="status">A newer saved version is available. Your draft has not been replaced.</p>}
    <div className="flex flex-wrap gap-2">
      {onRefresh&&<Button type="button" variant="outline" disabled={locked} onClick={()=>void refresh()}>{refreshing?'Refreshing course-selection records…':'Refresh course-selection records'}</Button>}
      {latest&&stale&&<Button type="button" variant="outline" disabled={locked} onClick={()=>edit(latest)}>Load latest saved version</Button>}
    </div>
    <ul className="grid list-none gap-3 p-0">{records.map(record=><li key={record.id} className="flex min-w-0 flex-wrap items-center justify-between gap-3 rounded-md border p-3">
      <span className="min-w-0 [overflow-wrap:anywhere]"><strong>{profileMap.get(record.userId)??record.userId}</strong> · {record.academicYear}-{record.semester} · {selectionPhaseOptions.find(option=>option.value===record.selectionPhase)?.label}<br/>
        {record.termCourseCode} · {record.courseTitle} · {record.credits} 學分 · {record.timetableIncluded?'Included in timetable':'Not included in timetable'} · {record.meetings.length} meeting slots</span>
      <Button type="button" variant="outline" size="sm" disabled={locked} onClick={()=>edit(record)}>Edit course-selection record</Button>
    </li>)}</ul>
    {profiles.length===0&&!editing?<p>No account profiles are available.</p>:<form className="grid min-w-0 gap-4" onSubmit={event=>void submit(event)}>
      <h4>{editing?'Edit local course-selection record':'Add local course-selection record'}</h4>
      <fieldset disabled={locked} className="m-0 grid min-w-0 gap-4 border-0 p-0">
        <label className="grid gap-1">Course-selection account<select className={selectClass} aria-label="Course-selection account" required disabled={Boolean(editing)} value={draft.userId} onChange={event=>change('userId',event.target.value)}>
          <option value="">Choose an account</option>{editing&&!profiles.some(profile=>profile.user_id===editing.userId)&&<option value={editing.userId}>{editing.userId}</option>}
          {profiles.map(profile=><option key={profile.user_id} value={profile.user_id}>{accountLabel(profile)}</option>)}
        </select></label>
        <div className="grid min-w-0 gap-4 md:grid-cols-2">
          <label className="grid gap-1">Academic year · 學年<Input type="number" required min={1} max={9999} step={1} value={draft.academicYear} onChange={event=>change('academicYear',event.target.value)}/></label>
          <label className="grid gap-1">Semester · 學期<select className={selectClass} aria-label="Semester · 學期" required value={draft.semester} onChange={event=>change('semester',event.target.value)}><option value="">Choose a semester</option>{semesterOptions.map(option=><option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
          <label className="grid gap-1">Selection phase · 選課階段<select className={selectClass} aria-label="Selection phase · 選課階段" required value={draft.selectionPhase} onChange={event=>change('selectionPhase',event.target.value)}><option value="">Choose a phase</option>{selectionPhaseOptions.map(option=><option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
          <label className="grid gap-1">Term course code · 當學期課號<Input required maxLength={80} value={draft.termCourseCode} onChange={event=>change('termCourseCode',event.target.value)}/></label>
          <label className="grid gap-1">Course title · 科目名稱<Input required maxLength={160} value={draft.courseTitle} onChange={event=>change('courseTitle',event.target.value)}/></label>
          <label className="grid gap-1">Required/elective label · 必選修<Input maxLength={30} value={draft.requiredElectiveText} onChange={event=>change('requiredElectiveText',event.target.value)}/></label>
          <label className="grid gap-1">Credits · 學分<Input type="number" required min={0} max={999.99} step="0.01" value={draft.credits} onChange={event=>change('credits',event.target.value)}/></label>
          <label className="grid gap-1">Instructor one · 任課教師一<Input maxLength={160} value={draft.instructorOne} onChange={event=>change('instructorOne',event.target.value)}/></label>
          <label className="grid gap-1">Remark · 備註<Textarea aria-label="Remark · 備註" maxLength={300} value={draft.remarkText} onChange={event=>change('remarkText',event.target.value)}/></label>
          <label className="grid gap-1">Display order · 顯示順序<Input type="number" required min={0} max={999999} step={1} value={draft.rowOrder} onChange={event=>change('rowOrder',event.target.value)}/></label>
        </div>
        <label className="flex items-center gap-2"><input type="checkbox" checked={draft.timetableIncluded} onChange={event=>change('timetableIncluded',event.target.checked)}/>Include in weekly timetable · 顯示於課表</label>
        {draft.timetableIncluded&&!draft.meetings.length&&<p>Included without meeting slots: shown as unscheduled.</p>}
        <fieldset className="m-0 grid min-w-0 gap-3 rounded-md border p-3"><legend>Meeting slots · 上課時段</legend>
          {draft.meetings.length===0&&<p>No meeting slots recorded.</p>}
          {draft.meetings.map((slot,index)=><fieldset key={slot.key} className="m-0 grid min-w-0 gap-3 rounded-md border p-3 md:grid-cols-3"><legend>Meeting {index+1}</legend>
            <label className="grid gap-1">Weekday · 星期<select className={selectClass} aria-label={`Meeting ${index+1} weekday`} value={slot.weekday} onChange={event=>meetingChange(slot.key,'weekday',event.target.value)}>{weekdays.map((label,index)=><option key={label} value={index+1}>{label}</option>)}</select></label>
            <label className="grid gap-1">Period · 節次<select className={selectClass} aria-label={`Meeting ${index+1} period`} value={slot.period} onChange={event=>meetingChange(slot.key,'period',event.target.value)}>{courseSelectionPeriods.map(period=><option key={period.key} value={period.key}>{period.key} · {period.start}–{period.end}</option>)}</select></label>
            <label className="grid gap-1">Room · 教室<Input aria-label={`Meeting ${index+1} room`} maxLength={80} value={slot.room} onChange={event=>meetingChange(slot.key,'room',event.target.value)}/></label>
            <Button type="button" variant="outline" onClick={()=>change('meetings',draft.meetings.filter(item=>item.key!==slot.key))}>Remove meeting {index+1}</Button>
          </fieldset>)}
          <div className="flex flex-wrap gap-2"><Button type="button" variant="outline" disabled={draft.meetings.length>=98} onClick={()=>change('meetings',[...draft.meetings,{key:crypto.randomUUID(),weekday:'1',period:'1',room:''}])}>Add meeting slot</Button>
            {!!draft.meetings.length&&<Button type="button" variant="outline" onClick={()=>change('meetings',[])}>Clear meeting slots</Button>}</div>
        </fieldset>
        <div className="flex flex-wrap gap-2"><Button type="submit" disabled={stale}>{saving?'Saving course-selection record…':'Save course-selection record'}</Button><Button type="button" variant="outline" onClick={reset}>{editing?'Cancel course-selection edit':'Clear course-selection form'}</Button></div>
      </fieldset>
    </form>}
  </section>;
}
