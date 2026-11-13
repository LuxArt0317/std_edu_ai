import {useEffect, useRef, useState, type FormEvent} from 'react';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Textarea} from '@/components/ui/textarea';
import {FeeRemissionRequestError, loadFeeRemissionHistory, saveFeeRemissionHistory} from '@/services/feeRemission';
import {
  feeRemissionFields, feeRemissionMaxRows, type FeeRemissionAction,
  type FeeRemissionCell, type FeeRemissionHistory, type FeeRemissionRecord,
} from '../../../../server/feeRemissionContract.js';

export function FeeRemissionManager({managerId, userId, parentBusy, onPendingChange}: {
  managerId: string; userId: string; parentBusy: boolean; onPendingChange: (pending: boolean) => void;
}) {
  const [history, setHistory] = useState<FeeRemissionHistory | null>(null);
  const [editing, setEditing] = useState<FeeRemissionRecord | null>(null);
  const [formVersion, setFormVersion] = useState(0);
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<FeeRemissionAction | null>(null);
  const [conflict, setConflict] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const lifetime = useRef<AbortController | null>(null);
  const writing = useRef(false);

  useEffect(() => {
    const controller = new AbortController();
    lifetime.current = controller;
    void loadFeeRemissionHistory(managerId, controller.signal, userId).then(result => {
      if (!controller.signal.aborted) setHistory(result);
    }).catch(() => {
      if (!controller.signal.aborted) setError('暫時無法載入學雜費減免紀錄。');
    });
    return () => controller.abort();
  }, [managerId, userId, attempt]);

  useEffect(() => () => onPendingChange(false), [onPendingChange]);

  function select(row: FeeRemissionRecord | null) {
    setEditing(row);
    setConfirmDelete(false);
    setFormVersion(value => value + 1);
    setError('');
    setMessage('');
  }

  function reload() {
    select(null);
    setHistory(null);
    setConflict(false);
    setAttempt(value => value + 1);
  }

  async function perform(action: FeeRemissionAction) {
    const controller = lifetime.current;
    if (!controller || controller.signal.aborted || writing.current || !history || conflict || parentBusy) return;
    writing.current = true;
    setPending(action);
    onPendingChange(true);
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const receipt = await saveFeeRemissionHistory(managerId, action, controller.signal);
      controller.signal.throwIfAborted();
      setPending(null);
      onPendingChange(false);
      select(null);
      // A confirmed write is never retried just because the subsequent read failed.
      setHistory(null);
      setAttempt(value => value + 1);
      setMessage(receipt.kind === 'save_fee_remission' ? '已儲存減免紀錄。' : '已刪除減免紀錄。');
    } catch (reason) {
      if (controller.signal.aborted) return;
      if (reason instanceof FeeRemissionRequestError) {
        if ([400, 401, 403, 409].includes(reason.status)) {
          setPending(null);
          onPendingChange(false);
        }
        if ([401, 403].includes(reason.status)) setHistory(null);
        if (reason.status === 409) setConflict(true);
        setError(reason.message);
      } else {
        setError('暫時無法確認操作結果，請重試原操作。');
      }
    } finally {
      writing.current = false;
      if (!controller.signal.aborted) setBusy(false);
    }
  }

  function envelope() {
    return {
      id: editing?.id ?? crypto.randomUUID(), user_id: userId,
      request_id: crypto.randomUUID(), expected_version: editing?.version ?? 0,
    };
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || confirmDelete || (!editing && (history?.records.length ?? 0) >= feeRemissionMaxRows)) return;
    const form = new FormData(event.currentTarget);
    const values = Object.fromEntries(feeRemissionFields.map(([key]) => {
      const text = String(form.get(key) ?? '');
      return [key, form.has(`${key}-null`) && text === '' ? null : text];
    })) as Record<FeeRemissionCell, string | null>;
    const payload = {...envelope(), ...values, row_order: Number(form.get('row_order'))};
    void perform({kind: 'save_fee_remission', payload});
  }

  const disabled = parentBusy || busy || Boolean(pending) || conflict;
  const atLimit = !editing && (history?.records.length ?? 0) >= feeRemissionMaxRows;
  return <section className="affairs-manager" aria-label="學雜費減免紀錄管理">
    <h3>學雜費減免紀錄管理</h3>
    <Button type="button" variant="outline" disabled={parentBusy || busy || Boolean(pending)} onClick={reload}>重新載入紀錄</Button>
    {!history && !error && <p role="status">載入中…</p>}
    {error && <p role="alert">{error}</p>}
    {message && <p role="status">{message}</p>}
    {pending && !busy && <Button type="button" disabled={parentBusy} onClick={() => void perform(pending)}>重試原操作</Button>}
    {history && <>
      <ul aria-label="已儲存的減免紀錄">{history.records.map((row, index) => <li key={row.id}>
        {row.academic_year_text} {row.semester_text} {row.category_text}{' '}
        <Button type="button" variant="outline" disabled={disabled} onClick={() => select(row)}>編輯第 {index + 1} 筆</Button>
      </li>)}</ul>
      {atLimit ? <p>已達 250 筆紀錄上限。可編輯或刪除現有紀錄。</p> : <form key={formVersion} className="affairs-record-form" onSubmit={submit}>
        <h4>{editing ? '編輯紀錄' : '新增紀錄'}</h4>
        <fieldset disabled={disabled || confirmDelete}>
          {feeRemissionFields.map(([key, label, limit]) => <div key={key}>
            <label>{label}{key === 'notes_text'
              ? <Textarea name={key} maxLength={limit} defaultValue={editing?.[key] ?? ''} />
              : <Input name={key} maxLength={limit} defaultValue={editing?.[key] ?? ''} />}</label>
            <label><input type="checkbox" name={`${key}-null`} defaultChecked={!editing || editing[key] === null} />未提供{label}</label>
          </div>)}
          <label>顯示順序<Input name="row_order" type="number" min={0} max={10000} step={1} required defaultValue={editing?.row_order ?? 0} /></label>
          <Button type="submit">儲存減免紀錄</Button>
          {editing && <>
            <Button type="button" variant="outline" onClick={() => select(null)}>取消編輯</Button>
            <Button type="button" variant="outline" onClick={() => setConfirmDelete(true)}>刪除這筆紀錄</Button>
          </>}
        </fieldset>
      </form>}
      {confirmDelete && editing && !pending && <div>
        <p>確定要刪除這筆減免紀錄？</p>
        <Button type="button" disabled={disabled} onClick={() => void perform({kind: 'delete_fee_remission', payload: envelope()})}>確認刪除</Button>
        <Button type="button" variant="outline" disabled={busy} onClick={() => setConfirmDelete(false)}>取消</Button>
      </div>}
    </>}
  </section>;
}
