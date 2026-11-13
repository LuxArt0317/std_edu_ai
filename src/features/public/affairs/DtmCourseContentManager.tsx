import {useEffect,useRef,useState,type FormEvent} from 'react';
import {Button} from '@/components/ui/button';
import {dtmCourseContentMaxReferences,validateDtmCourseContentPayload} from '../../../../server/dtmCourseContent.js';
import {dtmCourseContentClient,DtmCourseContentClientError,dtmCourseContentSections,dtmCourseActivityKey,loadAllDtmCourseContent,parseDtmCourseContentCoursesData,parseDtmCourseContentReceipt,type DtmCourseContentReference,type DtmCourseContentRecord,type DtmCourseContentSnapshot,type DtmCourseContentAction,type DtmCourseContentClient,type DtmCourseContentCourse} from '@/services/dtmCourseContent';
type Draft=DtmCourseContentReference[];
type Operation={fingerprint:string;action:DtmCourseContentAction;confirmed:boolean;conflict:boolean};
type ManagerClient=Pick<DtmCourseContentClient,'loadCoursesAdmin'|'loadAdmin'|'manage'>;
export type DtmCourseContentManagerProps={managerId:string;userId:string;client?:ManagerClient;onSaved?:()=>void;onBusyChange?:(busy:boolean)=>void};
const blank=():Draft=>[];
const fromRecord=(record:DtmCourseContentRecord):Draft=>record.references.map(row=>({...row}));
const failure=(reason:unknown)=>reason instanceof DtmCourseContentClientError?reason.message:'課程排列暫時無法確認，請保留草稿並重試。';
export function DtmCourseContentManager(props:DtmCourseContentManagerProps){return <OwnerContentManager key={`${props.managerId}:${props.userId}`} {...props}/>;}
function OwnerContentManager({managerId,userId,client=dtmCourseContentClient,onSaved,onBusyChange}:DtmCourseContentManagerProps){
  const [courses,setCourses]=useState<{rows:DtmCourseContentCourse[];nextCursor:string|null}|null>(null),[loadedClient,setLoadedClient]=useState<ManagerClient|null>(null),[error,setError]=useState(''),[version,setVersion]=useState(0),[listBusy,setListBusy]=useState(true);
  const [courseId,setCourseId]=useState(''),[locked,setLocked]=useState(false);
  const task=useRef<AbortController|null>(null),inFlight=useRef(false);
  useEffect(()=>{onBusyChange?.(locked);return()=>onBusyChange?.(false);},[locked,onBusyChange]);
  useEffect(()=>{
    const controller=new AbortController();task.current=controller;inFlight.current=true;
    void Promise.resolve().then(()=>{controller.signal.throwIfAborted();setListBusy(true);setError('');return client.loadCoursesAdmin(managerId,userId,{},controller.signal);}).then(value=>{
      const next=parseDtmCourseContentCoursesData(value,userId);if(!controller.signal.aborted){setCourses({rows:next.courses,nextCursor:next.nextCursor});setLoadedClient(client);}
    }).catch(reason=>{if(!controller.signal.aborted){setCourses(null);setLoadedClient(client);setError(failure(reason));}}).finally(()=>{if(!controller.signal.aborted){inFlight.current=false;setListBusy(false);}});
    return()=>controller.abort();
  },[managerId,userId,client,version]);
  async function more(){
    const controller=task.current,afterId=courses?.nextCursor;
    if(!controller||controller.signal.aborted||inFlight.current||loadedClient!==client||!afterId)return;
    inFlight.current=true;setListBusy(true);setError('');
    try{const next=parseDtmCourseContentCoursesData(await client.loadCoursesAdmin(managerId,userId,{afterId},controller.signal),userId,afterId);controller.signal.throwIfAborted();
      setCourses(current=>current?{rows:[...current.rows,...next.courses],nextCursor:next.nextCursor}:current);
    }catch(reason){if(!controller.signal.aborted){if(reason instanceof DtmCourseContentClientError&&[401,403].includes(reason.status))setCourses(null);setError(failure(reason));}}finally{if(!controller.signal.aborted){inFlight.current=false;setListBusy(false);}}
  }
  const ready=loadedClient===client&&courses!==null;
  return <section className="dtm-course-content-admin min-w-0" aria-label="教材網課程內容管理">
    <h3>教材網課程內容管理</h3><p className="[overflow-wrap:anywhere]">選定帳戶：{userId}</p>
    {loadedClient!==client&&<p role="status">載入此帳戶的課程中…</p>}{error&&<p role="alert">{error}</p>}
    <Button type="button" variant="outline" disabled={locked||listBusy||loadedClient!==client} onClick={()=>{setLoadedClient(null);setVersion(value=>value+1);}}>重新載入可管理課程</Button>
    {ready&&<><label>內容排列課程<select aria-label="內容排列課程" value={courseId} disabled={locked} onChange={event=>setCourseId(event.target.value)}>
      <option value="">選擇課程</option>{courses.rows.map(course=><option key={course.id} value={course.id}>{course.title} · {course.code} · {course.term}</option>)}
    </select></label>
    {courses.nextCursor&&<><p role="status">尚有其他課程，請載入更多；未列出的課程不代表沒有資料。</p><Button type="button" variant="outline" disabled={listBusy} onClick={()=>void more()}>載入更多課程</Button></>}
    {!courses.nextCursor&&courses.rows.length===0&&<p role="status">此帳戶目前沒有可管理的課程。</p>}
    {courseId&&courses.rows.some(course=>course.id===courseId)&&<CourseContentManager key={courseId} managerId={managerId} userId={userId} courseId={courseId} client={client} onSaved={onSaved} onLockChange={setLocked}/>}</>}
  </section>;
}
function CourseContentManager({managerId,userId,courseId,client,onSaved,onLockChange}:DtmCourseContentManagerProps&{courseId:string;client:ManagerClient;onLockChange:(locked:boolean)=>void}){
  const [data,setData]=useState<DtmCourseContentSnapshot|null>(null),[draft,setDraft]=useState<Draft>(blank),[baseline,setBaseline]=useState<Draft>(blank);
  const [busy,setBusy]=useState(true),[stale,setStale]=useState(false),[missing,setMissing]=useState(false),[collision,setCollision]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
  const [selected,setSelected]=useState(()=>({id:crypto.randomUUID() as string,version:0})),[pending,setPending]=useState<Operation|null>(null),[loadedClient,setLoadedClient]=useState<typeof client|null>(null);
  const [adding,setAdding]=useState('');
  const task=useRef<AbortController|null>(null),inFlight=useRef(false),base=useRef(selected),operation=useRef<Operation|null>(null),dirtyRef=useRef(false);
  const dirty=JSON.stringify(draft)!==JSON.stringify(baseline);
  useEffect(()=>{dirtyRef.current=dirty;},[dirty]);
  useEffect(()=>{onLockChange(busy||dirty||Boolean(pending)||stale||missing||collision);return()=>onLockChange(false);},[busy,dirty,pending,stale,missing,collision,onLockChange]);
  const live=(controller:AbortController)=>task.current===controller&&!controller.signal.aborted;
  function notifySaved(){try{onSaved?.();}catch{setMessage(current=>current+' 外層資料尚未更新，請稍後重新載入。');}}
  function choose(report:DtmCourseContentRecord|null){
    const next=report?fromRecord(report):blank();base.current={id:report?.id??crypto.randomUUID(),version:report?.version??0};setSelected(base.current);operation.current=null;setPending(null);
    setDraft(next);setBaseline(next);setAdding('');setStale(false);setMissing(false);setCollision(false);setError('');setMessage('');
  }
  async function read(controller:AbortController){return loadAllDtmCourseContent((options,signal)=>client.loadAdmin(managerId,userId,courseId,options,signal),userId,courseId,controller.signal);}
  function accept(next:DtmCourseContentSnapshot,discard=false){
    const row=next.content,current=operation.current;setData(next);setStale(false);setMissing(false);setCollision(false);
    if(discard){choose(row);return;}
    if(current?.confirmed){
      if(current.action.kind==='save_dtm_course_content'&&(!row||row.id!==current.action.payload.id||row.version<current.action.payload.expected_version+1)
        ||current.action.kind==='delete_dtm_course_content'&&row?.id===current.action.payload.id)throw new DtmCourseContentClientError('操作已確認，但最新排列尚無法確認；請重新載入，勿重複儲存。');
      choose(row);return;
    }
    // Refreshing after a lost response cannot replace its exact replay command.
    if(current&&!current.conflict)return;
    operation.current=null;setPending(null);
    if(row?.id===base.current.id){base.current={id:row.id,version:row.version};setSelected(base.current);const saved=fromRecord(row);setBaseline(saved);if(!dirtyRef.current)setDraft(saved);}
    else if(base.current.version>0)setMissing(true);
    else if(row)setCollision(true);
  }
  useEffect(()=>{
    const controller=new AbortController();task.current=controller;inFlight.current=true;
    void Promise.resolve().then(()=>{controller.signal.throwIfAborted();return loadAllDtmCourseContent((options,signal)=>client.loadAdmin(managerId,userId,courseId,options,signal),userId,courseId,controller.signal);}).then(value=>{
      const next=value;if(live(controller)){setData(next);choose(next.content);}
    }).catch(reason=>{if(live(controller)){setData(null);setError(failure(reason));}}).finally(()=>{if(live(controller)){inFlight.current=false;setLoadedClient(client);setBusy(false);}});
    return()=>{controller.abort();operation.current=null;};
  },[client,managerId,userId,courseId]);
  async function refresh(discard=false){
    const controller=task.current;if(!controller||!live(controller)||inFlight.current)return;inFlight.current=true;setBusy(true);setError('');setMessage('');
    try{const next=await read(controller);if(!live(controller))return;const recovered=Boolean(operation.current?.confirmed);accept(next,discard);setMessage(discard?'已放棄草稿並載入儲存排列；先前送出的操作不會因此撤銷。':'最新排列已載入；尚未儲存的草稿保留供比較。');if(recovered)notifySaved();}
    catch(reason){if(live(controller)){setStale(true);if(reason instanceof DtmCourseContentClientError&&[401,403].includes(reason.status))setData(null);setError(failure(reason));}}
    finally{if(live(controller)){inFlight.current=false;setBusy(false);}}
  }
  function actionFor(deleting:boolean):DtmCourseContentAction{
    const common={id:base.current.id,user_id:userId,course_id:courseId,request_id:crypto.randomUUID(),expected_version:base.current.version};
    return deleting?{kind:'delete_dtm_course_content',payload:common}:{kind:'save_dtm_course_content',payload:{...common,content:{references:draft}}};
  }
  const exhausted=selected.version>=999999999;
  async function mutate(deleting=false){
    const controller=task.current,current=operation.current;
    if(!controller||!live(controller)||inFlight.current||loadedClient!==client||!data||stale||missing||collision||exhausted||current?.confirmed
      ||current&&!current.conflict&&(current.action.kind==='delete_dtm_course_content')!==deleting||deleting&&(base.current.version===0||dirty))return;
    if(!deleting&&!current&&draft.some(row=>!data.activities.some(item=>dtmCourseActivityKey(item)===dtmCourseActivityKey(row)))){setError('請先移除已無法取得的活動引用。');return;}
    const proposed=actionFor(deleting),invalid=validateDtmCourseContentPayload(proposed.kind,proposed.payload);if(invalid){setError(invalid);return;}
    const {request_id:_request,...fields}=proposed.payload,fingerprint=JSON.stringify({kind:proposed.kind,payload:fields});
    if(operation.current?.fingerprint!==fingerprint)operation.current={fingerprint,action:proposed,confirmed:false,conflict:false};
    const active=operation.current;setPending({...active});inFlight.current=true;setBusy(true);setError('');setMessage('');
    try{
      parseDtmCourseContentReceipt(await client.manage(managerId,active.action,controller.signal),active.action);controller.signal.throwIfAborted();if(!live(controller))return;
      active.confirmed=true;setPending({...active});const next=await read(controller);if(!live(controller))return;accept(next);
      setMessage(deleting?'已刪除站內課程內容排列；原識別碼保留。':'已儲存站內課程內容排列。');notifySaved();
    }catch(reason){if(live(controller)){
      if(reason instanceof DtmCourseContentClientError&&reason.status===409){active.conflict=true;setPending({...active});setStale(true);}
      if(reason instanceof DtmCourseContentClientError&&[401,403].includes(reason.status))setData(null);
      setError(active.confirmed?'操作已確認，但排列尚無法重新載入。請重新載入，勿重複儲存。':failure(reason));
    }}finally{if(live(controller)){inFlight.current=false;setBusy(false);}}
  }
  const loading=busy||loadedClient!==client,uncertain=Boolean(pending&&!pending.conflict&&!pending.confirmed),editBlocked=loading||uncertain||Boolean(pending?.confirmed),writeBlocked=loading||stale||missing||collision||exhausted||Boolean(pending?.confirmed);
  function change(update:(value:Draft)=>Draft){if(editBlocked)return;setDraft(update);setError('');setMessage('');}
  const available=new Map((data?.activities??[]).map(item=>[dtmCourseActivityKey(item),item]));
  const draftKeys=new Set(draft.map(dtmCourseActivityKey)),unavailable=draft.filter(item=>!available.has(dtmCourseActivityKey(item)));
  function move(key:string,direction:-1|1){change(rows=>{const index=rows.findIndex(row=>dtmCourseActivityKey(row)===key);if(index<0)return rows;let target=index+direction;while(target>=0&&target<rows.length&&rows[target].section!==rows[index].section)target+=direction;if(target<0||target>=rows.length)return rows;const next=[...rows];[next[index],next[target]]=[next[target],next[index]];return next;});}
  function add(){const row=available.get(adding);if(!row||draftKeys.has(adding)||draft.length>=dtmCourseContentMaxReferences)return;change(rows=>[...rows,{kind:row.kind,id:row.id,section:row.kind==='assignment'?'assignments':'materials'}]);setAdding('');}
  return <section className="dtm-course-content-manager affairs-manager min-w-0" aria-label="教材網課程排列管理" aria-busy={loading}>
    <h3>教材網課程排列管理</h3><p className="[overflow-wrap:anywhere]">帳戶：{userId}<br/>課程：{courseId}</p>
    <p>設定既有活動所在區域與排列；不修改活動內容或作業繳交紀錄。未指定活動會依預設排列顯示。</p>
    {loading&&<p role="status">載入或儲存課程排列中…</p>}{loadedClient===client&&error&&<p role="alert">{error}</p>}{loadedClient===client&&message&&<p role="status">{message}</p>}
    <Button type="button" variant="outline" disabled={loading} onClick={()=>void refresh()}>重新載入課程排列</Button>
    {loadedClient===client&&data&&<>
      <p aria-label="已儲存課程排列">{data.content?`已儲存站內排列 · 版本 ${data.content.version}`:'目前使用既有活動的預設排列。'}</p>
      {(dirty||pending||missing||collision)&&<Button type="button" variant="outline" disabled={busy} onClick={()=>void refresh(true)}>放棄草稿並重新載入</Button>}
      {stale&&<p role="status">儲存前請重新載入最新排列；草稿已保留。</p>}
      {missing&&<p role="status">原排列已無法取得；請放棄草稿後載入目前排列或新增。</p>}
      {collision&&<p role="status">此課程已有另一筆排列；請放棄草稿後載入該筆排列。</p>}
      {exhausted&&<p role="status">此排列已達版本上限，無法再次修改。</p>}
      {uncertain&&<p role="status">先前操作尚未確認；重試會使用相同操作識別碼。放棄草稿不會撤銷已送出的操作。</p>}
      {unavailable.length>0&&<p role="status">有 {unavailable.length} 筆活動已無法取得；請明確移除這些引用後再儲存。</p>}
      <form onSubmit={(event:FormEvent)=>{event.preventDefault();void mutate();}} className="affairs-record-form">
        <fieldset disabled={editBlocked} className="min-w-0"><legend>活動區域與順序</legend>
          {dtmCourseContentSections.map(section=>{const rows=draft.filter(row=>row.section===section.key);return <section key={section.key} aria-label={section.zh+'排列'}><h4>{section.zh}</h4>
            <ol>{rows.map((row,index)=>{const key=dtmCourseActivityKey(row),activity=available.get(key);return <li key={key} className="my-3 min-w-0 rounded border p-3" data-activity-key={key}>
              <p className="[overflow-wrap:anywhere]">{activity?.title??'無法取得的活動'} · {row.kind==='assignment'?'作業':'教材'} · {row.id}</p>
              <label>活動區域<select aria-label={'活動區域 '+key} value={row.section} onChange={event=>change(values=>values.map(item=>dtmCourseActivityKey(item)===key?{...item,section:event.target.value as DtmCourseContentReference['section']}:item))}>
                {dtmCourseContentSections.map(option=><option key={option.key} value={option.key}>{option.zh}</option>)}
              </select></label>
              <div className="flex flex-wrap gap-2"><Button type="button" variant="outline" disabled={index===0} onClick={()=>move(key,-1)} aria-label={'上移 '+key}>上移</Button>
              <Button type="button" variant="outline" disabled={index===rows.length-1} onClick={()=>move(key,1)} aria-label={'下移 '+key}>下移</Button>
              <Button type="button" variant="outline" onClick={()=>change(values=>values.filter(item=>dtmCourseActivityKey(item)!==key))} aria-label={'移除 '+key}>移除引用</Button></div>
            </li>;})}</ol>
          </section>;})}
          <label>加入既有活動<select aria-label="加入既有活動" value={adding} onChange={event=>setAdding(event.target.value)}><option value="">選擇活動</option>{data.activities.filter(row=>!draftKeys.has(dtmCourseActivityKey(row))).map(row=><option key={dtmCourseActivityKey(row)} value={dtmCourseActivityKey(row)}>{row.title} · {row.kind==='assignment'?'作業':'教材'}</option>)}</select></label>
          <Button type="button" variant="outline" disabled={!adding||draft.length>=dtmCourseContentMaxReferences} onClick={add}>加入活動排列</Button>
        </fieldset>
        <Button type="submit" disabled={writeBlocked||unavailable.length>0&&!uncertain||uncertain&&pending?.action.kind==='delete_dtm_course_content'}>儲存課程排列</Button>
        {selected.version>0&&<details><summary>恢復預設活動排列</summary><p>移除此筆排列並保留原識別碼；不刪除任何活動。</p><Button type="button" variant="destructive" disabled={writeBlocked||dirty||uncertain&&pending?.action.kind!=='delete_dtm_course_content'} onClick={()=>void mutate(true)}>確認恢復預設排列</Button></details>}
      </form>
    </>}
  </section>;
}
