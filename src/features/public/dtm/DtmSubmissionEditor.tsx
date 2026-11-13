import {useId,useRef,useState} from 'react';
import {dtmEditorAssets,dtmEditorFileError,dtmEditorScopeMatches,ownDtmEditorAssignment,ownDtmEditorSavedFile,
  type DtmEditorAssignment,type DtmEditorFileScope,type DtmEditorSavedFile,type DtmEditorStatus,type DtmEditorView} from '../../../services/dtmSubmissionEditor';
import './dtmSubmissionEditor.css';

export type DtmSubmissionEditorProps={
  userId:string;assignment:DtmEditorAssignment|null;savedFile:DtmEditorSavedFile|null;
  selectedFile:File|null;selectedFileScope:DtmEditorFileScope|null;
  status?:DtmEditorStatus;busy?:boolean;error?:string;progress?:number|null;
  onChoose:(file:File)=>void|Promise<void>;onRemovePending:()=>void|Promise<void>;
  onSave:(file:File)=>void|Promise<void>;onCancel:()=>void|Promise<void>;
  onDownload?:(savedFileId:string)=>void|Promise<void>;
  onReload?:()=>void|Promise<void>;
};
const views:[DtmEditorView,string][]=[['icons','圖示檢視'],['list','清單檢視'],['tree','樹狀檢視']];
type Operation='choose'|'remove'|'save'|'cancel'|'download'|'reload';

function EditorForm(props:DtmSubmissionEditorProps&{assignment:DtmEditorAssignment}){
  const {assignment,savedFile,selectedFile,selectedFileScope,status='idle',busy=false,error,progress=null,onChoose,onRemovePending,onSave,onCancel,onDownload}=props;
  const [view,setView]=useState<DtmEditorView>('icons'),[localError,setLocalError]=useState(''),[operation,setOperation]=useState<Operation|null>(null);
  const input=useRef<HTMLInputElement>(null),inFlight=useRef(false),inputId=useId(),errorId=useId(),restrictionId=useId();
  const saved=ownDtmEditorSavedFile(savedFile,assignment);
  const selected=dtmEditorScopeMatches(selectedFileScope,assignment)?selectedFile:null;
  const validation=selected?dtmEditorFileError(selected):null;
  const filename=selected?.name??saved?.filename??null;
  const locked=busy||status!=='idle'||operation!==null;
  const message=localError||error||validation;
  async function perform(kind:Operation,action:()=>void|Promise<void>){
    if(inFlight.current||locked)return;
    inFlight.current=true;setOperation(kind);setLocalError('');
    try{await action();}catch(reason){setLocalError(reason instanceof Error?reason.message:'操作未完成，請重試。');}
    finally{inFlight.current=false;setOperation(null);}
  }
  async function choose(files:FileList|null){
    if(!files||files.length===0)return;
    if(files.length!==1){setLocalError('最多只能選擇 1 個檔案。');return;}
    const file=files[0],failure=dtmEditorFileError(file);
    if(failure){setLocalError(failure);return;}
    await perform('choose',()=>onChoose(file));
  }
  function submit(event:React.FormEvent){
    event.preventDefault();
    if(!selected||validation||locked)return;
    void perform('save',()=>onSave(selected));
  }
  const progressValue=typeof progress==='number'&&Number.isFinite(progress)&&progress>=0&&progress<=100?progress:undefined;
  const icon=filename&&/\.pdf$/i.test(filename)?<img className="dtm-editor-pdf" src={dtmEditorAssets.pdf} width="80" height="80" alt=""/>:
    <span className="dtm-editor-document" aria-hidden="true"/>;
  const fileName=<span className="dtm-editor-filename" title={filename??undefined}>{filename}</span>;
  const remove=selected&&<button className="dtm-editor-remove" type="button" disabled={locked} onClick={()=>void perform('remove',onRemovePending)} aria-label="移除待儲存檔案" title="移除待儲存檔案">×</button>;
  return <form className="dtm-editor-form" onSubmit={submit} aria-busy={locked}>
    <div className="dtm-editor-file-field">
      <div className="dtm-editor-label"><label htmlFor={inputId}>提交檔案</label></div>
      <div className="dtm-editor-manager" role="group" aria-label="提交檔案" aria-describedby={restrictionId}>
        <p className="dtm-editor-restrictions" id={restrictionId}>新檔案的最大容量：10 MiB，最多附件：1</p>
        <input ref={input} id={inputId} className="dtm-editor-file-input" type="file" disabled={locked} aria-describedby={message?`${restrictionId} ${errorId}`:restrictionId}
          onChange={event=>{void choose(event.currentTarget.files);event.currentTarget.value='';}}/>
        <div className="dtm-editor-filebox">
          <div className="dtm-editor-navbar">
            <div className="dtm-editor-toolbar">
              <div className="dtm-editor-tools"><button type="button" disabled={locked} onClick={()=>input.current?.click()} aria-label="新增或取代檔案" title="新增或取代檔案"><img src={dtmEditorAssets.add} width="16" height="16" alt=""/></button>
                <button type="button" disabled={locked||!saved||!onDownload} onClick={()=>saved&&onDownload&&void perform('download',()=>onDownload(saved.id))} aria-label="下載已儲存檔案" title="下載已儲存檔案"><img src={dtmEditorAssets.download} width="16" height="16" alt=""/></button></div>
              <div className="dtm-editor-views" role="group" aria-label="檔案檢視">{views.map(([key,label])=><button type="button" key={key} aria-label={label} title={label} aria-pressed={view===key} disabled={locked} onClick={()=>setView(key)}><img src={dtmEditorAssets[key]} width="16" height="16" alt=""/></button>)}</div>
            </div>
            <div className="dtm-editor-path"><span aria-hidden="true">▸</span><img src="/dtm-theme/folder.svg" width="16" height="16" alt=""/><span>檔案</span></div>
          </div>
          <div className="dtm-editor-body"><div className={`dtm-editor-content is-${view}`} role="region" aria-label="檔案內容，可捲動" tabIndex={0}>
            {filename!==null?(view==='icons'?<div className="dtm-editor-tile"><div className="dtm-editor-thumbnail">{icon}</div>{fileName}{remove}</div>:
              <ul className="dtm-editor-file-list" aria-label={view==='tree'?'檔案樹狀清單':'檔案清單'}><li>{view==='tree'&&<span className="dtm-editor-tree-branch" aria-hidden="true">└</span>}{icon}{fileName}{remove}</li></ul>):null}
          </div></div>
        </div>
        {message&&<p className="dtm-editor-error" id={errorId} role="alert">{message}{props.onReload&&<> <button type="button" disabled={locked} onClick={()=>void perform('reload',props.onReload!)}>重新載入</button></>}</p>}
        {(status!=='idle'||busy)&&<div className="dtm-editor-progress" role="status">{status==='uploading'?'正在上傳檔案…':status==='saving'?'正在儲存變更…':'處理中…'}
          {status==='uploading'&&<progress max="100" value={progressValue} aria-label="檔案上傳進度"/>}</div>}
      </div>
    </div>
    <div className="dtm-editor-actions"><div><button type="submit" disabled={locked||!selected||Boolean(validation)}>儲存更改</button>{' '}<button type="button" disabled={locked} onClick={()=>void perform('cancel',onCancel)}>取消</button></div></div>
  </form>;
}

/** Unmounted editor: the host owns every mutation, private download and Escape handling. */
export function DtmSubmissionEditor(props:DtmSubmissionEditorProps){
  const own=ownDtmEditorAssignment(props.assignment,props.userId),titleId=useId();
  return <section className="dtm-submission-editor" lang="zh-Hant" aria-labelledby={titleId}>
    <span className="dtm-editor-content-start" aria-hidden="true"/><h2 id={titleId}>{own?.title??'作業'}</h2>
    {own?<EditorForm key={`${own.userId}:${own.id}`} {...props} assignment={own}/>:<p role="status">目前沒有可編輯的作業。</p>}
  </section>;
}
