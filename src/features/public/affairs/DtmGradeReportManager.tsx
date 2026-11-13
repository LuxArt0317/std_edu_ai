import {useEffect,useRef,useState,type FormEvent} from 'react';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Textarea} from '@/components/ui/textarea';
import {dtmGradeReportMaxItems,validateDtmGradeReportPayload} from '../../../../server/dtmGradeReport.js';
import {dtmGradeReportClient,DtmGradeReportClientError,dtmGradeReportTextFields,emptyDtmGradeCells,parseDtmGradeReport,parseDtmGradeCourses,parseDtmGradeReportReceipt,type DtmGradeCells,type DtmGradeReportItem,type DtmGradeReportContent,type DtmGradeReportRecord,type DtmGradeReportData,type DtmGradeReportAction,type DtmGradeReportClient,type DtmGradeReportCourse} from '@/services/dtmGradeReport';

type DraftCells=Omit<DtmGradeCells,'score'|'maximum'>&{score:string|null;maximum:string|null};
type DraftItem=DraftCells&Pick<DtmGradeReportItem,'id'|'label'|'activityKind'>;
type Draft={items:DraftItem[];total:DraftCells|null};
type Operation={fingerprint:string;action:DtmGradeReportAction;confirmed:boolean;conflict:boolean};
type ManagerClient=Pick<DtmGradeReportClient,'loadCoursesAdmin'|'loadAdmin'|'manage'>;
export type DtmGradeReportManagerProps={managerId:string;userId:string;client?:ManagerClient;onSaved?:()=>void};
const blank=():Draft=>({items:[],total:null});
const draftCells=(cells:DtmGradeCells):DraftCells=>({...cells,score:cells.score===null?null:String(cells.score),maximum:cells.maximum===null?null:String(cells.maximum)});
const fromReport=(report:DtmGradeReportContent):Draft=>({items:report.items.map(row=>({...draftCells(row),id:row.id,label:row.label,activityKind:row.activityKind})),total:report.total===null?null:draftCells(report.total)});
const numeric=(value:string|null)=>value===null?null:/^(?:0|[1-9]\d{0,6})(?:\.\d{1,2})?$/.test(value)?Number(value):NaN;
const cellsPayload=(cells:DraftCells):DtmGradeCells=>({...cells,score:numeric(cells.score),maximum:numeric(cells.maximum)});
const content=(draft:Draft):DtmGradeReportContent=>({items:draft.items.map(row=>({...cellsPayload(row),id:row.id,label:row.label,activityKind:row.activityKind})),total:draft.total===null?null:cellsPayload(draft.total)});
const failure=(reason:unknown)=>reason instanceof DtmGradeReportClientError?reason.message:'成績原文報告暫時無法確認，請保留草稿並重試。';

function CellEditor({value,prefix,onChange}:{value:DraftCells;prefix:string;onChange:(patch:Partial<DraftCells>)=>void}){
  return <div className="grid min-w-0 gap-3 sm:grid-cols-2">
    {dtmGradeReportTextFields.map(({key,label})=>{const name=prefix+' '+label,Control=key==='feedbackText'?Textarea:Input;return <div className="min-w-0" key={key}>
      <label>{label}<Control aria-label={name} value={value[key]??''} disabled={value[key]===null} maxLength={key==='feedbackText'?4000:160} onChange={event=>onChange({[key]:event.target.value})}/></label>
      <label><input type="checkbox" aria-label={name+'未提供'} checked={value[key]===null} onChange={event=>onChange({[key]:event.target.checked?null:''})}/>未提供</label>
    </div>;})}
    {(['score','maximum'] as const).map(key=>{const label=key==='score'?'分數數值（獨立欄位）':'滿分數值（獨立欄位）',name=prefix+' '+label;return <div className="min-w-0" key={key}>
      <label>{label}<Input aria-label={name} type="number" min={key==='maximum'?'0.01':'0'} max="1000000" step="0.01" value={value[key]??''} disabled={value[key]===null} onChange={event=>onChange({[key]:event.target.value})}/></label>
      <label><input type="checkbox" aria-label={name+'未提供'} checked={value[key]===null} onChange={event=>onChange({[key]:event.target.checked?null:''})}/>未提供</label>
    </div>;})}
  </div>;
}

export function DtmGradeReportManager(props:DtmGradeReportManagerProps){return <OwnerGradeManager key={`${props.managerId}:${props.userId}`} {...props}/>;}
function OwnerGradeManager({managerId,userId,client=dtmGradeReportClient,onSaved}:DtmGradeReportManagerProps){
  const [courses,setCourses]=useState<{rows:DtmGradeReportCourse[];nextCursor:string|null}|null>(null),[loadedClient,setLoadedClient]=useState<ManagerClient|null>(null),[error,setError]=useState(''),[version,setVersion]=useState(0),[listBusy,setListBusy]=useState(true);
  const [courseId,setCourseId]=useState(''),[locked,setLocked]=useState(false);
  const task=useRef<AbortController|null>(null),inFlight=useRef(false);
  useEffect(()=>{
    const controller=new AbortController();task.current=controller;inFlight.current=true;
    void Promise.resolve().then(()=>{controller.signal.throwIfAborted();setListBusy(true);setError('');return client.loadCoursesAdmin(managerId,userId,{},controller.signal);}).then(value=>{
      const next=parseDtmGradeCourses(value,userId);if(!controller.signal.aborted){setCourses({rows:next.courses,nextCursor:next.nextCursor});setLoadedClient(client);}
    }).catch(reason=>{if(!controller.signal.aborted){setCourses(null);setLoadedClient(client);setError(failure(reason));}}).finally(()=>{if(!controller.signal.aborted){inFlight.current=false;setListBusy(false);}});
    return()=>controller.abort();
  },[managerId,userId,client,version]);
  async function more(){
    const controller=task.current,afterId=courses?.nextCursor;
    if(!controller||controller.signal.aborted||inFlight.current||loadedClient!==client||!afterId)return;
    inFlight.current=true;setListBusy(true);setError('');
    try{const next=parseDtmGradeCourses(await client.loadCoursesAdmin(managerId,userId,{afterId},controller.signal),userId,afterId);controller.signal.throwIfAborted();
      setCourses(current=>current?{rows:[...current.rows,...next.courses],nextCursor:next.nextCursor}:current);
    }catch(reason){if(!controller.signal.aborted){if(reason instanceof DtmGradeReportClientError&&[401,403].includes(reason.status))setCourses(null);setError(failure(reason));}}finally{if(!controller.signal.aborted){inFlight.current=false;setListBusy(false);}}
  }
  const ready=loadedClient===client&&courses!==null;
  return <section className="dtm-grade-report-admin min-w-0" aria-label="教材網課程成績管理">
    <h3>教材網課程成績管理</h3><p className="[overflow-wrap:anywhere]">選定帳戶：{userId}</p>
    {loadedClient!==client&&<p role="status">載入此帳戶的課程中…</p>}{error&&<p role="alert">{error}</p>}
    <Button type="button" variant="outline" disabled={locked||listBusy||loadedClient!==client} onClick={()=>{setLoadedClient(null);setVersion(value=>value+1);}}>重新載入可管理課程</Button>
    {ready&&<><label>成績報告課程<select aria-label="成績報告課程" value={courseId} disabled={locked} onChange={event=>setCourseId(event.target.value)}>
      <option value="">選擇課程</option>{courses.rows.map(course=><option key={course.id} value={course.id}>{course.title} · {course.code} · {course.term}</option>)}
    </select></label>
    {courses.nextCursor&&<><p role="status">尚有其他課程，請載入更多；未列出的課程不代表沒有資料。</p><Button type="button" variant="outline" disabled={listBusy} onClick={()=>void more()}>載入更多課程</Button></>}
    {!courses.nextCursor&&courses.rows.length===0&&<p role="status">此帳戶目前沒有可管理的課程。</p>}
    {courseId&&courses.rows.some(course=>course.id===courseId)&&<CourseGradeManager key={courseId} managerId={managerId} userId={userId} courseId={courseId} client={client} onSaved={onSaved} onLockChange={setLocked}/>}</>}
  </section>;
}
function CourseGradeManager({managerId,userId,courseId,client,onSaved,onLockChange}:DtmGradeReportManagerProps&{courseId:string;client:ManagerClient;onLockChange:(locked:boolean)=>void}){
  const [data,setData]=useState<DtmGradeReportData|null>(null),[draft,setDraft]=useState<Draft>(blank),[baseline,setBaseline]=useState<Draft>(blank);
  const [busy,setBusy]=useState(true),[stale,setStale]=useState(false),[missing,setMissing]=useState(false),[collision,setCollision]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
  const [selected,setSelected]=useState(()=>({id:crypto.randomUUID() as string,version:0})),[pending,setPending]=useState<Operation|null>(null),[loadedClient,setLoadedClient]=useState<typeof client|null>(null);
  const [expanded,setExpanded]=useState<string[]>([]),[totalOpen,setTotalOpen]=useState(false);
  const task=useRef<AbortController|null>(null),inFlight=useRef(false),base=useRef(selected),operation=useRef<Operation|null>(null),dirtyRef=useRef(false);
  const dirty=JSON.stringify(draft)!==JSON.stringify(baseline);
  useEffect(()=>{dirtyRef.current=dirty;},[dirty]);
  useEffect(()=>{onLockChange(busy||dirty||Boolean(pending)||stale||missing||collision);return()=>onLockChange(false);},[busy,dirty,pending,stale,missing,collision,onLockChange]);
  const live=(controller:AbortController)=>task.current===controller&&!controller.signal.aborted;
  function notifySaved(){try{onSaved?.();}catch{setMessage(current=>current+' 外層資料尚未更新，請稍後重新載入。');}}
  function choose(report:DtmGradeReportRecord|null){
    const next=report?fromReport(report):blank();base.current={id:report?.id??crypto.randomUUID(),version:report?.version??0};setSelected(base.current);operation.current=null;setPending(null);
    setDraft(next);setBaseline(next);setExpanded([]);setTotalOpen(false);setStale(false);setMissing(false);setCollision(false);setError('');setMessage('');
  }
  async function read(controller:AbortController){const next=parseDtmGradeReport(await client.loadAdmin(managerId,userId,courseId,controller.signal),userId,courseId);controller.signal.throwIfAborted();return next;}
  function accept(next:DtmGradeReportData,discard=false){
    const row=next.report,current=operation.current;setData(next);setStale(false);setMissing(false);setCollision(false);
    if(discard){choose(row);return;}
    if(current?.confirmed){
      if(current.action.kind==='save_dtm_grade_report'&&(!row||row.id!==current.action.payload.id||row.version<current.action.payload.expected_version+1)
        ||current.action.kind==='delete_dtm_grade_report'&&row?.id===current.action.payload.id)throw new DtmGradeReportClientError('操作已確認，但最新報告尚無法確認；請重新載入，勿重複儲存。');
      choose(row);return;
    }
    // Refreshing after a lost response cannot replace its exact replay command.
    if(current&&!current.conflict)return;
    operation.current=null;setPending(null);
    if(row?.id===base.current.id){base.current={id:row.id,version:row.version};setSelected(base.current);const saved=fromReport(row);setBaseline(saved);if(!dirtyRef.current)setDraft(saved);}
    else if(base.current.version>0)setMissing(true);
    else if(row)setCollision(true);
  }
  useEffect(()=>{
    const controller=new AbortController();task.current=controller;inFlight.current=true;
    void Promise.resolve().then(()=>{controller.signal.throwIfAborted();return client.loadAdmin(managerId,userId,courseId,controller.signal);}).then(value=>{
      const next=parseDtmGradeReport(value,userId,courseId);if(live(controller)){setData(next);choose(next.report);}
    }).catch(reason=>{if(live(controller)){setData(null);setError(failure(reason));}}).finally(()=>{if(live(controller)){inFlight.current=false;setLoadedClient(client);setBusy(false);}});
    return()=>{controller.abort();operation.current=null;};
  },[client,managerId,userId,courseId]);
  async function refresh(discard=false){
    const controller=task.current;if(!controller||!live(controller)||inFlight.current)return;inFlight.current=true;setBusy(true);setError('');setMessage('');
    try{const next=await read(controller);if(!live(controller))return;const recovered=Boolean(operation.current?.confirmed);accept(next,discard);setMessage(discard?'已放棄草稿並載入儲存報告；先前送出的操作不會因此撤銷。':'最新報告已載入；尚未儲存的草稿保留供比較。');if(recovered)notifySaved();}
    catch(reason){if(live(controller)){setStale(true);if(reason instanceof DtmGradeReportClientError&&[401,403].includes(reason.status))setData(null);setError(failure(reason));}}
    finally{if(live(controller)){inFlight.current=false;setBusy(false);}}
  }
  function actionFor(deleting:boolean):DtmGradeReportAction{
    const common={id:base.current.id,user_id:userId,course_id:courseId,request_id:crypto.randomUUID(),expected_version:base.current.version};
    return deleting?{kind:'delete_dtm_grade_report',payload:common}:{kind:'save_dtm_grade_report',payload:{...common,report:content(draft)}};
  }
  const exhausted=selected.version>=999999999;
  async function mutate(deleting=false){
    const controller=task.current,current=operation.current;
    if(!controller||!live(controller)||inFlight.current||loadedClient!==client||!data||stale||missing||collision||exhausted||current?.confirmed
      ||current&&!current.conflict&&(current.action.kind==='delete_dtm_grade_report')!==deleting||deleting&&(base.current.version===0||dirty))return;
    const proposed=actionFor(deleting),invalid=validateDtmGradeReportPayload(proposed.kind,proposed.payload);if(invalid){setError(invalid);return;}
    const {request_id:_request,...fields}=proposed.payload,fingerprint=JSON.stringify({kind:proposed.kind,payload:fields});
    if(operation.current?.fingerprint!==fingerprint)operation.current={fingerprint,action:proposed,confirmed:false,conflict:false};
    const active=operation.current;setPending({...active});inFlight.current=true;setBusy(true);setError('');setMessage('');
    try{
      parseDtmGradeReportReceipt(await client.manage(managerId,active.action,controller.signal),active.action);controller.signal.throwIfAborted();if(!live(controller))return;
      active.confirmed=true;setPending({...active});const next=await read(controller);if(!live(controller))return;accept(next);
      setMessage(deleting?'已刪除站內成績原文報告；原識別碼保留。':'已儲存站內成績原文報告。');notifySaved();
    }catch(reason){if(live(controller)){
      if(reason instanceof DtmGradeReportClientError&&reason.status===409){active.conflict=true;setPending({...active});setStale(true);}
      if(reason instanceof DtmGradeReportClientError&&[401,403].includes(reason.status))setData(null);
      setError(active.confirmed?'操作已確認，但報告尚無法重新載入。請重新載入，勿重複儲存。':failure(reason));
    }}finally{if(live(controller)){inFlight.current=false;setBusy(false);}}
  }
  const loading=busy||loadedClient!==client,uncertain=Boolean(pending&&!pending.conflict&&!pending.confirmed),editBlocked=loading||uncertain||Boolean(pending?.confirmed),writeBlocked=loading||stale||missing||collision||exhausted||Boolean(pending?.confirmed);
  function change(update:(value:Draft)=>Draft){if(editBlocked)return;setDraft(update);setError('');setMessage('');}
  function itemChange(id:string,patch:Partial<DraftItem>){change(value=>({...value,items:value.items.map(row=>row.id===id?{...row,...patch}:row)}));}
  function move(index:number,direction:-1|1){change(value=>{const items=[...value.items],target=index+direction;if(target<0||target>=items.length)return value;[items[index],items[target]]=[items[target],items[index]];return {...value,items};});}
  return <section className="dtm-grade-report-manager affairs-manager min-w-0" aria-label="教材網成績原文管理" aria-busy={loading}>
    <h3>教材網成績原文管理</h3><p className="[overflow-wrap:anywhere]">帳戶：{userId}<br/>課程：{courseId}</p>
    <p>保存明確提供的原文；空白與未提供分開保存。數值欄位不會換算為百分比、全距或課程總分。</p>
    {loading&&<p role="status">載入或儲存成績原文報告中…</p>}{loadedClient===client&&error&&<p role="alert" className="text-destructive">{error}</p>}{loadedClient===client&&message&&<p role="status">{message}</p>}
    <Button type="button" variant="outline" disabled={loading} onClick={()=>void refresh()}>重新載入成績原文報告</Button>
    {loadedClient===client&&data&&<>
      <p aria-label="已儲存成績原文報告">{data.report?`已儲存站內報告 · 版本 ${data.report.version}`:'目前沒有站內成績原文報告。'}</p>
      {(dirty||pending||missing||collision)&&<Button type="button" variant="outline" disabled={busy} onClick={()=>void refresh(true)}>放棄草稿並重新載入</Button>}
      {stale&&<p role="status">儲存前請重新載入最新報告；草稿已保留。</p>}
      {missing&&<p role="status">原報告已無法取得；請放棄草稿後載入目前報告或新增。</p>}
      {collision&&<p role="status">此課程已有另一筆報告；請放棄草稿後載入該筆報告。</p>}
      {exhausted&&<p role="status">此報告已達版本上限，無法再次修改。</p>}
      {uncertain&&<p role="status">先前操作尚未確認；重試會使用相同操作識別碼。放棄草稿不會撤銷已送出的操作。</p>}
      <form className="affairs-record-form" onSubmit={(event:FormEvent)=>{event.preventDefault();void mutate();}}>
        <h4>{selected.version?'編輯':'新增'}站內成績原文報告{selected.version?` · 版本 ${selected.version}`:''}</h4>
        <fieldset disabled={editBlocked} className="min-w-0"><legend>評分項目（依儲存順序顯示）</legend>
          {draft.items.map((row,index)=><section key={row.id} className="my-3 min-w-0 rounded border p-3">
            <div className="flex flex-wrap gap-2"><Button type="button" variant="outline" aria-expanded={expanded.includes(row.id)} aria-controls={'grade-editor-'+row.id} onClick={()=>setExpanded(values=>values.includes(row.id)?values.filter(id=>id!==row.id):[...values,row.id])}>編輯評分項目 {index+1}</Button>
              <span className="[overflow-wrap:anywhere]">{row.label||'未填名稱'}</span><Button type="button" size="sm" variant="outline" disabled={index===0} onClick={()=>move(index,-1)}>上移評分項目 {index+1}</Button><Button type="button" size="sm" variant="outline" disabled={index===draft.items.length-1} onClick={()=>move(index,1)}>下移評分項目 {index+1}</Button>
              <Button type="button" size="sm" variant="outline" onClick={()=>change(value=>({...value,items:value.items.filter(item=>item.id!==row.id)}))}>移除評分項目 {index+1}</Button></div>
            {expanded.includes(row.id)&&<div id={'grade-editor-'+row.id} className="mt-3 grid gap-3">
              <label>評分項目名稱<Input aria-label={`評分項目 ${index+1} 名稱`} maxLength={320} required value={row.label} onChange={event=>itemChange(row.id,{label:event.target.value})}/></label>
              <label>活動類型<select aria-label={`評分項目 ${index+1} 活動類型`} value={row.activityKind??''} onChange={event=>itemChange(row.id,{activityKind:event.target.value==='assignment'?'assignment':null})}><option value="">未提供</option><option value="assignment">作業</option></select></label>
              <CellEditor prefix={`評分項目 ${index+1}`} value={row} onChange={patch=>itemChange(row.id,patch)}/>
            </div>}
          </section>)}
          <Button type="button" variant="outline" disabled={draft.items.length>=dtmGradeReportMaxItems} onClick={()=>{const id=crypto.randomUUID();change(value=>({...value,items:[...value.items,{...draftCells(emptyDtmGradeCells()),id,label:'',activityKind:null}]}));setExpanded(ids=>[...ids,id]);}}>新增評分項目</Button>
          <label className="mt-4 block"><input type="checkbox" aria-label="提供課程總分原文" checked={draft.total!==null} onChange={event=>{change(value=>({...value,total:event.target.checked?draftCells(emptyDtmGradeCells()):null}));setTotalOpen(event.target.checked);}}/>提供課程總分原文</label>
          {draft.total!==null&&<><Button type="button" variant="outline" aria-expanded={totalOpen} aria-controls="grade-report-total-editor" onClick={()=>setTotalOpen(value=>!value)}>編輯課程總分原文</Button>{totalOpen&&<div id="grade-report-total-editor" className="mt-3"><CellEditor prefix="課程總分" value={draft.total} onChange={patch=>change(value=>({...value,total:value.total?{...value.total,...patch}:null}))}/></div>}</>}
        </fieldset>
        <Button type="submit" disabled={writeBlocked||uncertain&&pending?.action.kind==='delete_dtm_grade_report'}>儲存成績原文報告</Button>
        {selected.version>0&&<details><summary>刪除此站內報告</summary><p>原識別碼保留，無法重建。不更動個人成績紀錄或校方成績。</p><Button type="button" variant="destructive" disabled={writeBlocked||dirty||uncertain&&pending?.action.kind!=='delete_dtm_grade_report'} onClick={()=>void mutate(true)}>確認刪除成績原文報告</Button></details>}
      </form>
    </>}
  </section>;
}
