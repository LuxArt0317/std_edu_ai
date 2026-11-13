import {useEffect, useRef, useState, type FormEvent} from 'react';
import {Link} from 'react-router';
import {Search, SquarePen} from 'lucide-react';
import {ExchangeGrantError, loadExchangeGrantDrafts, saveExchangeGrantDraft} from '@/services/exchangeGrant';
import type {ExchangeGrantAction, ExchangeGrantRecord} from '../../../../server/exchangeGrantContract.js';
import {exchangeGrantPath} from './exchangeGrantReference';

const fields = [
  ['department','系所別',160], ['activity_category','活動類別',160], ['activity_name','活動名稱',250],
  ['activity_location','活動地點',250], ['topic','題目',400], ['region','活動區域',160],
] as const;
const reportHeadings = ['學號','姓名','活動名稱','心得報告','檢視'];
const draftHeadings = ['申請人','學號','活動類別','活動名稱','開始日期','結束日期','補助金額','參與學生補助金額','簽核狀態','檢視'];
const formatDate = (date: string) => date.replaceAll('-', '/');

export function ExchangeGrantRecords({userId, displayName, reports}: {
  userId:string; displayName:string; reports:boolean;
}) {
  const [attempt, setAttempt] = useState(0);
  const [records, setRecords] = useState<ExchangeGrantRecord[] | null>(null);
  const [selected, setSelected] = useState<ExchangeGrantRecord | null>(null);
  const [formVersion, setFormVersion] = useState(0);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<ExchangeGrantAction | null>(null);
  const [stale, setStale] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const lifetime = useRef<AbortController | null>(null);
  const sending = useRef(false);
  useEffect(() => {
    const controller = new AbortController();
    lifetime.current = controller;
    void loadExchangeGrantDrafts(userId, controller.signal).then(result => {
      if (!controller.signal.aborted) setRecords(result.records);
    }).catch(() => {
      if (!controller.signal.aborted) setError('暫時無法載入紀錄。');
    });
    return () => controller.abort();
  }, [userId, attempt]);

  function choose(record: ExchangeGrantRecord | null) {
    setSelected(record);
    setFormVersion(value => value + 1);
    setConfirmDelete(false);
    setError('');
    setMessage('');
  }
  function reload() {
    choose(null);
    setRecords(null);
    setStale(false);
    setAttempt(value => value + 1);
  }
  const envelope = () => ({id:selected?.id ?? crypto.randomUUID(), request_id:crypto.randomUUID(), expected_version:selected?.version ?? 0});

  async function save(action: ExchangeGrantAction) {
    const controller = lifetime.current;
    if (!controller || controller.signal.aborted || sending.current || !records || stale) return;
    sending.current = true;
    setPending(action);
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const receipt = await saveExchangeGrantDraft(userId, action, controller.signal);
      controller.signal.throwIfAborted();
      setPending(null);
      reload();
      setMessage(receipt.kind === 'delete_exchange_grant_draft' ? '已刪除草稿。' : reports ? '已儲存心得報告。' : '已儲存草稿。');
    } catch (reason) {
      if (controller.signal.aborted) return;
      if (reason instanceof ExchangeGrantError && [400,401,403,409].includes(reason.status)) {
        setPending(null);
        if ([401,403].includes(reason.status)) setRecords(null);
        if (reason.status === 409) setStale(true);
        setError(reason.message);
      } else setError('暫時無法確認操作結果，請重試原操作。');
    } finally {
      sending.current = false;
      if (!controller.signal.aborted) setBusy(false);
    }
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || confirmDelete || !records || (reports && !selected)) return;
    const data = new FormData(event.currentTarget);
    const value = (key: string) => String(data.get(key) ?? '');
    if (reports) {
      void save({kind:'save_exchange_grant_report', payload:{...envelope(),report_text:value('report_text')}});
      return;
    }
    if (!selected && records.length >= 100) return;
    void save({kind:'save_exchange_grant_draft', payload:{...envelope(), department:value('department'),
      activity_category:value('activity_category'), starts_on:value('starts_on'), ends_on:value('ends_on'),
      activity_name:value('activity_name'), activity_location:value('activity_location'), topic:value('topic'),
      region:value('region'), lodging:value('lodging') === 'yes'}});
  }
  const locked = !records || busy || Boolean(pending) || stale;
  const tableColumns = reports ? reportHeadings : draftHeadings;
  const textInput = ([name,label,limit]: typeof fields[number]) => <div className="exchange-grant-field" key={name}>
    <label htmlFor={`grant-${name}`}>{label}</label>
    <input id={`grant-${name}`} name={name} required maxLength={limit} defaultValue={selected?.[name] ?? ''} />
  </div>;
  return <>
    <h1 className="exchange-grant-report-title"><SquarePen size={18} aria-hidden="true" /> {reports ? '心得報告填寫作業' : '研討會或校外參展助學金申請作業'}</h1>
    {!reports && <p className="exchange-grant-local-label">申請草稿儲存在您的 stu.best 帳戶。</p>}
    <form key={formVersion} className="exchange-grant-record-form" onSubmit={submit}>
      <fieldset disabled={locked || confirmDelete}>
        {reports ? <>
          <div className="exchange-grant-field"><label htmlFor="grant-report-number">申請編號</label><div className="exchange-grant-two-inputs">
            <input id="grant-report-number" value={selected ? `草稿 ${selected.id.slice(0,8)}` : ''} readOnly />
            <input aria-label="活動名稱" value={selected?.activity_name ?? ''} readOnly />
          </div></div>
          <div className="exchange-grant-field"><label htmlFor="grant-report-student">學生</label><div className="exchange-grant-two-inputs">
            <input id="grant-report-student" value="" readOnly />
            <input aria-label="姓名" value={selected ? displayName : ''} readOnly />
          </div></div>
          <div className="exchange-grant-field"><label htmlFor="grant-report-body">心得報告</label>
            <textarea id="grant-report-body" name="report_text" defaultValue={selected?.report_text ?? ''} required maxLength={5000} readOnly={!selected} />
          </div>
        </> : <>
          <div className="exchange-grant-field"><label htmlFor="grant-applicant">申請人</label><div className="exchange-grant-two-inputs">
            <input id="grant-applicant" value="" readOnly /><input aria-label="姓名" value={displayName} readOnly />
          </div></div>
          {fields.slice(0,2).map(textInput)}
          <div className="exchange-grant-field"><span>活動期間</span><div className="exchange-grant-dates">
            <label>起 <input type="date" name="starts_on" min="1900-01-01" max="9999-12-31" defaultValue={selected?.starts_on ?? ''} required /></label>
            <label>迄 <input type="date" name="ends_on" min="1900-01-01" max="9999-12-31" defaultValue={selected?.ends_on ?? ''} required /></label>
          </div></div>
          {fields.slice(2).map(textInput)}
          <div className="exchange-grant-field"><span id="grant-lodging-label">住宿</span><div className="exchange-grant-radio" role="group" aria-labelledby="grant-lodging-label">
            <label><input name="lodging" type="radio" value="yes" required defaultChecked={selected?.lodging === true} /> Y-有住宿</label>
            <label><input name="lodging" type="radio" value="no" required defaultChecked={selected?.lodging === false} /> N-無住宿</label>
          </div></div>
        </>}
        <div className="exchange-grant-record-actions">
          {!reports && !selected && <button className="exchange-grant-button exchange-grant-blue" type="button" onClick={reload}><Search size={13} aria-hidden="true" /> 查詢</button>}
          {(!reports || selected) && <button className="exchange-grant-button exchange-grant-save" type="submit" disabled={!reports && !selected && records?.length === 100}>{reports ? '存檔' : '儲存草稿'}</button>}
          {!reports && selected && <button className="exchange-grant-button exchange-grant-delete" type="button" onClick={() => setConfirmDelete(true)}>刪除</button>}
          <button className="exchange-grant-button" type="button" onClick={() => choose(null)}>取消</button>
        </div>
      </fieldset>
    </form>
    {confirmDelete && selected && <div className="exchange-grant-status"><p>確定刪除此草稿與心得報告？</p>
      <button className="exchange-grant-button exchange-grant-delete" disabled={locked} type="button" onClick={() => void save({kind:'delete_exchange_grant_draft',payload:envelope()})}>確認刪除</button>{' '}
      <button className="exchange-grant-button" disabled={locked} type="button" onClick={() => setConfirmDelete(false)}>返回</button>
    </div>}
    <div className="exchange-grant-status">
      {!records && !error && <p role="status">載入中…</p>}
      {error && <p role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}
      {pending && !busy && <button className="exchange-grant-button" type="button" onClick={() => void save(pending)}>重試原操作</button>}
      {!pending && (stale || (!records && error)) && <button className="exchange-grant-button" type="button" onClick={reload}>重新載入</button>}
    </div>
    <div className="exchange-grant-table-scroll" tabIndex={0} role="region" aria-label={reports ? '心得報告紀錄' : '申請草稿紀錄'}>
      <table className="exchange-grant-report-table"><thead><tr>{tableColumns.map(heading => <th key={heading} scope="col">{heading}</th>)}</tr></thead>
        <tbody>{records?.map(record => <tr key={record.id}>
          {reports ? <><td /><td>{displayName}</td><td>{record.activity_name}</td><td>{record.report_text}</td></>
            : <><td>{displayName}</td><td /><td>{record.activity_category}</td><td>{record.activity_name}</td>
              <td>{formatDate(record.starts_on)}</td><td>{formatDate(record.ends_on)}</td><td>—</td><td>—</td><td>草稿</td></>}
          <td><button type="button" className="exchange-grant-view" aria-label={`檢視 ${record.activity_name}`} disabled={locked || confirmDelete} onClick={() => choose(record)}><Search size={16} aria-hidden="true" /></button></td>
        </tr>)}</tbody>
      </table>
    </div>
    {reports ? <section className="exchange-grant-report-help"><h2>ℹ 說明</h2><ol><li>輸入維護畫面欄位標示說明。<ul><li>可輸入查詢條件之欄位</li><li>輸入資料時必填欄位</li></ul></li></ol></section>
      : <p className="exchange-grant-back"><Link to={`${exchangeGrantPath}/conference`}>返回作業說明</Link></p>}
  </>;
}
