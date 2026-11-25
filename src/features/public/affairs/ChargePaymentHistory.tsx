import {useEffect,useState,type FormEvent} from 'react';
import {Link,useSearchParams} from 'react-router';
import {
  chargePaymentDate,chargePaymentHistoryPath,chargePaymentMaxPage,chargePaymentPageSize,chargePaymentSelection,
  type ChargePaymentHistory as History,
} from '../../../../server/chargePaymentContract.js';
import {loadChargePaymentHistory} from '@/services/chargePaymentHistory';
import {chargePaymentHistoryParams,chargePaymentHistorySelection,chargePaymentHistoryUrl} from './chargePaymentHistoryRoute';
import {PendingFeesLayout} from './PendingFeesLayout';

const money=new Intl.NumberFormat('zh-TW',{
  style:'currency',currency:'TWD',currencyDisplay:'code',minimumFractionDigits:0,maximumFractionDigits:2,
});

export function ChargePaymentHistory({userId}:{userId:string}){
  const [params,setParams]=useSearchParams();
  return <PendingFeesLayout history>
    <HistoryPage key={userId+':'+params.toString()} userId={userId} params={params} onSearch={setParams}/>
  </PendingFeesLayout>;
}

function HistoryPage({userId,params,onSearch}:{userId:string;params:URLSearchParams;onSearch:(params:URLSearchParams)=>void}){
  const selection=chargePaymentHistorySelection(params);
  const {from,through,chargeId,page}=selection??{};
  const [data,setData]=useState<History|null>(null);
  const [error,setError]=useState(false);
  const [attempt,setAttempt]=useState(0);
  const [rangeError,setRangeError]=useState(false);

  useEffect(()=>{
    if(page===undefined)return;
    const controller=new AbortController();
    void loadChargePaymentHistory(userId,{from,through,chargeId,page},controller.signal).then(
      result=>{if(!controller.signal.aborted)setData(result);},
      ()=>{if(!controller.signal.aborted)setError(true);},
    );
    return ()=>controller.abort();
  },[userId,from,through,chargeId,page,attempt]);

  function search(event:FormEvent<HTMLFormElement>){
    event.preventDefault();
    const fields=new FormData(event.currentTarget);
    const next=chargePaymentSelection({
      from:fields.get('from')||undefined,through:fields.get('through')||undefined,chargeId,
    });
    setRangeError(!next);
    if(next)onSearch(chargePaymentHistoryParams(next));
  }

  const enteredFrom=params.get('from');
  const enteredThrough=params.get('through');
  const pageCount=Math.max(1,Math.min(chargePaymentMaxPage,Math.ceil((data?.total??0)/chargePaymentPageSize)));
  const pageLink=(next:number)=>chargePaymentHistoryUrl({from,through,chargeId,page:next});
  return <>
    <form className="payment-history-filters" onSubmit={search} aria-label="繳費日期範圍 Payment date range">
      <label>開始日期 <span lang="en">From</span><input type="date" name="from"
        defaultValue={chargePaymentDate(enteredFrom)?enteredFrom:''} aria-invalid={rangeError||undefined}
        aria-describedby={rangeError?'payment-history-range-error':undefined}/></label>
      <label>結束日期 <span lang="en">Through</span><input type="date" name="through"
        defaultValue={chargePaymentDate(enteredThrough)?enteredThrough:''} aria-invalid={rangeError||undefined}
        aria-describedby={rangeError?'payment-history-range-error':undefined}/></label>
      <button type="submit">查詢 Search</button>
      {(!selection||from||through||chargeId)&&<Link to={chargePaymentHistoryPath}>清除篩選 Clear filters</Link>}
    </form>
    {rangeError&&<p id="payment-history-range-error" role="alert" className="pending-fees-error">請輸入有效日期，開始日期須早於或等於結束日期。 Enter valid dates with the start date on or before the end date.</p>}
    {!selection&&<p role="alert" className="pending-fees-error">查詢條件無效。請調整日期或清除篩選。 Invalid filters. Change the dates or clear the filters.</p>}
    {selection&&!data&&!error&&<p role="status">載入繳費紀錄中… Loading payment history…</p>}
    {error&&<p role="alert" className="pending-fees-error">無法讀取繳費紀錄。 Payment history could not be loaded.
      <button type="button" onClick={()=>{setError(false);setAttempt(value=>value+1);}}>重試 Retry</button></p>}
    {data&&!data.studentRecordFound&&<p className="pending-fees-empty" role="status">此帳戶尚未連結學生紀錄。 No student record is linked to this account.</p>}
    {data?.studentRecordFound&&<>
      {data.hasUndatedPaidAmount&&<p className="payment-history-undated">
        部分先前已繳金額未記載付款日期，因此未列入此明細。 Some earlier paid amounts have no recorded payment date and do not appear here.
      </p>}
      {data.total===0&&<p className="pending-fees-empty" role="status">
        {from||through||chargeId?'目前沒有符合查詢條件的繳費紀錄。 No dated payments match these filters.':'目前沒有已記載日期的繳費紀錄。 No dated payments are saved.'}
      </p>}
      {data.total>0&&page!==undefined&&page>pageCount&&<p className="pending-fees-empty" role="status">
        此頁沒有紀錄。 There are no entries on this page. <Link to={pageLink(pageCount)}>最後一頁 Last page</Link>
      </p>}
      {data.rows.length>0&&<div className="pending-fees-table-wrap" role="region" aria-label="繳費紀錄 Payment history" tabIndex={0}>
        <table>
          <caption className="pending-fees-sr-only">繳費紀錄 Payment history</caption>
          <thead><tr>
            <th scope="col">日期<br/><span lang="en">Date</span></th>
            <th scope="col">費用<br/><span lang="en">Charge</span></th>
            <th scope="col">金額<br/><span lang="en">Amount</span></th>
            <th scope="col">類型<br/><span lang="en">Entry</span></th>
          </tr></thead>
          <tbody>{data.rows.map(row=><tr key={row.id}>
            <td><time dateTime={row.paidOn}>{row.paidOn.replaceAll('-','/')}</time></td>
            <td>{row.chargeLabel}{row.chargeCategory&&<small className="payment-history-category">{row.chargeCategory}</small>}</td>
            <td className="pending-fees-amount">{money.format(Number(row.amount)*(row.entryKind==='reversal'?-1:1))}</td>
            <td className={row.entryKind==='reversal'?'payment-history-reversal':undefined}>
              {row.entryKind==='reversal'?'沖銷 Reversal':'繳費 Payment'}</td>
          </tr>)}</tbody>
        </table>
      </div>}
      {data.rows.length>0&&page!==undefined&&<nav aria-label="繳費紀錄分頁 Payment history pages" className="payment-history-pages">
        {page>1&&<Link to={pageLink(page-1)}>上一頁 Previous</Link>}
        <span>第 {page} / {pageCount} 頁 · 共 {data.total} 筆</span>
        {page<pageCount&&<Link to={pageLink(page+1)}>下一頁 Next</Link>}
      </nav>}
    </>}
  </>;
}
