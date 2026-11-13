import {useEffect,useRef,useState} from 'react';
import type {CourseOffering} from './courseCatalogModel.js';
import {syllabusSearchClient,SyllabusSearchClientError,validateSyllabusMetadataPayload,type SyllabusMetadataPayload,type SyllabusMetadataReceipt,type SyllabusSearchApiClient,type SyllabusSearchMetadata} from '../../../services/syllabusSearchClient';

type Props={userId:string;record:CourseOffering;latest:CourseOffering|undefined;disabled:boolean;onDirtyChange?:(dirty:boolean)=>void;onBusyChange:(busy:boolean)=>void;onSaved:(receipt:SyllabusMetadataReceipt,metadata:SyllabusSearchMetadata)=>void;onReload:()=>void;client?:Pick<SyllabusSearchApiClient,'saveMetadata'>};
const metadata=(row:CourseOffering):SyllabusSearchMetadata=>({syllabus_is_current:row.syllabus_is_current??null,academic_year_text:row.academic_year_text??null,semester_text:row.semester_text??null});
/** Separate versioned operation: legacy course edits never infer or write these display values. */
export function SyllabusSearchMetadataEditor(props:Props){return <AccountSyllabusMetadata key={props.userId+':'+props.record.id} {...props}/>;}
function AccountSyllabusMetadata({userId,record,latest,disabled,onDirtyChange,onBusyChange,onSaved,onReload,client=syllabusSearchClient}:Props){
  const [base,setBase]=useState(()=>({version:record.version,fields:metadata(record)}));
  const [fields,setFields]=useState<SyllabusSearchMetadata>(()=>metadata(record));
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[status,setStatus]=useState(''),[conflict,setConflict]=useState(false);
  const [retryFingerprint,setRetryFingerprint]=useState<string|null>(null);
  const active=useRef<AbortController|null>(null),retry=useRef<{fingerprint:string;requestId:string}|null>(null);
  const alive=useRef(true);
  const dirty=JSON.stringify(fields)!==JSON.stringify(base.fields);
  const fingerprint=JSON.stringify({id:record.id,expected_version:base.version,...fields});
  const stale=!latest||latest.id!==record.id||latest.version>base.version;
  const replay=retryFingerprint===fingerprint;
  const blocked=disabled||busy||record.version<1||conflict||stale&&!replay;
  useEffect(()=>{alive.current=true;return()=>{alive.current=false;active.current?.abort();};},[]);
  useEffect(()=>{onDirtyChange?.(dirty);},[dirty,onDirtyChange]);
  useEffect(()=>{
    if(latest&&latest.version>base.version&&!dirty&&!busy&&!retry.current&&!conflict){const next=metadata(latest);setBase({version:latest.version,fields:next});setFields(next);}
  },[latest,base.version,dirty,busy,conflict]);
  function change<K extends keyof SyllabusSearchMetadata>(key:K,value:SyllabusSearchMetadata[K]){setFields(current=>({...current,[key]:value}));setError('');setStatus('');}
  async function save(){
    if(blocked||active.current)return;
    const requestId=retry.current?.fingerprint===fingerprint?retry.current.requestId:crypto.randomUUID();
    const payload:SyllabusMetadataPayload={id:record.id,expected_version:base.version,request_id:requestId,...fields};
    if(!validateSyllabusMetadataPayload(payload)){setError('學年與學期文字各限 30 個字元，且不可包含無效字元。');return;}
    retry.current={fingerprint,requestId};setRetryFingerprint(fingerprint);const controller=new AbortController();active.current=controller;setBusy(true);onBusyChange(true);setError('');setStatus('');
    try{
      const receipt=await client.saveMetadata(userId,payload,controller.signal);
      if(controller.signal.aborted||!alive.current)return;
      retry.current=null;setRetryFingerprint(null);setBase({version:receipt.version,fields:{...fields}});setStatus('已儲存課綱查詢設定。');onSaved(receipt,{...fields});
    }catch(cause){if(!controller.signal.aborted&&alive.current){if(cause instanceof SyllabusSearchClientError&&cause.status===409)setConflict(true);setError(cause instanceof SyllabusSearchClientError?cause.message:'課綱查詢設定暫時無法儲存，請重試。');}}
    finally{if(active.current===controller)active.current=null;if(!controller.signal.aborted&&alive.current){setBusy(false);onBusyChange(false);}}
  }
  return <section className="syllabus-metadata-editor" aria-label="課綱查詢設定">
    <h3>課綱查詢設定</h3><p>當期歸屬與學年、學期顯示文字須明確設定；不會從開課代碼或日期推算。未設定的值保留空白。</p>
    <form onSubmit={event=>{event.preventDefault();void save();}}>
      <fieldset disabled={disabled||busy||record.version<1}><legend>獨立儲存的課綱查詢資料</legend>
        <div className="catalog-editor-fields">
          <label>當期課綱歸屬<select aria-label="當期課綱歸屬" value={fields.syllabus_is_current===null?'':String(fields.syllabus_is_current)} onChange={event=>change('syllabus_is_current',event.target.value===''?null:event.target.value==='true')}><option value="">未設定</option><option value="true">當期</option><option value="false">非當期</option></select></label>
          {([['academic_year_text','學年顯示文字'],['semester_text','學期顯示文字']] as const).map(([key,label])=><div key={key}><label>{label}<input aria-label={label} maxLength={60} disabled={fields[key]===null} value={fields[key]??''} onChange={event=>change(key,event.target.value)}/></label><label><input type="checkbox" checked={fields[key]===null} onChange={event=>change(key,event.target.checked?null:'')}/>{label}未提供</label></div>)}
        </div>
        <button type="submit" disabled={blocked}>{busy?'儲存中…':'儲存課綱查詢設定'}</button><button type="button" onClick={()=>{setFields({syllabus_is_current:null,academic_year_text:null,semester_text:null});setStatus('');setError('');}}>清空查詢設定</button>
        <button type="button" disabled={!dirty} onClick={()=>{setFields({...base.fields});setStatus('');setError('');}}>取消查詢設定變更</button>
      </fieldset>
    </form>
    {record.version<1&&<p>請先儲存課程，再維護課綱查詢設定。</p>}
    {(conflict||stale&&record.version>0&&!replay)&&<p role="alert">此課程已更新或不在目前載入的資料中，請重新載入並選取課程後再儲存。</p>}
    {error&&<p role="alert">{error}</p>}{status&&<p role="status">{status}</p>}
    {(conflict||stale&&record.version>0)&&<button type="button" disabled={disabled||busy} onClick={onReload}>重新載入課程</button>}
  </section>;
}
