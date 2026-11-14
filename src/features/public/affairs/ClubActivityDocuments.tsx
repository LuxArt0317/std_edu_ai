import { useEffect,useRef,useState,type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import {
  clubPdfContent,downloadClubDocument,loadClubDocuments,saveClubDocument,type ClubDocument,type ClubDocuments,
} from '@/services/clubActivityDocuments';

const labels={proposal:'活動企劃書附件',closeout:'結案報告附件'};
type Upload={filename:string;content:string};
export function ClubActivityDocuments({userId,applicationId,onChanged,busy,onBusy}:{
  userId:string;applicationId:string;onChanged:()=>void;busy:boolean;onBusy:(value:boolean)=>void;
}) {
  const [data,setData]=useState<ClubDocuments|null>(null);
  const [error,setError]=useState('');
  const [attempt,retry]=useState(0);
  const [status,setStatus]=useState('');
  const write=useRef<AbortController|null>(null);
  const [confirm,setConfirm]=useState<ClubDocument['kind']|null>(null);
  const intent=useRef<{signature:string;requestId:string;file:File|null}|null>(null);
  useEffect(()=>{
    const controller=new AbortController();
    void loadClubDocuments(userId,applicationId,controller.signal).then(
      value=>{if(!controller.signal.aborted)setData(value);},
      reason=>{if(!controller.signal.aborted)setError(reason instanceof Error?reason.message:'無法讀取附件。');},
    );
    return ()=>controller.abort();
  },[userId,applicationId,attempt]);
  useEffect(()=>()=>write.current?.abort(),[]);
  const reload=()=>{setData(null);setConfirm(null);setError('');retry(value=>value+1);};

  async function perform(action:(signal:AbortSignal)=>Promise<void>) {
    if(write.current||busy)return;
    const controller=new AbortController();
    write.current=controller;
    onBusy(true);
    setError('');
    setStatus('');
    try{await action(controller.signal);}
    catch(reason){if(!controller.signal.aborted)setError(reason instanceof Error?reason.message:'附件操作未完成。');}
    finally{
      write.current=null;
      if(!controller.signal.aborted)onBusy(false);
    }
  }

  function change(row:ClubDocument,file:File|null) {
    if(!data||!row.editable)return;
    const signature=[row.kind,data.applicationVersion,row.version,file?'upload':'remove'].join(':');
    if(intent.current?.signature!==signature||intent.current.file!==file)
      intent.current={signature,requestId:crypto.randomUUID(),file};
    const requestId=intent.current.requestId;
    void perform(async signal=>{
      const upload:Upload|undefined=file?{filename:file.name,content:await clubPdfContent(file)}:undefined;
      signal.throwIfAborted();
      await saveClubDocument(userId,{
        application_id:applicationId,application_version:data.applicationVersion,kind:row.kind,
        expected_version:row.version,request_id:requestId,
      },signal,upload);
      if(signal.aborted)return;
      intent.current=null;
      setStatus(file?'附件已儲存。':'附件已移除。');
      onChanged();
      reload();
    });
  }

  return <section className="club-documents" aria-label="活動附件">
    {error&&<p role="alert">{error} <button type="button" onClick={reload}>重新載入</button></p>}
    {status&&<p role="status">{status}</p>}
    {!data&&!error&&<p role="status">讀取附件中…</p>}
    {data?.rows.map(row=><div className="club-document-row" key={row.kind}>
      <h3>{labels[row.kind]}</h3>
      {row.filename?<button type="button" className="club-document-download" disabled={busy}
        onClick={()=>void perform(signal=>downloadClubDocument(userId,applicationId,row,signal))}>{row.filename}</button>:<p>無附件</p>}
      {row.editable&&<form onSubmit={(event:FormEvent<HTMLFormElement>)=>{
        event.preventDefault();
        const field=event.currentTarget.elements.namedItem('file');
        const selected=field instanceof HTMLInputElement?field.files?.[0]:undefined;
        if(selected?.size)change(row,selected);
      }}>
        <label>選擇 PDF <input type="file" name="file" accept="application/pdf,.pdf" required disabled={busy}/></label>
        <Button type="submit" size="sm" disabled={busy}>{row.filename?'更換':'上傳'}</Button>
      </form>}
      {row.editable&&row.filename&&(confirm===row.kind?<div>
        <span>移除這份附件？ </span><Button size="sm" type="button" disabled={busy} onClick={()=>change(row,null)}>確認移除</Button>
        <Button variant="ghost" size="sm" type="button" disabled={busy} onClick={()=>setConfirm(null)}>取消</Button>
      </div>:<Button size="sm" variant="outline" type="button" disabled={busy} onClick={()=>setConfirm(row.kind)}>移除</Button>)}
    </div>)}
  </section>;
}
