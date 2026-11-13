import {useRef,useState,type FormEvent} from 'react';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import type {AcademicAttendanceRecords,AcademicAttendanceStatistic,AcademicAttendanceDetail,AcademicAttendanceMetadata} from '@/services/academicAttendance';
import {academicAttendanceFields,validateAcademicAttendancePayload} from '../../../../server/academicAttendance.js';

type Kind='save_academic_attendance_statistic'|'save_academic_attendance_detail'|'save_academic_attendance_metadata';
export type AcademicAttendanceSaveAction={kind:Kind;payload:Record<string,unknown>};
type Row=AcademicAttendanceStatistic|AcademicAttendanceDetail|AcademicAttendanceMetadata;
type Field={key:string;label:string;type?:'number'|'date';max?:number;maxLength?:number;required?:boolean;integer?:boolean};
const groups:[Kind,string][]=[['save_academic_attendance_statistic','Absence statistics · 缺曠課統計'],['save_academic_attendance_detail','Absence details · 缺曠課明細'],['save_academic_attendance_metadata','Current term · 當學期']];
const termFields:Field[]=[{key:'academic_year',label:'Academic year · 學年',type:'number',max:9999,required:true,integer:true},{key:'semester',label:'Semester · 學期 (1–3)',type:'number',max:3,required:true,integer:true}];
const courseFields:Field[]=[{key:'course_code',label:'Course code · 課號',required:true,maxLength:80},{key:'course_title',label:'Course name · 課程名稱',required:true,maxLength:160}];
const fields:Record<Kind,Field[]>={
  save_academic_attendance_statistic:[...termFields,{key:'student_number',label:'Student number · 學號',maxLength:80},{key:'student_name',label:'Student name · 姓名',maxLength:160},...courseFields,
    ...[['total_teaching_hours','Full-term teaching hours · 本學期授課總時數'],['current_teaching_weeks','Teaching weeks to date · 目前授課總週次'],['current_teaching_hours','Teaching hours to date · 目前授課總時數'],['absence_hours','Absence hours · 目前缺課時數'],['unexcused_absence_hours','Unexcused absence hours · 目前曠課時數']].map(([key,label])=>({key,label,type:'number' as const,max:9999.99}))],
  save_academic_attendance_detail:[...termFields,...courseFields,{key:'teacher_name',label:'Teacher · 授課老師',maxLength:160},{key:'absence_type_text',label:'Recorded category · 類別',maxLength:80},
    {key:'course_date',label:'Class date · 課程日期',type:'date'},{key:'period_text',label:'Period · 節次',maxLength:80},{key:'roll_called_at',label:'Roll-call time · ISO date with UTC offset',maxLength:40}],
  save_academic_attendance_metadata:[{key:'current_academic_year',label:'Current academic year · 當學年',type:'number',max:9999,integer:true},{key:'current_semester',label:'Current semester · 當學期 (1–3)',type:'number',max:3,integer:true}],
};
const blank=()=>({user_id:'',row_order:'0'} as Record<string,string>);
const rowsFor=(records:AcademicAttendanceRecords,kind:Kind):Row[]=>kind.endsWith('_statistic')?records.statistics:kind.endsWith('_detail')?records.details:records.metadata;
const camel=(key:string)=>key.replace(/_([a-z])/g,(_,letter:string)=>letter.toUpperCase());
const selectClass='min-h-10 w-full min-w-0 rounded-md border border-input bg-background px-3 py-2 text-sm';

export function AcademicAttendanceManager({records,profiles,busy,onSave,onRefresh}:{
  records:AcademicAttendanceRecords;profiles:Array<{user_id:string;display_name:string;email:string}>;busy:boolean;
  onSave:(action:AcademicAttendanceSaveAction)=>Promise<boolean>;onRefresh?:()=>void|Promise<void>;
}){
  const [kind,setKind]=useState<Kind>('save_academic_attendance_statistic'),[draft,setDraft]=useState(blank),[editing,setEditing]=useState<Row|null>(null);
  const [id,setId]=useState<string>(()=>crypto.randomUUID()),[saving,setSaving]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
  const inFlight=useRef(false),receipt=useRef<{body:string;requestId:string}|null>(null),touched=useRef(new Set<string>());
  const rows=rowsFor(records,kind),owner=editing?.userId??draft.user_id,locked=busy||saving;
  const latest=editing?rows.find(row=>row.id===editing.id):null,stale=Boolean(editing&&(!latest||latest.version!==editing.version));
  const duplicate=!editing?rows.find(row=>row.userId===owner&&(kind.endsWith('_metadata')||kind.endsWith('_statistic')&&'academicYear'in row&&'courseCode'in row&&row.academicYear===Number(draft.academic_year)&&row.semester===Number(draft.semester)&&row.courseCode===draft.course_code)):undefined;
  const reloadTarget=duplicate??(stale?latest:undefined);
  const profileNames=new Map(profiles.map(row=>[row.user_id,row.display_name||row.email||row.user_id]));
  const visibleFields=kind.endsWith('_metadata')?fields[kind]:[...fields[kind],{key:'row_order',label:'Display order',type:'number' as const,max:999999,integer:true,required:true}];
  function reset(){setEditing(null);setDraft(blank());setId(crypto.randomUUID());receipt.current=null;touched.current.clear();setError('');setMessage('');}
  function edit(row:Row){
    const values:Record<string,string>={user_id:row.userId};
    for(const key of academicAttendanceFields[kind]){
      const value=(row as unknown as Record<string,unknown>)[camel(key)];
      values[key]=value==null?'':String(value);
    }
    setEditing(row);setId(row.id);setDraft(values);receipt.current=null;touched.current.clear();setError('');setMessage('');
  }
  function change(key:string,value:string){touched.current.add(key);setDraft(current=>({...current,[key]:value}));receipt.current=null;setError('');setMessage('');}
  async function save(event:FormEvent){
    event.preventDefault();if(locked||inFlight.current||stale||duplicate)return;
    const payload:Record<string,unknown>={id,user_id:owner,expected_version:editing?.version??0};
    for(const field of visibleFields){
      const value=draft[field.key]??'';
      if(field.type==='number')payload[field.key]=value===''?null:Number(value);
      else {
        const original=editing?(editing as unknown as Record<string,unknown>)[camel(field.key)]:undefined;
        payload[field.key]=value===''?(original===''&&!touched.current.has(field.key)?'':null):value;
      }
    }
    const body=JSON.stringify({kind,payload});
    if(receipt.current?.body!==body)receipt.current={body,requestId:crypto.randomUUID()};
    payload.request_id=receipt.current.requestId;
    const invalid=validateAcademicAttendancePayload(kind,payload);if(invalid){setError(invalid);return;}
    inFlight.current=true;setSaving(true);setError('');setMessage('');
    try{if(await onSave({kind,payload})){reset();setMessage('Attendance record saved.');}else setError('The record was not saved. Retry, or refresh to check for a newer version.');}
    catch(caught){setError(caught instanceof Error?caught.message:'Attendance could not be saved. Retry without changing the fields.');}
    finally{inFlight.current=false;setSaving(false);}
  }
  async function refresh(){
    if(locked||!onRefresh)return;setSaving(true);
    try{await onRefresh();}catch{setError('Refresh failed. Your draft is unchanged.');}finally{setSaving(false);}
  }
  return <details className="mt-5 rounded-md border bg-background p-4">
    <summary className="cursor-pointer font-semibold">Academic attendance · 缺曠課紀錄管理</summary>
    <div className="mt-4 grid min-w-0 gap-4">
      <p className="text-sm text-muted-foreground">Maintain local attendance records. Enter the reported hours; detail rows and leave requests never recalculate them. Blank fields stay unrecorded, while zero is a recorded value.</p>
      <label>Record type<select className={selectClass} value={kind} disabled={locked||Boolean(editing)} onChange={event=>{reset();setKind(event.target.value as Kind);}}>{groups.map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
      <ul className="grid list-none gap-3 p-0">{rows.map(row=><li key={row.id} className="flex min-w-0 flex-wrap items-center justify-between gap-3 rounded-md border p-3"><span className="min-w-0 [overflow-wrap:anywhere]"><strong>{profileNames.get(row.userId)??row.userId}</strong><br/>{'courseCode'in row?`${row.academicYear}-${row.semester} · ${row.courseCode} · ${row.courseTitle}`:`Current term: ${row.currentAcademicYear??'not recorded'} / ${row.currentSemester??'not recorded'}`}</span><Button type="button" size="sm" variant="outline" disabled={locked} onClick={()=>edit(row)}>Edit attendance record</Button></li>)}</ul>
      {profiles.length===0&&!editing?<p>No account profiles are available.</p>:<form className="grid min-w-0 gap-4" onSubmit={event=>void save(event)}>
        <label>Student account<select required className={selectClass} value={owner} disabled={locked||Boolean(editing)} onChange={event=>change('user_id',event.target.value)}><option value="">Choose an account</option>{profiles.map(profile=><option key={profile.user_id} value={profile.user_id}>{profile.display_name} · {profile.email}</option>)}</select></label>
        {kind.endsWith('_metadata')&&<p className="text-sm text-muted-foreground">Set both term fields, or leave both blank. The student view only shows the explicitly selected term.</p>}
        <div className="grid min-w-0 gap-4 md:grid-cols-2">{visibleFields.map(field=><label key={field.key} className="grid min-w-0 gap-1">{field.label}<Input type={field.type??'text'} value={draft[field.key]??''} disabled={locked} required={field.required} maxLength={field.maxLength} min={field.type==='number'?(field.key.includes('year')||field.key.includes('semester')?1:0):undefined} max={field.max} step={field.type==='number'?(field.integer?1:.01):undefined} onChange={event=>change(field.key,event.target.value)}/></label>)}</div>
        {(duplicate||stale)&&<div role="alert" className="rounded-md border p-3"><p>{duplicate?'A matching record already exists. Open it before changing it.':'This record changed or was removed. Refresh before saving.'}</p>{reloadTarget&&<Button type="button" variant="outline" onClick={()=>{if(window.confirm('Replace the current draft with the saved record?'))edit(reloadTarget);}}>Load saved record</Button>}</div>}
        {error&&<p role="alert">{error}</p>}{message&&<p role="status">{message}</p>}
        <div className="flex flex-wrap gap-2"><Button type="submit" disabled={locked||stale||Boolean(duplicate)}>Save attendance record</Button><Button type="button" variant="outline" disabled={locked} onClick={reset}>Clear form</Button>{onRefresh&&<Button type="button" variant="outline" disabled={locked} onClick={()=>void refresh()}>Refresh records</Button>}</div>
      </form>}
    </div>
  </details>;
}
