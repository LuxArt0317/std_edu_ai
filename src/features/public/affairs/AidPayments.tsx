import {useEffect,useState} from 'react';
import {Link,useSearchParams} from 'react-router';
import {loadAidPayments} from '@/services/aidPayments';
import {aidPaymentsFields,aidPaymentsMaxPage,aidPaymentsPagePath,aidPaymentsPageSize,aidPaymentsPaths,type AidPaymentResult,type AidPaymentView} from '../../../../server/aidPaymentsContract.js';
import './aidPayments.css';

const navigation=[
  ['學習報告(課程)','https://info.stu.edu.tw/SAO/StudentMoney/Work/trnFile/mtnReport.asp'],
  ['學習報告(活動)','https://info.stu.edu.tw/HRO/StuAssistant/trnFile/mtnMinorActivityLearningGain.asp'],
  ['請款查詢作業',aidPaymentsPaths.claims],
  ['薪資查詢作業',aidPaymentsPaths.salary],
  ['電匯紀錄','https://info.stu.edu.tw/SWD/TTP/qryDataByStu.asp'],
] as const;
const number=new Intl.NumberFormat('zh-TW',{maximumFractionDigits:2});

export function AidPayments({userId,view}:{userId:string;view:AidPaymentView}){
  const [params]=useSearchParams();
  const raw=params.get('page')??'1';
  const page=/^[1-9]\d{0,2}$/.test(raw)&&Number(raw)<=aidPaymentsMaxPage?Number(raw):1;
  return <AidPaymentPage key={userId+':'+view+':'+page} userId={userId} view={view} page={page}/>;
}
function AidPaymentPage({userId,view,page}:{userId:string;view:AidPaymentView;page:number}){
  const [data,setData]=useState<AidPaymentResult|null>(null);
  const [error,setError]=useState(false);
  const [attempt,setAttempt]=useState(0);
  useEffect(()=>{
    const controller=new AbortController();
    void loadAidPayments(userId,view,page,controller.signal).then(
      result=>{if(!controller.signal.aborted)setData(result);},
      ()=>{if(!controller.signal.aborted)setError(true);},
    );
    return ()=>controller.abort();
  },[userId,view,page,attempt]);
  const columns=aidPaymentsFields[view];
  const pageCount=Math.max(1,Math.min(aidPaymentsMaxPage,Math.ceil((data?.total??0)/aidPaymentsPageSize)));
  const link=(next:number)=>aidPaymentsPagePath(view,next);
  return <div className="aid-payment-site" id="aid-payment-top" lang="zh-Hant">
    <div className="aid-payment-shell">
      <header className="aid-payment-brand"><span>助學請領查詢系統</span><span lang="en">Shu-Te University</span></header>
      <div className="aid-payment-banner">
        <h1><img src="/stu-reference/pending-fees-banner.svg" alt="" width="40" height="40"/>學生助學金查詢作業</h1>
        <nav aria-label="助學請領功能">
          {navigation.map(([label,url])=>url.startsWith('/')?<Link to={url} key={url} aria-current={url===aidPaymentsPaths[view]?'page':undefined}>{label}</Link>
            :<a key={url} href={url} target="_blank" rel="noreferrer">{label}</a>)}
        </nav>
      </div>
      <main className="aid-payment-main">
        <section className="aid-payment-panel" aria-label={view==='claims'?'請款查詢作業':'薪資查詢作業'}>
          <p className="aid-payment-name">姓名：</p>
          <div className="aid-payment-table" role="region" aria-label={view==='claims'?'請款紀錄':'薪資紀錄'} tabIndex={0}>
            <table className={view==='salary'?'aid-payment-salary':undefined}>
              <caption className="sr-only">{view==='claims'?'助學金請款紀錄':'學生薪資紀錄'}</caption>
              <thead><tr>{columns.map(([key,label])=><th key={key} scope="col">{label}</th>)}</tr></thead>
              <tbody>{data?.rows.map(row=><tr key={row.id}>{columns.map(([key])=>{
                const value=row[key];
                return <td key={key}>{key==='bank_last4'&&value!==null?'•••• '+value:typeof value==='number'?number.format(value):value}</td>;
              })}</tr>)}</tbody>
            </table>
          </div>
          {!data&&!error&&<p role="status">讀取紀錄中…</p>}
          {error&&<p role="alert">無法讀取紀錄。 <button type="button" onClick={()=>{setError(false);setAttempt(value=>value+1);}}>重試</button></p>}
          {data&&!data.total&&<p className="sr-only" role="status">此帳戶目前沒有已儲存的紀錄。</p>}
          {data&&page>pageCount&&<p>此頁沒有紀錄。 <Link to={link(pageCount)}>最後一頁</Link></p>}
          {data&&pageCount>1&&page<=pageCount&&<nav aria-label="紀錄分頁" className="aid-payment-pages">
            {page>1&&<Link to={link(page-1)}>上一頁</Link>}<span>{page} / {pageCount}</span>
            {page<pageCount&&<Link to={link(page+1)}>下一頁</Link>}
          </nav>}
        </section>
        <div className="aid-payment-top"><a href="#aid-payment-top">▴ top</a></div>
      </main>
      <footer><Link to="/">學校首頁</Link> · <Link to="/school-affairs">mySTU</Link></footer>
    </div>
  </div>;
}
