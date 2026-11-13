import {useRef,useState,type FormEvent} from 'react';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Textarea} from '@/components/ui/textarea';
import {academicGradeKindOptions,academicGradeSemesterOptions,type AcademicGradeRecord,type AcademicGradeTermSummary,
  type AcademicGradeRanking,type AcademicGradeMetadata,type AcademicGradesRecords} from '@/services/academicGrades';

export type AcademicGradesManagerProfile={user_id:string;display_name:string;email:string};
export type AcademicGradesSaveAction={
  kind:'save_academic_grade_record'|'save_academic_term_summary'|'save_academic_ranking'|'save_academic_metadata';
  payload:Record<string,unknown>;
};
type Group='grade'|'summary'|'ranking'|'metadata';
type SavedRecord=AcademicGradeRecord|AcademicGradeTermSummary|AcademicGradeRanking|AcademicGradeMetadata;
type Draft=Record<string,string>;
type Field={key:string;label:string;required?:boolean;maxLength?:number;numericMax?:number;integer?:boolean;multiline?:boolean};
const groups:[Group,string][]=[['grade','Course grades · 科目成績'],['summary','Term summaries · 學期統計'],['ranking','Rankings · 學期排名'],['metadata','Account labels · 班級與英文門檻']];
const actions:Record<Group,AcademicGradesSaveAction['kind']>={grade:'save_academic_grade_record',summary:'save_academic_term_summary',ranking:'save_academic_ranking',metadata:'save_academic_metadata'};
const saveLabels:Record<Group,string>={grade:'Save academic grade',summary:'Save academic term summary',ranking:'Save academic ranking',metadata:'Save academic metadata'};
const editLabels:Record<Group,string>={grade:'Edit academic grade',summary:'Edit academic term summary',ranking:'Edit academic ranking',metadata:'Edit academic metadata'};
const selectClass='min-h-10 w-full min-w-0 rounded-md border border-input bg-background px-3 py-2 text-sm';
const accountLabel=(profile:AcademicGradesManagerProfile)=>profile.display_name?`${profile.display_name} (${profile.email||profile.user_id})`:profile.email||profile.user_id;
const text=(value:string|number|null|undefined)=>value==null?'':String(value);
const display=(value:string|number|null)=>value??'Not recorded';
const kindOf=(record:SavedRecord|null)=>record&&'recordKind' in record?record.recordKind:record&&'summaryKind' in record?record.summaryKind:'';
const blank=():Draft=>({user_id:'',academic_year:'',semester:'',kind:'',row_order:'0'});
const rowsFor=(records:AcademicGradesRecords,group:Group):SavedRecord[]=>group==='grade'?records.records:group==='summary'?records.termSummaries:group==='ranking'?records.rankings:records.metadata;
const jsonText=(value:unknown):string=>Array.isArray(value)?'['+value.map(jsonText).join(', ')+']':value!==null&&typeof value==='object'
  ?'{'+Object.entries(value).map(([key,item])=>JSON.stringify(key)+': '+jsonText(item)).join(', ')+'}':JSON.stringify(value);

function fieldsFor(group:Group,kind:string):Field[]{
  if(group==='grade')return [
    ...(kind==='warning'?[{key:'course_code',label:'Course code · 課程代碼',required:true,maxLength:80}]:[]),
    {key:'course_title',label:'Course title · 科目名稱',required:true,maxLength:160},
    ...(kind==='transcript'?[
      {key:'category_text',label:'Category · 類別',maxLength:160},
      {key:'module_name',label:'Module name · 模組名稱',maxLength:160},
      {key:'required_elective_text',label:'Required/elective label · 必選修',maxLength:30},
    ]:[]),
    {key:'credits',label:'Credits · 學分數',numericMax:999.99},
    {key:'grade_text',label:'Grade text · 成績',maxLength:80},
    ...(kind==='warning'?[{key:'remark_text',label:'Remark · 備註',maxLength:300,multiline:true}]:[]),
    {key:'row_order',label:'Display order · 顯示順序',numericMax:999999,integer:true,required:true},
  ];
  if(group==='summary')return kind==='transcript'?[
    {key:'earned_credits',label:'Earned credits · 實得學分',numericMax:9999.99},
    {key:'average_grade_text',label:'Average grade text · 學期平均',maxLength:80},
  ]:kind==='warning'?[
    {key:'attempted_credits',label:'Attempted credits · 總修習學分數',numericMax:9999.99},
    {key:'passed_credits',label:'Passed credits · 及格學分數',numericMax:9999.99},
    {key:'failed_credits',label:'Failed credits · 不及格學分數',numericMax:9999.99},
  ]:[];
  if(group==='ranking')return [
    {key:'department_ranking_text',label:'Department ranking text · 系排名',maxLength:160},
    {key:'class_ranking_text',label:'Class ranking text · 班排名',maxLength:160},
  ];
  return [
    {key:'class_label',label:'Class label · 班級',maxLength:80},
    {key:'english_requirement_text',label:'English requirement text · 英文畢業門檻',maxLength:300,multiline:true},
  ];
}
function draftOf(record:SavedRecord):Draft{
  const common={...blank(),user_id:record.userId,kind:kindOf(record),...('academicYear' in record?{academic_year:String(record.academicYear),semester:String(record.semester)}:{})};
  if('recordKind' in record)return {...common,course_code:text(record.courseCode),course_title:record.courseTitle,category_text:text(record.categoryText),module_name:text(record.moduleName),
    required_elective_text:text(record.requiredElectiveText),credits:text(record.credits),grade_text:text(record.gradeText),remark_text:text(record.remarkText),row_order:String(record.rowOrder)};
  if('summaryKind' in record)return {...common,earned_credits:text(record.earnedCredits),average_grade_text:text(record.averageGradeText),attempted_credits:text(record.attemptedCredits),passed_credits:text(record.passedCredits),failed_credits:text(record.failedCredits)};
  if('departmentRankingText' in record)return {...common,department_ranking_text:text(record.departmentRankingText),class_ranking_text:text(record.classRankingText)};
  return {...common,class_label:text(record.classLabel),english_requirement_text:text(record.englishRequirementText)};
}
function description(record:SavedRecord):string{
  const term='academicYear' in record?`${record.academicYear}-${record.semester}`:'';
  const kind=academicGradeKindOptions.find(option=>option.value===kindOf(record))?.label??'';
  if('recordKind' in record)return `${term} · ${kind} · ${record.courseTitle} · Credits: ${display(record.credits)} · Grade: ${display(record.gradeText)}`;
  if('summaryKind' in record)return record.summaryKind==='transcript'
    ?`${term} · ${kind} · Earned: ${display(record.earnedCredits)} · Average: ${display(record.averageGradeText)}`
    :`${term} · ${kind} · Attempted: ${display(record.attemptedCredits)} · Passed: ${display(record.passedCredits)} · Failed: ${display(record.failedCredits)}`;
  if('departmentRankingText' in record)return `${term} · Department: ${display(record.departmentRankingText)} · Class: ${display(record.classRankingText)}`;
  return `Class: ${display(record.classLabel)} · English requirement: ${display(record.englishRequirementText)}`;
}

export function AcademicGradesManager({records,profiles,busy,onSave,onRefresh}:{
  records:AcademicGradesRecords;profiles:AcademicGradesManagerProfile[];busy:boolean;
  onSave:(action:AcademicGradesSaveAction)=>Promise<boolean>;onRefresh?:()=>void|Promise<void>;
}){
  const [group,setGroup]=useState<Group>('grade'),[editing,setEditing]=useState<SavedRecord|null>(null),[id,setId]=useState(()=>crypto.randomUUID());
  const [draft,setDraft]=useState<Draft>(blank),[saving,setSaving]=useState(false),[refreshing,setRefreshing]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
  const receipt=useRef<{body:string;requestId:string}|null>(null),inFlight=useRef(false);
  const rows=rowsFor(records,group),owner=editing?.userId??draft.user_id,kind=kindOf(editing)||draft.kind;
  const hasKind=group==='grade'||group==='summary',hasTerm=group!=='metadata',locked=busy||saving||refreshing;
  const latest=rows.find(row=>row.id===(editing?.id??id));
  // Summary, ranking and metadata uniqueness is an explicit storage contract. Never
  // convert a create into an update or replace a dirty draft without the user's action.
  const existing=group==='grade'?undefined:rows.find(row=>row.id!==(editing?.id??id)&&row.userId===owner&&
    (group==='metadata'||'academicYear' in row&&row.academicYear===Number(draft.academic_year)&&row.semester===Number(draft.semester)&&
      (group!=='summary'||kindOf(row)===kind)));
  const stale=Boolean(latest&&latest.version!==(editing?.version??0)),blocked=stale||Boolean(existing);
  const reloadTarget=existing??(stale?latest:undefined),fields=fieldsFor(group,kind);
  const profileMap=new Map(profiles.map(profile=>[profile.user_id,accountLabel(profile)]));
  function change(key:string,value:string){setDraft(prior=>({...prior,[key]:value}));setError('');setMessage('');}
  function reset(){setEditing(null);setId(crypto.randomUUID());setDraft(blank());receipt.current=null;setError('');setMessage('');}
  function edit(record:SavedRecord){setEditing(record);setDraft(draftOf(record));receipt.current=null;setError('');setMessage('');}
  async function refresh(){
    if(locked||!onRefresh)return;setRefreshing(true);setError('');
    try{await onRefresh();setMessage('Refreshing saved records. Your draft is retained; explicitly load a saved record to replace it.');}
    catch(reason){setError(reason instanceof Error?reason.message:'Academic records could not be refreshed.');}
    finally{setRefreshing(false);}
  }
  async function submit(event:FormEvent<HTMLFormElement>){
    event.preventDefault();if(locked||inFlight.current)return;setError('');setMessage('');
    if(stale){setError('This record has a newer saved version. Load the latest saved academic record before saving.');return;}
    if(existing){setError(hasTerm?'A record already exists for this account, term and kind. Load it to edit, or choose a different term.':'An account-label record already exists. Load the saved academic record to edit it.');return;}
    if(!owner){setError('Choose an account.');return;}
    if(hasKind&&!academicGradeKindOptions.some(option=>option.value===kind)){setError('Choose transcript or warning records.');return;}
    if(hasTerm&&(!/^\d{1,4}$/.test(draft.academic_year)||Number(draft.academic_year)<1||!academicGradeSemesterOptions.some(option=>String(option.value)===draft.semester))){
      setError('Enter academic year 1–9999 and choose semester 1, 2 or summer.');return;
    }
    const payload:Record<string,unknown>={id:editing?.id??id,user_id:owner,expected_version:String(editing?.version??0)};
    if(hasTerm){payload.academic_year=Number(draft.academic_year);payload.semester=Number(draft.semester);}
    if(hasKind)payload[group==='grade'?'record_kind':'summary_kind']=kind;
    for(const field of fields){
      const value=(draft[field.key]??'').trim();
      if(field.required&&!value){setError(`${field.label} is required.`);return;}
      if(field.numericMax!==undefined){
        if(!value){payload[field.key]=null;continue;}
        const format=field.integer?/^\d+$/:/^(?:\d+(?:\.\d{0,2})?|\.\d{1,2})$/;
        if(!format.test(value)||Number(value)>field.numericMax){setError(`${field.label} must be ${field.required?'':'blank or '}from 0 to ${field.numericMax}${field.integer?' as a whole number':' with at most two decimal places'}.`);return;}
        payload[field.key]=Number(value);
      }else{
        if(Array.from(value).length>(field.maxLength??0)){setError(`${field.label} must contain at most ${field.maxLength} characters.`);return;}
        payload[field.key]=value||null;
      }
    }
    const actionKind=actions[group],body=JSON.stringify({kind:actionKind,payload});
    if(receipt.current?.body!==body)receipt.current={body,requestId:crypto.randomUUID()};
    const operation={...payload,request_id:receipt.current.requestId};
    if(new TextEncoder().encode(jsonText(operation)).length>8000){setError('This record exceeds the storage size limit. Shorten its text before saving.');return;}
    inFlight.current=true;setSaving(true);
    try{
      if(await onSave({kind:actionKind,payload:operation})){reset();setMessage('Local academic record saved.');}
      else setError('The record was not saved. Your draft is retained. Retry, or refresh and load the latest saved record if it changed.');
    }catch(reason){setError(reason instanceof Error?reason.message:'The academic record could not be saved. Your draft is retained.');}
    finally{inFlight.current=false;setSaving(false);}
  }
  return <section className="academic-grades-manager mt-8 min-w-0 space-y-4" aria-label="Academic grade record manager">
    <header><h3>Academic grade records · 學業成績管理</h3><p>Maintain stu.best local records. Enter term totals, averages, rankings and account labels explicitly.</p></header>
    {error&&<p role="alert" className="text-destructive">{error}</p>}{message&&<p role="status">{message}</p>}
    {stale&&<p role="status">A newer saved version is available. Your draft has not been replaced.</p>}
    {existing&&<p role="status">A record already exists for this account{hasTerm?' and term':''}{group==='summary'?' and record kind':''}. Load it explicitly to edit.</p>}
    <div className="flex flex-wrap gap-2">
      {onRefresh&&<Button type="button" variant="outline" disabled={locked} onClick={()=>void refresh()}>{refreshing?'Refreshing academic records…':'Refresh academic records'}</Button>}
      {reloadTarget&&<Button type="button" variant="outline" disabled={locked} onClick={()=>edit(reloadTarget)}>Load latest saved academic record</Button>}
    </div>
    <label className="grid gap-1">Academic record group<select className={selectClass} aria-label="Academic record group" value={group} disabled={locked||Boolean(editing)} onChange={event=>{if(editing)return;reset();setGroup(event.target.value as Group);}}>
      {groups.map(([value,label])=><option key={value} value={value}>{label}</option>)}
    </select></label>
    <ul className="grid list-none gap-3 p-0">{rows.map(record=><li key={record.id} className="flex min-w-0 flex-wrap items-center justify-between gap-3 rounded-md border p-3">
      <span className="min-w-0 [overflow-wrap:anywhere]"><strong>{profileMap.get(record.userId)??record.userId}</strong><br/>{description(record)}</span>
      <Button type="button" variant="outline" size="sm" disabled={locked} onClick={()=>edit(record)}>{editLabels[group]}</Button>
    </li>)}</ul>
    {profiles.length===0&&!editing?<p>No account profiles are available.</p>:<form className="grid min-w-0 gap-4" onSubmit={event=>void submit(event)}>
      <h4>{editing?'Edit':'Add'} local {groups.find(([value])=>value===group)?.[1].split(' · ')[0].toLowerCase()}</h4>
      <fieldset disabled={locked} className="m-0 grid min-w-0 gap-4 border-0 p-0">
        <label className="grid gap-1">Academic record account<select className={selectClass} aria-label="Academic record account" value={owner} required disabled={Boolean(editing)} onChange={event=>change('user_id',event.target.value)}>
          <option value="">Choose an account</option>{editing&&!profiles.some(profile=>profile.user_id===owner)&&<option value={owner}>{owner}</option>}
          {profiles.map(profile=><option key={profile.user_id} value={profile.user_id}>{accountLabel(profile)}</option>)}
        </select></label>
        <div className="grid min-w-0 gap-4 md:grid-cols-2">
          {hasKind&&<label className="grid gap-1">Academic record kind<select className={selectClass} aria-label="Academic record kind" value={kind} required disabled={Boolean(editing)} onChange={event=>change('kind',event.target.value)}>
            <option value="">Choose a kind</option>{academicGradeKindOptions.map(option=><option key={option.value} value={option.value}>{option.label}</option>)}
          </select></label>}
          {hasTerm&&<>
            <label className="grid gap-1">Academic year · 學年<Input aria-label="Academic year · 學年" type="number" required min={1} max={9999} step={1} value={draft.academic_year} onChange={event=>change('academic_year',event.target.value)}/></label>
            <label className="grid gap-1">Semester · 學期<select className={selectClass} aria-label="Semester · 學期" required value={draft.semester} onChange={event=>change('semester',event.target.value)}><option value="">Choose a semester</option>{academicGradeSemesterOptions.map(option=><option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
          </>}
          {fields.map(field=><label className="grid gap-1" key={field.key}>{field.label}{field.multiline
            ?<Textarea aria-label={field.label} required={field.required} maxLength={field.maxLength} value={draft[field.key]??''} onChange={event=>change(field.key,event.target.value)}/>
            :<Input aria-label={field.label} type={field.numericMax===undefined?'text':'number'} required={field.required} maxLength={field.maxLength}
              min={field.numericMax===undefined?undefined:0} max={field.numericMax} step={field.numericMax===undefined?undefined:field.integer?1:'0.01'} value={draft[field.key]??''} onChange={event=>change(field.key,event.target.value)}/>}</label>)}
        </div>
        {(group==='grade'||group==='summary')&&<p className="text-sm">Blank numeric fields are not recorded; enter 0 only for a recorded zero. Grade and average text is saved as entered.</p>}
        {group==='ranking'&&<p className="text-sm">Enter each ranking as its complete displayed text. Leave a field blank to clear it.</p>}
        {group==='metadata'&&<p className="text-sm">Leave a label blank to clear it.</p>}
        {group==='summary'&&<p className="text-sm">Each summary value is entered independently. No totals or averages are calculated from course rows.</p>}
        <div className="flex flex-wrap gap-2"><Button type="submit" disabled={blocked}>{saving?'Saving academic record…':saveLabels[group]}</Button>
          <Button type="button" variant="outline" onClick={reset}>{editing?'Cancel academic record edit':'Clear academic record form'}</Button></div>
      </fieldset>
    </form>}
  </section>;
}
