import {useEffect,useRef,useState,type FormEvent} from 'react';
import {Link} from 'react-router';
import {Dialog,DialogContent,DialogDescription,DialogTitle} from '@/components/ui/dialog';
import {ProgramRegistrationError,readProgramRegistrations,saveProgramRegistration} from '@/services/programRegistration';
import {programCode,programRegistrationPath as root,type ProgramRegistration,type ProgramRegistrationAction} from '../../../../server/programRegistrationContract.js';
import {readPublishedInterdisciplinaryPrograms} from '@/services/interdisciplinaryPrograms';
import type {InterdisciplinaryProgram} from '../../../../server/interdisciplinaryPrograms.js';
import {interdisciplinaryProgramsPath} from './studentServices.js';
import './interdisciplinaryPrograms.css';
import './programRegistration.css';

const title = '跨院系學分學程登記系統';
const columns = ['學程代碼','學分學程名稱','申請學年','申請學期','修習狀況','放棄學年','放棄學期','完成學年','完成學期','檢視完成進度'];

export function ProgramRegistrationWorkspace({userId,view,code}: {userId:string;view:'list'|'choose'|'progress';code?:string}) {
  const [records,setRecords] = useState<ProgramRegistration[]>();
  const [programs,setPrograms] = useState<InterdisciplinaryProgram[]>();
  const [attempt,setAttempt] = useState(0);
  const [error,setError] = useState('');
  const [loadFailed,setLoadFailed] = useState(false);
  const [pending,setPending] = useState<ProgramRegistrationAction>();
  const [busy,setBusy] = useState(false);
  const [status,setStatus] = useState('');
  const loading = useRef<AbortController|null>(null);
  const saving = useRef(false);

  useEffect(()=>{
    const request = new AbortController();
    loading.current = request;
    void Promise.all([readProgramRegistrations(userId,request.signal),readPublishedInterdisciplinaryPrograms(request.signal)]).then(([rows,catalog])=>{
      if (!request.signal.aborted) {setRecords(rows);setPrograms(catalog);}
    }).catch(()=>{
      if (!request.signal.aborted) {setLoadFailed(true);setError('暫時無法載入學程登記。');}
    });
    return ()=>request.abort();
  },[userId,attempt]);

  function reload() {
    setLoadFailed(false);
    setRecords(undefined);
    setAttempt(value=>value+1);
  }

  async function confirm() {
    const request = loading.current;
    if (!pending || !request || request.signal.aborted || saving.current) return;
    saving.current = true;
    setBusy(true);
    setError('');
    try {
      await saveProgramRegistration(userId,pending,request.signal);
      if (request.signal.aborted) return;
      setPending(undefined);
      setStatus(pending.operation==='register'?'已儲存站內學程登記。':'已放棄站內學程登記。');
      reload();
    } catch (reason) {
      if (request.signal.aborted) return;
      if (reason instanceof ProgramRegistrationError && [400,401,403,409].includes(reason.status)) {
        setPending(undefined);
        reload();
        setError(reason.status===409?'登記已變更，請確認更新後的紀錄。':'無法儲存這筆登記，請檢查帳戶與學程。');
      } else {
        setError('暫時無法確認儲存結果。重試時會沿用相同請求。');
      }
    } finally {
      saving.current=false;
      if (!request.signal.aborted) setBusy(false);
    }
  }

  function register(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const selected = new FormData(event.currentTarget).get('program');
    if (programCode(selected) && programs?.some(item=>item.code===selected) && !records?.some(row=>row.program_code===selected)) {
      setError('');
      setPending({operation:'register',program_code:selected,expected_version:0,request_id:crypto.randomUUID()});
    }
  }

  const names = new Map(programs?.map(program=>[program.code,program]));
  const available = programs?.filter(program=>!records?.some(row=>row.program_code===program.code)) ?? [];
  const record = records?.find(row=>row.program_code===code);
  const registered = view==='choose' && status && !pending;

  return <div className="interdisciplinary-programs program-registration" lang="zh-Hant">
    <main>
      <header>
        <div className="interdisciplinary-banner" lang="en"><span>Campus Information Services</span><span>Shu-Te University</span></div>
        <h1><img src="/stu-reference/interdisciplinary/logo.png" width="55" height="55" alt="" />{title}</h1>
      </header>
      <div className="interdisciplinary-content">
        <nav aria-label="頁面位置"><Link to={root}>Home</Link></nav>
        <h2>{view==='choose'?'選擇學分學程':view==='progress'?'檢視完成進度':'我已登記的學分學程如下'}</h2>
        {error && !pending && <p role="alert">{error} {loadFailed && <button type="button" onClick={()=>{setError('');reload();}}>重試</button>}</p>}
        {!records && !loadFailed && <p role="status">載入學程登記…</p>}
        {status && <p role="status">{status}</p>}
        {records && view==='list' && <div className="interdisciplinary-table" role="region" tabIndex={0} aria-label="已登記的學分學程">
          <table>
            <caption>已登記的學分學程如下</caption>
            <thead><tr>{columns.map(column=><th key={column} scope="col">{column}</th>)}</tr></thead>
            <tbody>{records.map(row=><tr key={row.program_code}>
              <th scope="row">{row.program_code}</th><td>{names.get(row.program_code)?.name ?? row.program_code}</td>
              <td>{row.academic_year}</td><td>{row.semester}</td>
              <td>{row.completed_year?'已完成':row.withdrawn_year?'已放棄':'修習中'}</td>
              <td>{row.withdrawn_year}</td><td>{row.withdrawn_semester}</td><td>{row.completed_year}</td><td>{row.completed_semester}</td>
              <td><Link to={root+'/progress/'+row.program_code}>檢視</Link></td>
            </tr>)}</tbody>
            <tfoot><tr><td colSpan={columns.length}><Link to={root+'/register'}>我還要登記其他學程</Link></td></tr></tfoot>
          </table>
        </div>}
        {records && view==='choose' && <>
          {registered ? null : available.length ? <form onSubmit={register} className="program-registration-form">
            <label htmlFor="registration-program">學分學程名稱</label>
            <select id="registration-program" name="program" required defaultValue="">
              <option value="" disabled>請選擇學程</option>
              {available.map(program=><option key={program.code} value={program.code}>{program.code} · {program.name}</option>)}
            </select>
            <button type="submit">登記</button>
          </form> : <p role="status">目前沒有可新增的學程。</p>}
          <p className="interdisciplinary-links"><Link to={interdisciplinaryProgramsPath}>學分學程查詢</Link> · <Link to={root}>返回登記紀錄</Link></p>
        </>}
        {records && view==='progress' && (record ? <>
          <h3>{record.program_code} · {names.get(record.program_code)?.name}</h3>
          <p>{record.completed_year ? `完成學年與學期：${record.completed_year} / ${record.completed_semester}`
            : record.withdrawn_year ? `放棄學年與學期：${record.withdrawn_year} / ${record.withdrawn_semester}` : '目前沒有完成學程的紀錄。'}</p>
          <p className="interdisciplinary-links"><Link to={names.get(record.program_code)?.document_sha256
            ? interdisciplinaryProgramsPath+'/program/'+record.program_code : interdisciplinaryProgramsPath}>查看學程規定</Link></p>
          {!record.completed_year && !record.withdrawn_year && <button type="button" className="program-registration-button" onClick={()=>{
            setError('');
            setPending({operation:'withdraw',program_code:record.program_code,expected_version:record.version,request_id:crypto.randomUUID()});
          }}>放棄登記</button>}
        </> : <p role="status">找不到這筆學程登記。</p>)}
      </div>
    </main>
    <footer><Link to="/school-affairs/signed-out">登出</Link> <Link to={root}>系統首頁</Link> <Link to="/school-affairs">校務資訊系統</Link> <Link to="/">學校首頁</Link> <Link to="/student-sso">mySTU</Link></footer>
    {pending && <Dialog open onOpenChange={open=>{if (!open&&!busy) {setPending(undefined);setError('');}}}>
      <DialogContent showCloseButton={!busy} onEscapeKeyDown={event=>{if(busy)event.preventDefault();}} onInteractOutside={event=>{if(busy)event.preventDefault();}}>
        <DialogTitle>{pending.operation==='register'?'確認登記學程':'確認放棄學程'}</DialogTitle>
        <DialogDescription>{pending.program_code} · {names.get(pending.program_code)?.name}。此操作儲存在您的 stu.best 帳戶。</DialogDescription>
        {error && <p role="alert">{error}</p>}
        <button type="button" className="program-registration-button" disabled={busy} onClick={()=>void confirm()}>{busy?'處理中…':error?'重試':'確定'}</button>
      </DialogContent>
    </Dialog>}
  </div>;
}
