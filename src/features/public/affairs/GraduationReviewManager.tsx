import {useRef,useState,type FormEvent,type ReactNode} from 'react';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Textarea} from '@/components/ui/textarea';
import type {GraduationActualCourse,GraduationLanguageRequirement,GraduationRequirement,GraduationRequirementCategory,GraduationReviewContent,GraduationReviewIdentity,GraduationReviewRecords,GraduationReviewReport,GraduationStatusIndicator,GraduationStatusValue} from '@/services/graduationReview';
import {validateGraduationReviewContent,graduationReviewPayloadBytes,graduationReviewMaxPayloadBytes} from '../../../../server/graduationReview.js';

export type GraduationReviewManagerProfile={user_id:string;display_name:string;email:string};
export type GraduationReviewSaveAction={kind:'save_graduation_review';payload:Record<string,unknown>};
type CreditDraft<T>={ [K in keyof T]: [T[K]] extends [number|null]?string:T[K] extends (infer R)[]?CreditDraft<R>[]:T[K] extends object?CreditDraft<T[K]>:T[K] };
type ReportDraft=CreditDraft<GraduationReviewContent>;
type CourseDraft=CreditDraft<GraduationActualCourse>;
type RequirementDraft=CreditDraft<GraduationRequirement>;
type CategoryDraft=CreditDraft<GraduationRequirementCategory>;
type LanguageDraft=CreditDraft<GraduationLanguageRequirement>;
const selectClass='min-h-10 w-full min-w-0 rounded-md border border-input bg-background px-3 py-2 text-sm';
const creditKeys=new Set(['credits','requiredCredits','matchedCredits','missingCredits','completedCredits','excludedCredits','detailSubtotalCredits']);
const identityFields:[keyof GraduationReviewIdentity,string,number][]=[['studentNumber','Student number · 學號',160],['studentName','Student name · 姓名',160],['departmentName','Department · 系科所',160],['yearText','Year label · 年級',30],['enrollmentStatusText','Enrollment status · 學籍狀態',160],['curriculumCohortText','Curriculum cohort · 課程適用學年',160],['doubleMajorText','Double major · 雙主修',160],['minorText','Minor · 輔系',160]];
const accountLabel=(profile:GraduationReviewManagerProfile)=>profile.display_name?`${profile.display_name} (${profile.email||profile.user_id})`:profile.email||profile.user_id;
const status=():GraduationStatusValue=>({text:null,indicator:null});
const emptyReport=():ReportDraft=>({reportedAt:null,identity:{studentNumber:null,studentName:null,departmentName:null,yearText:null,enrollmentStatusText:null,curriculumCohortText:null,doubleMajorText:null,minorText:null},educationProgram:status(),foreignLanguageCompletion:status(),englishRequirement:status(),graduationReview:{...status(),note:null},languageRequirements:[],categories:[],otherCourses:[]});
const emptyCourse=():CourseDraft=>({id:crypto.randomUUID(),sequenceText:null,title:'',credits:'',requiredElectiveText:null,yearText:null,transferText:null});
const emptyRequirement=():RequirementDraft=>({...emptyCourse(),moduleText:null,indicator:null,matchedCourses:[]});
const emptyCategory=():CategoryDraft=>({id:crypto.randomUUID(),label:'',requiredElectiveText:null,requiredCredits:'',completedCredits:'',matchedCredits:'',excludedCredits:'',status:status(),requirements:[],detailSubtotalCredits:''});
const emptyLanguage=():LanguageDraft=>({id:crypto.randomUUID(),label:'',status:status(),requiredCredits:'',matchedCredits:'',missingCredits:''});
function dateInput(value:string|null):string {
  if(!value)return '';const date=new Date(value),year=date.getUTCFullYear();
  return Number.isNaN(date.getTime())||year<1||year>9999?'':date.toISOString().slice(0,23);
}
function mapReport(value:unknown,toInput:boolean,key=''):unknown {
  if(creditKeys.has(key)){
    if(toInput)return value==null?'':String(value);
    const input=String(value??'').trim();if(!input)return null;
    if(!/^(?:\d+(?:\.\d{0,2})?|\.\d{1,2})$/.test(input)||!Number.isFinite(Number(input))||Number(input)>1000)throw new Error('Credit fields must be blank or from 0 to 1000 with at most two decimal places.');
    return Number(input);
  }
  if(Array.isArray(value))return value.map(item=>mapReport(item,toInput));
  if(value!==null&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([field,item])=>[field,mapReport(item,toInput,field)]));
  // Report text is literal: editing one field must not trim other fields or
  // silently replace an explicitly stored empty string with null.
  return value;
}
function draftOf(report:GraduationReviewReport):ReportDraft {
  const {reportedAt,identity,educationProgram,foreignLanguageCompletion,englishRequirement,graduationReview,languageRequirements,categories,otherCourses}=report;
  return mapReport({reportedAt,identity,educationProgram,foreignLanguageCompletion,englishRequirement,graduationReview,languageRequirements,categories,otherCourses},true) as ReportDraft;
}
function TextField({label,value,onChange,max=160,required=false,multiline=false}:{label:string;value:string|null;onChange:(value:string)=>void;max?:number;required?:boolean;multiline?:boolean}){
  const props={'aria-label':label,value:value??'',maxLength:max,required,onChange:(event:{target:{value:string}})=>onChange(event.target.value)};
  return <label className="grid min-w-0 gap-1">{label}{multiline?<Textarea {...props}/>:<Input {...props}/>}</label>;
}
function CreditField({label,value,onChange}:{label:string;value:string;onChange:(value:string)=>void}){
  return <label className="grid min-w-0 gap-1">{label}<Input aria-label={label} type="number" min={0} max={1000} step="0.01" value={value} onChange={event=>onChange(event.target.value)}/></label>;
}
function IndicatorField({label,value,onChange}:{label:string;value:GraduationStatusIndicator;onChange:(value:GraduationStatusIndicator)=>void}){
  return <label className="grid min-w-0 gap-1">{label}<select className={selectClass} aria-label={label} value={value??''} onChange={event=>onChange(event.target.value===''?null:event.target.value as GraduationStatusIndicator)}><option value="">No indicator · 未記錄</option><option value="passed">Passed · 通過</option><option value="attention">Attention · 待確認</option></select></label>;
}
function StatusFields({label,value,onChange}:{label:string;value:GraduationStatusValue;onChange:(value:GraduationStatusValue)=>void}){
  return <><TextField label={`${label} text`} value={value.text} onChange={text=>onChange({...value,text})}/><IndicatorField label={`${label} indicator`} value={value.indicator} onChange={indicator=>onChange({...value,indicator})}/></>;
}
function Panel({label,children,initialOpen=false}:{label:string;children:ReactNode;initialOpen?:boolean}){
  const [open,setOpen]=useState(initialOpen);
  return <details className="min-w-0 rounded-md border p-3" open={open} onToggle={event=>setOpen(event.currentTarget.open)}><summary className="cursor-pointer [overflow-wrap:anywhere]">{label}</summary>{open&&<div className="mt-4 grid min-w-0 gap-4">{children}</div>}</details>;
}
function move<T>(rows:T[],index:number,offset:number):T[]{const target=index+offset;if(target<0||target>=rows.length)return rows;const next=[...rows];[next[index],next[target]]=[next[target],next[index]];return next;}
function RowActions({label,index,length,onMove,onRemove}:{label:string;index:number;length:number;onMove:(offset:number)=>void;onRemove:()=>void}){
  return <div className="flex flex-wrap gap-2"><Button type="button" variant="outline" size="sm" aria-label={`Move ${label} up`} disabled={index===0} onClick={()=>onMove(-1)}>Move up</Button><Button type="button" variant="outline" size="sm" aria-label={`Move ${label} down`} disabled={index===length-1} onClick={()=>onMove(1)}>Move down</Button><Button type="button" variant="outline" size="sm" aria-label={`Remove ${label}`} onClick={onRemove}>Remove row</Button></div>;
}
function CourseFields({label,value,onChange}:{label:string;value:CourseDraft;onChange:(value:CourseDraft)=>void}){
  return <div className="grid min-w-0 gap-4 md:grid-cols-2"><TextField label={`${label} title`} required value={value.title} onChange={title=>onChange({...value,title})}/><TextField label={`${label} sequence`} value={value.sequenceText} max={30} onChange={sequenceText=>onChange({...value,sequenceText})}/><CreditField label={`${label} credits`} value={value.credits} onChange={credits=>onChange({...value,credits})}/><TextField label={`${label} required/elective`} value={value.requiredElectiveText} max={30} onChange={requiredElectiveText=>onChange({...value,requiredElectiveText})}/><TextField label={`${label} year`} value={value.yearText} max={30} onChange={yearText=>onChange({...value,yearText})}/><TextField label={`${label} transfer`} value={value.transferText} max={80} onChange={transferText=>onChange({...value,transferText})}/></div>;
}
function Courses({label,rows,onChange,canAdd}:{label:string;rows:CourseDraft[];onChange:(rows:CourseDraft[])=>void;canAdd:boolean}){
  return <section className="grid min-w-0 gap-3" aria-label={label}><h5>{label}</h5>{rows.length===0&&<p>No course rows recorded.</p>}{rows.map((row,index)=>{
    const name=`${label} ${index+1}`;return <Panel key={row.id} label={`${name}: ${row.title||'New course'}`} initialOpen={!row.title}><RowActions label={name} index={index} length={rows.length} onMove={offset=>onChange(move(rows,index,offset))} onRemove={()=>onChange(rows.filter(item=>item.id!==row.id))}/><CourseFields label={name} value={row} onChange={updated=>onChange(rows.map(item=>item.id===row.id?updated:item))}/></Panel>;
  })}<div><Button type="button" variant="outline" aria-label={`Add ${label.toLowerCase()}`} disabled={!canAdd} onClick={()=>onChange([...rows,emptyCourse()])}>{label.includes('matched course')?'Add matched course':'Add other course'}</Button></div></section>;
}
function Requirements({label,rows,onChange,canAdd}:{label:string;rows:RequirementDraft[];onChange:(rows:RequirementDraft[])=>void;canAdd:boolean}){
  return <section className="grid min-w-0 gap-3" aria-label={label}><h5>{label}</h5>{rows.length===0&&<p>No requirements recorded.</p>}{rows.map((row,index)=>{
    const name=`${label} ${index+1}`,change=(updated:RequirementDraft)=>onChange(rows.map(item=>item.id===row.id?updated:item));
    return <Panel key={row.id} label={`${name}: ${row.title||'New requirement'}`} initialOpen={!row.title}><RowActions label={name} index={index} length={rows.length} onMove={offset=>onChange(move(rows,index,offset))} onRemove={()=>onChange(rows.filter(item=>item.id!==row.id))}/><CourseFields label={name} value={row} onChange={updated=>change({...row,...updated})}/><div className="grid min-w-0 gap-4 md:grid-cols-2"><TextField label={`${name} module`} value={row.moduleText} onChange={moduleText=>change({...row,moduleText})}/><IndicatorField label={`${name} indicator`} value={row.indicator} onChange={indicator=>change({...row,indicator})}/></div><Courses label={`${name} matched course`} rows={row.matchedCourses} canAdd={canAdd} onChange={matchedCourses=>change({...row,matchedCourses})}/></Panel>;
  })}<div><Button type="button" variant="outline" aria-label={`Add ${label.toLowerCase()}`} disabled={!canAdd} onClick={()=>onChange([...rows,emptyRequirement()])}>Add requirement</Button></div></section>;
}

export function GraduationReviewManager({records,profiles,busy,onSave,onRefresh}:{
  records:GraduationReviewRecords;profiles:GraduationReviewManagerProfile[];busy:boolean;
  onSave:(action:GraduationReviewSaveAction)=>Promise<boolean>;onRefresh?:()=>void|Promise<void>;
}){
  const [editing,setEditing]=useState<GraduationReviewReport|null>(null),[id,setId]=useState(()=>crypto.randomUUID()),[userId,setUserId]=useState('');
  const [reportKind,setReportKind]=useState<'academic_services'|'legacy'>('academic_services');
  const [draft,setDraft]=useState<ReportDraft>(emptyReport),[error,setError]=useState(''),[message,setMessage]=useState(''),[saving,setSaving]=useState(false),[refreshing,setRefreshing]=useState(false),[editorKey,setEditorKey]=useState(0);
  const receipt=useRef<{body:string;requestId:string}|null>(null),inFlight=useRef(false),owner=editing?.userId??userId;
  const locked=busy||saving||refreshing,latest=records.reports.find(row=>row.id===(editing?.id??id));
  const selectedKind=editing?.reportKind??reportKind;
  const existing=records.reports.find(row=>row.userId===owner&&row.reportKind===selectedKind&&row.id!==(editing?.id??id)),stale=Boolean(editing?(!latest||latest.version!==editing.version):latest),reloadTarget=existing??(stale?latest:undefined);
  const courseCount=draft.otherCourses.length+draft.categories.reduce((total,category)=>total+category.requirements.reduce((count,requirement)=>count+1+requirement.matchedCourses.length,0),0);
  const profileMap=new Map(profiles.map(profile=>[profile.user_id,accountLabel(profile)]));
  function change<K extends keyof ReportDraft>(key:K,value:ReportDraft[K]){setDraft(prior=>({...prior,[key]:value}));setError('');setMessage('');}
  function changeDate(value:string){
    if(!value){change('reportedAt',null);return;}
    const date=new Date(value+'Z'),year=date.getUTCFullYear();
    if(Number.isNaN(date.getTime())||year<1||year>9999){setError('Choose a valid report date from year 0001 through 9999.');return;}
    change('reportedAt',date.toISOString());
  }
  function reset(){setEditing(null);setId(crypto.randomUUID());setUserId('');setReportKind('academic_services');setDraft(emptyReport());setError('');setMessage('');receipt.current=null;setEditorKey(key=>key+1);}
  function edit(report:GraduationReviewReport){setEditing(report);setUserId(report.userId);setReportKind(report.reportKind);setDraft(draftOf(report));setError('');setMessage('');receipt.current=null;setEditorKey(key=>key+1);}
  async function refresh(){if(locked||!onRefresh)return;setRefreshing(true);setError('');try{await onRefresh();setMessage('Saved reports refreshed. Your draft is retained; load the latest report explicitly to replace it.');}catch(reason){setError(reason instanceof Error?reason.message:'Graduation reports could not be refreshed.');}finally{setRefreshing(false);}}
  async function submit(event:FormEvent<HTMLFormElement>){
    event.preventDefault();if(locked||inFlight.current)return;setError('');setMessage('');
    if(stale||existing){setError('A saved report of this kind is available for this account. Refresh and load it explicitly before saving.');return;}
    if(!owner){setError('Choose an account.');return;}
    let report:GraduationReviewContent;try{report=mapReport(draft,false) as GraduationReviewContent;}catch(reason){setError(reason instanceof Error?reason.message:'Check the report fields.');return;}
    const validation=validateGraduationReviewContent(report);if(validation){setError(validation);return;}
    const payload={id:editing?.id??id,user_id:owner,report_kind:selectedKind,expected_version:String(editing?.version??0),report},body=JSON.stringify(payload);
    if(receipt.current?.body!==body)receipt.current={body,requestId:crypto.randomUUID()};
    const operation={...payload,request_id:receipt.current.requestId};
    if(graduationReviewPayloadBytes(operation)>graduationReviewMaxPayloadBytes){setError('This report exceeds the 128 KiB storage limit. Shorten its text or remove unneeded rows before saving.');return;}
    inFlight.current=true;setSaving(true);
    try{if(await onSave({kind:'save_graduation_review',payload:operation})){reset();setMessage('Local graduation review report saved.');}else setError('The report was not saved. Your draft is retained. Retry, or refresh and load the latest saved report if it changed.');}
    catch(reason){setError(reason instanceof Error?reason.message:'The report could not be saved. Your draft is retained.');}
    finally{inFlight.current=false;setSaving(false);}
  }
  return <section className="graduation-review-manager mt-8 min-w-0 space-y-4" aria-label="Graduation review report manager">
    <header><h3>Graduation review reports · 畢業學分檢核管理</h3><p>Maintain stu.best local reports. Enter statuses and credit values explicitly; no totals or pass decisions are calculated.</p></header>
    {error&&<p role="alert" className="text-destructive [overflow-wrap:anywhere]">{error}</p>}{message&&<p role="status">{message}</p>}
    {stale&&<p role="status">This report changed or was removed. Refresh before saving; your draft has not been replaced.</p>}{existing&&<p role="status">A report of this kind already exists for this account. Load it explicitly to edit.</p>}
    <div className="flex flex-wrap gap-2">{onRefresh&&<Button type="button" variant="outline" disabled={locked} onClick={()=>void refresh()}>{refreshing?'Refreshing graduation reports…':'Refresh graduation reports'}</Button>}{reloadTarget&&<Button type="button" variant="outline" disabled={locked} onClick={()=>edit(reloadTarget)}>Load latest graduation report</Button>}</div>
    <ul className="grid list-none gap-3 p-0">{records.reports.map(report=><li key={report.id} className="flex min-w-0 flex-wrap items-center justify-between gap-3 rounded-md border p-3"><span className="min-w-0 [overflow-wrap:anywhere]"><strong>{profileMap.get(report.userId)??report.userId}</strong><br/>{report.reportKind==='legacy'?'Legacy graduation check · 15-2':'Academic Services · 13-1'} · {report.categories.length} categories · {report.languageRequirements.length} language requirements · Version {report.version}</span><Button type="button" variant="outline" size="sm" disabled={locked} onClick={()=>edit(report)}>Edit graduation report</Button></li>)}</ul>
    {profiles.length===0&&!editing?<p>No account profiles are available.</p>:<form className="grid min-w-0 gap-4" onSubmit={event=>void submit(event)}>
      <h4>{editing?'Edit':'Add'} local graduation review report</h4><fieldset disabled={locked} className="m-0 grid min-w-0 gap-4 border-0 p-0">
        <label className="grid min-w-0 gap-1">Graduation report account<select className={selectClass} aria-label="Graduation report account" value={owner} required disabled={Boolean(editing)} onChange={event=>{setUserId(event.target.value);setError('');setMessage('');}}><option value="">Choose an account</option>{editing&&!profiles.some(profile=>profile.user_id===owner)&&<option value={owner}>{owner}</option>}{profiles.map(profile=><option key={profile.user_id} value={profile.user_id}>{accountLabel(profile)}</option>)}</select></label>
        <label className="grid min-w-0 gap-1">Graduation report kind<select className={selectClass} aria-label="Graduation report kind" value={selectedKind} disabled={Boolean(editing)} onChange={event=>{setReportKind(event.target.value as 'academic_services'|'legacy');setError('');setMessage('');}}><option value="academic_services">Academic Services · 13-1</option><option value="legacy">Legacy graduation check · 15-2</option></select></label>
        <label className="grid min-w-0 gap-1">Reported at (UTC) · 報表時間<Input aria-label="Reported at (UTC) · 報表時間" type="datetime-local" min="0001-01-01T00:00" max="9999-12-31T23:59:59.999" step="0.001" value={dateInput(draft.reportedAt)} onChange={event=>changeDate(event.target.value)}/></label>
        <p className="text-sm">Blank credits mean not recorded; enter 0 for a recorded zero. “No indicator” leaves status unrecorded. Dates use UTC; the student view displays Taiwan time.</p>
        <div key={editorKey} className="grid min-w-0 gap-4">
          <Panel label="Student identity · 學籍資料" initialOpen><div className="grid min-w-0 gap-4 md:grid-cols-2">{identityFields.map(([key,label,max])=><TextField key={key} label={label} value={draft.identity[key]} max={max} onChange={value=>change('identity',{...draft.identity,[key]:value})}/>)}</div></Panel>
          <Panel label="Report statuses · 檢核狀態" initialOpen><div className="grid min-w-0 gap-4 md:grid-cols-2">{([['educationProgram','Education program · 教育學程'],['foreignLanguageCompletion','Foreign-language courses · 外語課程'],['englishRequirement','English requirement · 英文門檻']] as const).map(([key,label])=><StatusFields key={key} label={label} value={draft[key]} onChange={value=>change(key,value)}/>)}<StatusFields label="Graduation review · 畢業審核" value={draft.graduationReview} onChange={value=>change('graduationReview',{...draft.graduationReview,...value})}/><TextField label="Graduation review note · 審核備註" value={draft.graduationReview.note} max={1000} multiline onChange={note=>change('graduationReview',{...draft.graduationReview,note})}/></div></Panel>
          <section className="grid min-w-0 gap-3" aria-label="Language requirements"><h4>Language requirements · 語言課程門檻</h4>{draft.languageRequirements.length===0&&<p>No language requirements recorded.</p>}{draft.languageRequirements.map((row,index)=>{
            const label=`Language ${index+1}`,update=(value:LanguageDraft)=>change('languageRequirements',draft.languageRequirements.map(item=>item.id===row.id?value:item));
            return <Panel key={row.id} label={`${label}: ${row.label||'New language requirement'}`} initialOpen={!row.label}><RowActions label={label} index={index} length={draft.languageRequirements.length} onMove={offset=>change('languageRequirements',move(draft.languageRequirements,index,offset))} onRemove={()=>change('languageRequirements',draft.languageRequirements.filter(item=>item.id!==row.id))}/><div className="grid min-w-0 gap-4 md:grid-cols-2"><TextField label={`${label} label`} required value={row.label} onChange={label=>update({...row,label})}/><StatusFields label={`${label} status`} value={row.status} onChange={status=>update({...row,status})}/>{(['requiredCredits','matchedCredits','missingCredits'] as const).map(key=><CreditField key={key} label={`${label} ${key.replace('Credits',' credits')}`} value={row[key]} onChange={value=>update({...row,[key]:value})}/>)}</div></Panel>;
          })}<div><Button type="button" variant="outline" disabled={draft.languageRequirements.length>=100} onClick={()=>change('languageRequirements',[...draft.languageRequirements,emptyLanguage()])}>Add language requirement</Button></div></section>
          <section className="grid min-w-0 gap-3" aria-label="Requirement categories"><h4>Requirement categories · 課程編程</h4>{draft.categories.length===0&&<p>No categories recorded.</p>}{draft.categories.map((row,index)=>{
            const label=`Category ${index+1}`,update=(value:CategoryDraft)=>change('categories',draft.categories.map(item=>item.id===row.id?value:item));
            return <Panel key={row.id} label={`${label}: ${row.label||'New category'}`} initialOpen={!row.label}><RowActions label={label} index={index} length={draft.categories.length} onMove={offset=>change('categories',move(draft.categories,index,offset))} onRemove={()=>change('categories',draft.categories.filter(item=>item.id!==row.id))}/><div className="grid min-w-0 gap-4 md:grid-cols-2"><TextField label={`${label} label`} required value={row.label} onChange={label=>update({...row,label})}/><TextField label={`${label} required/elective`} value={row.requiredElectiveText} max={30} onChange={requiredElectiveText=>update({...row,requiredElectiveText})}/><StatusFields label={`${label} status`} value={row.status} onChange={status=>update({...row,status})}/>{(['requiredCredits','completedCredits','matchedCredits','excludedCredits','detailSubtotalCredits'] as const).map(key=><CreditField key={key} label={`${label} ${key.replace('Credits',' credits').replace('detailSubtotal','detail subtotal')}`} value={row[key]} onChange={value=>update({...row,[key]:value})}/>)}</div><Requirements label={`${label} requirement`} rows={row.requirements} canAdd={courseCount<1000} onChange={requirements=>update({...row,requirements})}/></Panel>;
          })}<div><Button type="button" variant="outline" disabled={draft.categories.length>=100} onClick={()=>change('categories',[...draft.categories,emptyCategory()])}>Add requirement category</Button></div></section>
          <Courses label="Other course" rows={draft.otherCourses} canAdd={courseCount<1000} onChange={value=>change('otherCourses',value)}/>
        </div>
        <p className="text-sm">{courseCount} / 1000 course rows · {draft.categories.length} / 100 categories · {draft.languageRequirements.length} / 100 language requirements</p>
        <div className="flex flex-wrap gap-2"><Button type="submit" disabled={stale||Boolean(existing)}>{saving?'Saving graduation report…':'Save graduation report'}</Button><Button type="button" variant="outline" onClick={()=>{setDraft(emptyReport());setError('');setMessage('Report values cleared in this draft. Save to persist the cleared report.');receipt.current=null;setEditorKey(key=>key+1);}}>Clear report values</Button><Button type="button" variant="outline" onClick={reset}>{editing?'Cancel graduation report edit':'Clear graduation report form'}</Button></div>
      </fieldset>
    </form>}
  </section>;
}
