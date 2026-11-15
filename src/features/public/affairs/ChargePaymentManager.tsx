import {useEffect, useRef, useState, type FormEvent} from 'react';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {
  type ChargePaymentAdminHistory, type ChargePaymentAction, type ChargePaymentAdminRow,
  chargePaymentOperationStoragePrefix, chargePaymentPageSize, chargePaymentMaxPage, validateChargePaymentAction,
} from '../../../../server/chargePaymentContract.js';
import {
  ChargePaymentRequestError, changeManagedChargePayment, loadManagedChargePayments,
} from '@/services/chargePaymentHistory';

type Props = {
  managerId: string;
  studentId: string;
  chargeId: string;
  chargeLabel: string;
  disabled: boolean;
  onSaved?: () => void;
  onSavingChange: (saving: boolean) => void;
};
const amountFormat = new Intl.NumberFormat('en-TW', {minimumFractionDigits: 2, maximumFractionDigits: 2});

function savedAction(key: string, studentId: string, chargeId: string): ChargePaymentAction | null {
  try {
    const action = JSON.parse(sessionStorage.getItem(key) ?? 'null') as ChargePaymentAction | null;
    if (!action || !validateChargePaymentAction(action.kind, action.payload)
      || action.payload.student_id !== studentId || action.payload.charge_id !== chargeId) return null;
    return action;
  } catch {
    return null;
  }
}

function storeAction(key: string, action: ChargePaymentAction | null) {
  try {
    if (action) sessionStorage.setItem(key, JSON.stringify(action));
    else sessionStorage.removeItem(key);
  } catch { /* The active form still retains the request for a safe retry. */ }
}

export function ChargePaymentManager({managerId, studentId, chargeId, chargeLabel, disabled, onSaved, onSavingChange}: Props) {
  const storageKey = chargePaymentOperationStoragePrefix + [managerId, studentId, chargeId].join(':');
  const [page, setPage] = useState(1);
  const [refresh, setRefresh] = useState(0);
  const [history, setHistory] = useState<ChargePaymentAdminHistory | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [actionError, setActionError] = useState('');
  const [notice, setNotice] = useState('');
  const [saving, setSaving] = useState(false);
  const [paidOn, setPaidOn] = useState('');
  const [amount, setAmount] = useState('');
  const [reverse, setReverse] = useState<ChargePaymentAdminRow | null>(null);
  const [action, setAction] = useState(() => savedAction(storageKey, studentId, chargeId));
  const writing = useRef<AbortController | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    loadManagedChargePayments(managerId, studentId, chargeId, page, controller.signal).then(result => {
      if (!controller.signal.aborted) setHistory(result);
    }).catch(error => {
      if (!controller.signal.aborted) setLoadError(error instanceof ChargePaymentRequestError && [401,403].includes(error.status)
        ? 'Administrative access could not be verified.' : 'Payment entries could not be loaded. Try refreshing.');
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false);
    });
    return () => controller.abort();
  }, [managerId, studentId, chargeId, page, refresh]);

  useEffect(() => () => {
    if (writing.current) {
      writing.current.abort();
      writing.current = null;
      onSavingChange(false);
    }
  }, [onSavingChange]);

  function startLoad() {
    setHistory(null);
    setLoading(true);
    setLoadError('');
  }

  function reloadFirstPage() {
    startLoad();
    setPage(1);
    setRefresh(value => value + 1);
  }

  async function save(proposal: ChargePaymentAction) {
    if (disabled || writing.current) return;
    const controller = new AbortController();
    writing.current = controller;
    setSaving(true);
    onSavingChange(true);
    setNotice('');
    setActionError('');
    storeAction(storageKey, proposal);
    setAction(proposal);
    try {
      const receipt = await changeManagedChargePayment(managerId, proposal, controller.signal);
      controller.signal.throwIfAborted();
      storeAction(storageKey, null);
      setAction(null);
      setReverse(null);
      setPaidOn('');
      setAmount('');
      reloadFirstPage();
      setNotice(`${receipt.entryKind === 'payment' ? 'Recorded' : 'Reversed'} NT$${amountFormat.format(Number(receipt.amount))} on ${receipt.paidOn}.`);
      onSaved?.();
    } catch (error) {
      if (controller.signal.aborted) return;
      if (error instanceof ChargePaymentRequestError && [400,404,409].includes(error.status)) {
        storeAction(storageKey, null);
        setAction(null);
        setReverse(null);
        reloadFirstPage();
        setActionError(error.status === 409
          ? 'The payment could not be recorded or reversed. Check the refreshed entries and charge balance before trying again.'
          : 'The payment request was rejected. Check the date and the selected charge.');
      } else {
        setActionError('The receipt could not be confirmed. Retry the same request to check whether it was saved.');
      }
    } finally {
      if (!controller.signal.aborted) {
        writing.current = null;
        setSaving(false);
        onSavingChange(false);
      }
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (disabled || saving || loading || !history || action) return;
    const identity = {request_id: crypto.randomUUID(), student_id: studentId, charge_id: chargeId, paid_on: paidOn};
    const proposal: ChargePaymentAction = reverse
      ? {kind: 'reverse_charge_payment', payload: {...identity, payment_id: reverse.id}}
      : {kind: 'record_charge_payment', payload: {...identity, amount: amount.trim(), currency: 'TWD'}};
    if (!validateChargePaymentAction(proposal.kind, proposal.payload) || reverse && paidOn < reverse.paidOn) {
      setActionError(reverse
        ? 'Enter a valid reversal date on or after the payment date, up to today in Taipei.'
        : 'Enter a valid payment date up to today in Taipei and a positive amount with up to two decimal places.');
      return;
    }
    void save(proposal);
  }

  const navigationDisabled = disabled || saving || loading || Boolean(action);
  const pages = Math.min(chargePaymentMaxPage, Math.max(1, Math.ceil((history?.total ?? 0) / chargePaymentPageSize)));
  return <section className="affairs-manager min-w-0 space-y-3" aria-label="Dated charge payments" aria-busy={loading || saving}>
    <h3>Dated payments</h3>
    <p className="[overflow-wrap:anywhere]">{chargeLabel}</p>
    <p>Record received payments in the local ledger. Use a reversal to correct an entry.</p>
    {loading && <p role="status">Loading payment entries…</p>}
    {loadError && <p role="alert">{loadError}</p>}
    {actionError && <p role="alert">{actionError}</p>}
    {notice && <p role="status">{notice}</p>}
    <Button type="button" variant="outline" disabled={disabled || saving || loading} onClick={() => {startLoad();setRefresh(value => value + 1);}}>Refresh payment entries</Button>
    {history && <>
      {!history.rows.length && <p>{history.total ? 'This page has no entries.' : 'No dated payments are recorded for this charge.'}</p>}
      {history.hasUndatedPaidAmount && <p>An earlier paid amount has no transaction date.</p>}
      {history.rows.length > 0 && <ul className="grid gap-2" aria-label="Payment entries">
        {history.rows.map(row => <li key={row.id} className="flex flex-wrap items-center gap-2">
          <span>{row.paidOn} · {row.entryKind === 'reversal' ? 'Reversal' : row.canReverse ? 'Payment' : 'Payment reversed'} · NT${amountFormat.format(Number(row.amount))}</span>
          {row.canReverse && <Button type="button" variant="outline" size="sm" disabled={navigationDisabled}
            onClick={() => {setReverse(row);setPaidOn('');setAmount('');setActionError('');setNotice('');}}>Reverse payment on {row.paidOn}</Button>}
        </li>)}
      </ul>}
      {(pages > 1 || page > 1) && <nav className="flex flex-wrap items-center gap-2" aria-label="Payment entry pages">
        <Button type="button" variant="outline" disabled={navigationDisabled || page <= 1} onClick={() => {startLoad();setPage(value => value - 1);}}>Previous page</Button>
        <span>Page {page} of {pages}</span>
        <Button type="button" variant="outline" disabled={navigationDisabled || page >= pages} onClick={() => {startLoad();setPage(value => value + 1);}}>Next page</Button>
      </nav>}
    </>}
    {action ? <div className="space-y-2">
      <p>{saving ? 'Checking the payment receipt…' : `A ${action.kind === 'record_charge_payment' ? 'payment' : 'reversal'} request dated ${action.payload.paid_on} is awaiting confirmation.`}</p>
      <Button type="button" disabled={disabled || saving} onClick={() => void save(action)}>Retry unchanged request</Button>
    </div> : history && <form className="affairs-record-form" onSubmit={submit}>
      <h4>{reverse ? `Reverse the NT$${amountFormat.format(Number(reverse.amount))} payment on ${reverse.paidOn}` : 'Record a received payment'}</h4>
      <label>{reverse ? 'Reversal date (Taipei)' : 'Payment date (Taipei)'}<Input type="date" required min={reverse?.paidOn ?? '1900-01-01'}
        value={paidOn} disabled={navigationDisabled} onChange={event => setPaidOn(event.target.value)}/></label>
      {!reverse && <label>Payment amount (TWD)<Input type="text" inputMode="decimal" required maxLength={13}
        value={amount} disabled={navigationDisabled} onChange={event => setAmount(event.target.value)}/></label>}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={navigationDisabled}>{reverse ? 'Confirm payment reversal' : 'Record payment'}</Button>
        {reverse && <Button type="button" variant="outline" disabled={navigationDisabled}
          onClick={() => {setReverse(null);setPaidOn('');setActionError('');}}>Cancel reversal</Button>}
      </div>
    </form>}
  </section>;
}
