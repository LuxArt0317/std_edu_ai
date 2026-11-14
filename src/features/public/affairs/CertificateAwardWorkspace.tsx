import {useEffect,useRef,useState,type FormEvent} from 'react';
import {Link,useNavigate} from 'react-router';
import {Dialog,DialogContent,DialogDescription,DialogTitle} from '@/components/ui/dialog';
import {changeCertificateAward,downloadCertificateProof,loadCertificateWorkspace,proofFileType,removeCertificateProof,uploadCertificateProof} from '@/services/certificateAwards';
import {certificateAwardLabels,certificateAwardPath,type CertificateAwardReceipt,type CertificateAwardRow,type CertificateCatalogRow,
  type CertificateProof,type CertificateWorkspace,type StudentAwardOp} from '../../../../server/certificateAwardsContract.js';
import {CertificateCatalogForm} from './CertificateCatalogForm';
import './certificateAwards.css';

type View='form'|'catalog'|'record';
type Draft={code:string;obtained:string;phone:string;teacher:string;wants:boolean|null};
type Pending={key:string;request_id:string};

const empty:Draft={code:'',obtained:'',phone:'',teacher:'',wants:null};
const localDate=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'});

function status(row:CertificateAwardRow){return certificateAwardLabels[row.status][0];}
function fromRow(row?:CertificateAwardRow):Draft{
  return row?{code:row.certificate_code,obtained:row.obtained_on,phone:row.phone,teacher:row.teacher_code,wants:row.wants_award}:empty;
}

export function CertificateProofList({userId,files,remove,disabled=false}:{userId:string;files:CertificateProof[];
  remove?:(file:CertificateProof)=>void;disabled?:boolean}){
  const [error,setError]=useState(''),[busy,setBusy]=useState(false);
  const active=useRef<AbortController|null>(null);
  useEffect(()=>()=>active.current?.abort(),[]);
  async function download(file:CertificateProof){
    if(active.current)return;
    const controller=new AbortController();active.current=controller;
    setBusy(true);setError('');
    try{await downloadCertificateProof(userId,file,AbortSignal.any([controller.signal,AbortSignal.timeout(18000)]));}
    catch{if(!controller.signal.aborted)setError('無法下載證明文件。');}
    finally{active.current=null;if(!controller.signal.aborted)setBusy(false);}
  }
  return <>{files.length>0&&<ul className="certificate-proofs">{files.map(file=><li key={file.id}>
    {file.attached?<button type="button" className="certificate-query" disabled={disabled||busy} onClick={()=>void download(file)}>{file.filename}</button>:
      <span>{file.filename} · 未完成</span>}
    {remove&&<button type="button" disabled={disabled||busy} onClick={()=>remove(file)}>移除</button>}
  </li>)}</ul>}{error&&<p role="alert">{error}</p>}</>;
}

function ApplicationForm({data,userId,selectedId}:{data:CertificateWorkspace;userId:string;selectedId?:string}){
  const navigate=useNavigate();
  const row=data.rows.find(item=>item.id===selectedId);
  const [saved,setSaved]=useState<CertificateAwardRow|undefined>(row);
  const [draft,setDraft]=useState(()=>fromRow(row));
  const [picked,setPicked]=useState<CertificateCatalogRow|null>(()=>row?{code:row.certificate_code,name:row.name,level:row.level,issuer:row.issuer}:null);
  const [files,setFiles]=useState(data.files);
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
  const [search,setSearch]=useState(false),[confirm,setConfirm]=useState<'submit'|'add_award'|null>(null);
  const [today]=useState(()=>localDate.format(new Date()));
  const [uploadPending,setUploadPending]=useState(false);
  const [uploadOpen,setUploadOpen]=useState(false),[chosen,setChosen]=useState<File|null>(null);
  const active=useRef<AbortController|null>(null);
  const pending=useRef<Partial<Record<StudentAwardOp,Pending>>>({});
  const upload=useRef<{file:File;receipt:CertificateAwardReceipt;type:CertificateProof['contentType']}|null>(null);
  useEffect(()=>()=>active.current?.abort(),[]);
  const locked=saved!==undefined&&!['draft','needs_documents'].includes(saved.status);
  const readyForAward=Boolean(data.payout);
  const attachments=files.filter(file=>file.attached).length;
  const history=saved&&!data.rows.some(item=>item.id===saved.id)?[saved,...data.rows]:data.rows;
  const needsPayout=draft.wants===true&&!readyForAward;
  const valid=data.identity!==null&&/^\d{1,12}$/u.test(draft.code)&&/^\d{4}-\d{2}-\d{2}$/u.test(draft.obtained)&&
    /^[+0-9 ()-]{3,40}$/u.test(draft.phone)&&/\d/u.test(draft.phone)&&/^[A-Za-z0-9-]{0,8}$/u.test(draft.teacher)&&draft.wants!==null;
  function field<K extends keyof Draft>(key:K,value:Draft[K]){setDraft(previous=>({...previous,[key]:value}));}
  function choose(row:CertificateCatalogRow){setPicked(row);field('code',row.code);setSearch(false);}
  async function perform(op:StudentAwardOp,payload:object,signal:AbortSignal){
    const key=JSON.stringify(payload);
    let receipt=pending.current[op];
    if(receipt?.key!==key){receipt={key,request_id:crypto.randomUUID()};pending.current[op]=receipt;}
    const result=await changeCertificateAward(userId,op,{...payload,request_id:receipt.request_id},signal);
    delete pending.current[op];
    return result;
  }
  async function run(action:(signal:AbortSignal)=>Promise<void>){
    if(active.current)return;
    const controller=new AbortController();active.current=controller;
    const signal=AbortSignal.any([controller.signal,AbortSignal.timeout(75000)]);
    setBusy(true);setError('');setMessage('');
    try{await action(signal);}
    catch(reason){if(!controller.signal.aborted)setError(reason instanceof Error?reason.message:'證照資料暫時無法處理。');}
    finally{active.current=null;if(!controller.signal.aborted)setBusy(false);}
  }
  async function save(signal:AbortSignal){
    if(!valid||!picked||draft.wants===null)throw new Error('請先填寫必要欄位。');
    if(saved&&JSON.stringify(fromRow(saved))===JSON.stringify(draft))return {id:saved.id,version:saved.version};
    const result=await perform('draft',{id:saved?.id??null,expected_version:saved?.version??0,certificate_code:draft.code,
      obtained_on:draft.obtained,phone:draft.phone,teacher_code:draft.teacher,wants_award:draft.wants},signal);
    const savedRow:CertificateAwardRow={
      id:result.id,version:result.version,status:result.status??'draft',certificate_code:picked.code,name:picked.name,issuer:picked.issuer,level:picked.level,
      obtained_on:draft.obtained,phone:draft.phone,teacher_code:draft.teacher,wants_award:draft.wants,
      application_fee:saved?.application_fee??null,award_amount:saved?.award_amount??null,review_note:saved?.review_note??'',updated_at:new Date().toISOString(),
    };
    setSaved(savedRow);
    return {id:result.id,version:result.version};
  }
  async function uploadProof(signal:AbortSignal){
    if(!chosen)return;
    const type=await proofFileType(chosen);
    const {id,version}=await save(signal);
    const selector={id,expected_version:version};
    const current=upload.current?.file===chosen?upload.current:{
      file:chosen,type,receipt:await perform('reserve',{...selector,filename:chosen.name,size_bytes:chosen.size,content_type:type},signal),
    };
    upload.current=current;setUploadPending(true);
    const {fileId,path}=current.receipt;
    if(!fileId||!path)throw new Error('無法取得檔案上傳位置。');
    await uploadCertificateProof(userId,id,current.receipt,chosen,type,signal);
    await perform('attach',{...selector,file_id:fileId},signal);
    setFiles(values=>[...values.filter(file=>file.id!==fileId),{id:fileId,path,filename:chosen.name,sizeBytes:chosen.size,contentType:type,attached:true}]);
    upload.current=null;setUploadPending(false);setChosen(null);setUploadOpen(false);
    setMessage('證明文件已上傳。');
    if(!selectedId)navigate(certificateAwardPath+'/record/'+id,{replace:true});
  }
  async function discard(file:CertificateProof,signal:AbortSignal){
    if(!saved)return;
    const selector={id:saved.id,expected_version:saved.version,file_id:file.id};
    if(file.attached){
      await perform('detach',selector,signal);
      setFiles(items=>items.map(item=>item.id===file.id?{...item,attached:false}:item));
    }
    await removeCertificateProof(userId,file,signal);
    await perform('discard',selector,signal);
    setFiles(items=>items.filter(item=>item.id!==file.id));setMessage('檔案已移除。');
  }
  function openConfirmation(event:FormEvent){
    event.preventDefault();
    if(valid&&!locked&&!needsPayout&&attachments>0)setConfirm('submit');
  }
  async function submit(signal:AbortSignal){
    if(!confirm||!saved)return;
    const selector=confirm==='submit'?await save(signal):{id:saved.id,version:saved.version};
    const receipt=await perform(confirm,{id:selector.id,expected_version:selector.version},signal);
    setSaved(current=>current&&({...current,version:receipt.version,status:receipt.status??'submitted',wants_award:confirm==='add_award'||current.wants_award}));
    setConfirm(null);setMessage('證照資料已送出。');
  }
  function reset(){
    if(upload.current){setError('請先完成或移除尚未完成的上傳。');return;}
    setDraft(fromRow(saved));
    setPicked(saved?{code:saved.certificate_code,name:saved.name,level:saved.level,issuer:saved.issuer}:null);
    setMessage('');setError('');
  }
  return <>
    {!data.identity&&<p className="certificate-alert" role="status">目前沒有學生基本資料。請由管理員先建立學生基本資料。</p>}
    <form className="certificate-entry" onSubmit={openConfirmation}>
      <fieldset disabled={busy||locked} className="certificate-fields">
        <legend>學生證照資訊</legend>
        <div className="certificate-row"><strong>學號</strong><div className="certificate-inline">
          <input aria-label="學號" readOnly value={data.identity?.studentNumber??''}/>
          <input aria-label="姓名" readOnly value={data.identity?.name??''}/>
          <input aria-label="學籍狀態" readOnly value=""/>
        </div></div>
        <label className="certificate-row"><strong>手機/電話</strong><input required type="tel" maxLength={40} value={draft.phone} onChange={event=>field('phone',event.target.value)}/></label>
        <div className="certificate-row"><strong>證照資訊</strong><div>
          <button type="button" className="certificate-query" disabled={files.length>0||uploadPending} onClick={()=>setSearch(true)}>搜尋證照名稱</button>
          <div><input aria-label="證照名稱" readOnly value={picked?.name??''} className="certificate-wide"/></div>
          <div className="certificate-inline"><input aria-label="證照級數" readOnly value={picked?.level??''}/><input aria-label="發照單位" className="certificate-issuer" readOnly value={picked?.issuer??''}/><input aria-label="證照編號" readOnly value={picked?.code??''}/></div>
        </div></div>
        <label className="certificate-row"><strong>證照取得日期</strong><input required type="date" min="1950-01-01" max={today}
          disabled={files.length>0||uploadPending} value={draft.obtained} onChange={event=>field('obtained',event.target.value)}/></label>
        <div className="certificate-row"><strong>附件數目</strong><div className="certificate-inline">
          <input aria-label="附件數目" readOnly value={attachments}/>
          <button type="button" className="certificate-add" disabled={!valid||attachments>=5} onClick={()=>setUploadOpen(true)}>上傳證照證明文件</button><span>（JPG / PDF）</span>
        </div></div>
        <label className="certificate-row"><strong>證照輔導老師</strong><input aria-label="教師代碼" maxLength={8} value={draft.teacher} onChange={event=>field('teacher',event.target.value)}/></label>
        <div className="certificate-row"><strong id="certificate-incentive-label">證照獎助金</strong>
          <div role="group" aria-labelledby="certificate-incentive-label" className="certificate-inline">
            <label><input name="incentive" type="radio" checked={draft.wants===true} onChange={()=>field('wants',true)}/> Y-申請證照獎助金</label>
            <label><input name="incentive" type="radio" checked={draft.wants===false} onChange={()=>field('wants',false)}/> N-不申請</label>
          </div>
        </div>
        <label className="certificate-row"><strong>銀行名稱</strong><input readOnly value={data.payout?.bank??''}/></label>
        <label className="certificate-row"><strong>分行名稱</strong><input readOnly value={data.payout?.branch??''}/></label>
        <label className="certificate-row"><strong>帳號</strong><input readOnly value={data.payout?'••••'+data.payout.account_last_four:''}/></label>
        <label className="certificate-row"><strong>帳號備註</strong><input readOnly value={data.payout?.note??''}/></label>
      </fieldset>
      <fieldset className="certificate-fields certificate-review">
        <legend>研發處職發中心</legend>
        <label className="certificate-row"><strong>證照報名費</strong><input readOnly value={saved?.application_fee??''}/></label>
        <label className="certificate-row"><strong>獎補助金額</strong><input readOnly value={saved?.award_amount??''}/></label>
        <label className="certificate-row"><strong>審核狀態</strong><input readOnly value={saved?status(saved):''}/></label>
        <label className="certificate-row"><strong>審核意見</strong><textarea readOnly value={saved?.review_note??''}/></label>
      </fieldset>
      <CertificateProofList userId={userId} files={files} disabled={busy} remove={locked?undefined:file=>void run(signal=>discard(file,signal))}/>
      {needsPayout&&<p className="certificate-alert">申請獎助金前，需由管理員登錄已核對的匯款資料。</p>}
      <div className="certificate-buttons certificate-entry-actions">
        <Link className="certificate-query" to={certificateAwardPath+'#certificate-history'}>查詢</Link>
        {!locked&&<button type="submit" className="certificate-add" disabled={busy||!valid||needsPayout||attachments===0}>新增</button>}
        <button type="button" disabled={busy} onClick={reset}>取消</button>
        {!locked&&<button type="button" className="certificate-add" disabled={busy||!valid||attachments>=5} onClick={()=>setUploadOpen(true)}>上傳證照證明文件</button>}
        {saved&&!saved.wants_award&&['approved','submitted'].includes(saved.status)&&<button type="button" className="certificate-add"
          disabled={busy||!readyForAward} onClick={()=>setConfirm('add_award')}>追加申請獎助金</button>}
      </div>
      {message&&<p role="status">{message}</p>}
      {error&&!confirm&&!uploadOpen&&<p role="alert">{error}</p>}
    </form>
    <Dialog open={search} onOpenChange={setSearch}>
      <DialogContent className="certificate-dialog"><DialogTitle>證照名稱查詢</DialogTitle>
        <DialogDescription>依編號、名稱、級數或發照單位篩選。</DialogDescription>
        <CertificateCatalogForm userId={userId} select={choose} compact/>
      </DialogContent>
    </Dialog>
    <Dialog open={uploadOpen} onOpenChange={open=>{if(!busy&&(!upload.current||open))setUploadOpen(open);}}>
      <DialogContent className="certificate-dialog"><DialogTitle>上傳證照證明文件</DialogTitle>
        <DialogDescription>選擇清楚的 JPG 或 PDF，每個檔案最多 5 MiB。</DialogDescription>
        <label>證明文件 <input type="file" accept=".jpg,.jpeg,.pdf,image/jpeg,application/pdf" disabled={busy||uploadPending}
          onChange={event=>setChosen(event.target.files?.[0]??null)}/></label>
        {error&&<p role="alert">{error}</p>}
        <div className="certificate-buttons"><button type="button" className="certificate-add" disabled={busy||!chosen}
          onClick={()=>void run(uploadProof)}>{busy?'上傳中…':'上傳'}</button>
          {uploadPending&&<button type="button" disabled={busy} onClick={()=>void run(async signal=>{
            const pendingUpload=upload.current;
            if(!pendingUpload?.receipt.fileId||!pendingUpload.receipt.path)return;
            await discard({id:pendingUpload.receipt.fileId,path:pendingUpload.receipt.path,filename:pendingUpload.file.name,
              sizeBytes:pendingUpload.file.size,contentType:pendingUpload.type,attached:false},signal);
            upload.current=null;setUploadPending(false);setChosen(null);setUploadOpen(false);
          })}>移除未完成的上傳</button>}
        </div>
      </DialogContent>
    </Dialog>
    <Dialog open={Boolean(confirm)} onOpenChange={open=>{if(!open&&!busy)setConfirm(null);}}>
      <DialogContent className="certificate-dialog"><DialogTitle>確認送出證照資料</DialogTitle>
        <DialogDescription>送出後會保存證照資料與證明文件，供 stu.best 管理員審查。</DialogDescription>
        {error&&<p role="alert">{error}</p>}
        <div className="certificate-buttons"><button type="button" className="certificate-add" disabled={busy}
          onClick={()=>void run(submit)}>{busy?'送出中…':'確認送出'}</button></div>
      </DialogContent>
    </Dialog>
    <section className="certificate-notes"><h2>操作說明</h2>
      <ol><li>選擇證照並填寫取得日期。</li><li>上傳完整證照證明。</li><li>需要獎助金時勾選申請，再送出。</li></ol>
    </section>
    <div className="certificate-scroll" id="certificate-history" tabIndex={0} role="region" aria-label="證照記錄">
      <table className="certificate-table"><thead><tr>{['學號','姓名','證照名稱','生效日期','審核狀態','獎助金金額','檢視'].map(label=><th key={label} scope="col">{label}</th>)}</tr></thead>
      <tbody>{history.map(item=>{
        const current=saved?.id===item.id?saved:item;
        return <tr key={current.id}><td>{data.identity?.studentNumber}</td><td>{data.identity?.name}</td><td>{current.name}</td><td>{current.obtained_on}</td>
          <td>{status(current)}</td><td>{current.award_amount??'—'}</td><td><Link to={certificateAwardPath+'/record/'+current.id}>檢視 {current.name}</Link></td></tr>;
      })}
      {!history.length&&<tr><td colSpan={7}>查無證照記錄。</td></tr>}</tbody></table>
    </div>
  </>;
}

function Application({userId,id}:{userId:string;id?:string}){
  const [result,setResult]=useState<CertificateWorkspace|'error'|null>(null),[attempt,setAttempt]=useState(0);
  useEffect(()=>{
    const controller=new AbortController();
    void loadCertificateWorkspace(userId,controller.signal,id).then(value=>{if(!controller.signal.aborted)setResult(value);},
      ()=>{if(!controller.signal.aborted)setResult('error');});
    return ()=>controller.abort();
  },[userId,id,attempt]);
  if(!result)return <p role="status">載入證照資料中…</p>;
  if(result==='error')return <p role="alert">找不到證照資料。 <button type="button" onClick={()=>{setResult(null);setAttempt(n=>n+1);}}>重試</button></p>;
  return <ApplicationForm data={result} userId={userId} selectedId={id}/>;
}
export function CertificateAwardWorkspace({userId,view,id}:{userId:string;view:View;id?:string}){
  const title=view==='catalog'?'證照名稱查詢作業':'學生證照記錄填表作業';
  useEffect(()=>{document.title=title;},[title]);
  return <main className="certificate-awards" lang="zh-Hant">
    <div className="certificate-frame">
      <header>
        <div className="certificate-banner"><span>學生證照系統</span><span>Shu-Te University</span></div>
        <div className="certificate-heading"><img src="/stu-reference/certificate-award/heading.png" width="42" height="42" alt=""/><h1>{title}</h1></div>
        <nav aria-label="學生證照系統">
          <Link to={certificateAwardPath+'/overview'}>系統簡介</Link><Link to={certificateAwardPath}>證照記錄</Link>
          <Link to={certificateAwardPath+'/catalog'}>證照名稱</Link>
        </nav>
      </header>
      <div className="certificate-content">
        {view==='catalog'?<CertificateCatalogForm userId={userId}/>:<>
          <section className="certificate-intro"><h2>獎助金申請操作步驟</h2>
            <ol><li>填寫表格資料。</li><li>上傳掃描或完整拍攝的證照。</li><li>選擇是否申請獎助金。</li><li>按新增，確認送出。</li></ol>
            <p>已登錄的證照可從證照記錄檢視。若原先未申請獎助金，可由記錄追加申請。</p>
            <p>獎助金申請需有已核對的匯款資料。職發中心 07-6158000 分機 1713。</p>
          </section>
          <Application key={id??'entry'} userId={userId} id={id}/>
        </>}
      </div>
    </div>
    <footer><Link to="/">學校首頁</Link> · <Link to="/school-affairs">校務資訊系統</Link></footer>
  </main>;
}
