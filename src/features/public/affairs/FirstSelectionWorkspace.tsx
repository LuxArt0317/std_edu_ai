import {useEffect,useState} from 'react';
import {Link,useNavigate} from 'react-router';
import {
  Dialog,DialogClose,DialogContent,DialogDescription,DialogTitle,DialogTrigger,
} from '@/components/ui/dialog';
import {
  firstSelectionFeesPath,firstSelectionPhases,firstSelectionScope,firstSelectionTableDate,
  type FirstSelectionNotice,
} from './firstSelection.js';
import './firstSelection.css';

const assets='/stu-reference/first-selection/';
const freshmanGuide='https://freshman.stu.edu.tw/2020/05/13/%E9%81%B8%E8%AA%B2%E8%AA%AA%E6%98%8E%E6%9C%83/';
const phaseLabels=['初選I','初選Ⅱ','初選Ⅲ'];
const numbers=['一','二','三','四','五','六','七','八','九','十'];
const list=(items:string[])=>items.map((item,index)=><p key={index}>{numbers[index]}、{item}</p>);

export function FirstSelectionWorkspace({view}: {view:'schedule'|'fees'}) {
  const [notice,setNotice]=useState<FirstSelectionNotice>();
  const [failed,setFailed]=useState(false);
  const [attempt,setAttempt]=useState(0);
  const navigate=useNavigate();
  useEffect(()=>{
    const controller=new AbortController();
    void (async()=>{
      try {
        const response=await fetch('/api/affairs-data?scope='+firstSelectionScope,{signal:controller.signal});
        if(!response.ok) throw new Error('First selection notice unavailable.');
        const data:FirstSelectionNotice=await response.json();
        if(!Array.isArray(data.windows)||data.windows.length!==firstSelectionPhases.length) throw new Error('Incomplete notice.');
        if(!controller.signal.aborted) setNotice(data);
      } catch {
        if(!controller.signal.aborted) setFailed(true);
      }
    })();
    return ()=>controller.abort();
  },[attempt]);

  return <div className="first-selection" lang="zh-Hant"><main>
    <h1><img src={assets+'title_first_course_notice_stu.png'} width="368" height="24" alt="樹德科技大學初選時程及注意事項"/></h1>
    {!notice && (failed
      ? <p role="alert">初選公告暫時無法載入。 <button type="button" onClick={()=>{setFailed(false);setAttempt(value=>value+1);}}>重試</button></p>
      : <p role="status">載入初選公告中…</p>)}
    {notice && (view==='schedule' ? <>
      <p className="first-selection-reminder">※請妥善保管校務資訊系統密碼，並於選課後保存個人課表。</p>
      <div className="first-selection-table" role="region" aria-label="初選時程，可左右捲動" tabIndex={0}>
        <table>
          <caption>{notice.academicYear}學年度第{notice.semester===1?'一':'二'}學期初選時程及注意事項</caption>
          <colgroup>{[7,17.6,21.3,54.1].map(width=><col key={width} style={{width:width+'%'}}/>)}</colgroup>
          <thead><tr>{['選課項目','日期','參與身份','簡要說明'].map(label=><th key={label} scope="col">{label}</th>)}</tr></thead>
          <tbody>{notice.windows.map(window=><tr key={window.phase}>
            <th scope="row">{phaseLabels[window.phase-1]}</th>
            <td><strong><time dateTime={window.opensAt}>{firstSelectionTableDate(new Date(window.opensAt))}</time>起至<time dateTime={window.closesAt}>{firstSelectionTableDate(new Date(window.closesAt))}</time>止</strong></td>
            <td><strong>{window.audience}</strong></td>
            <td>{window.details}{window.phase===3&&<a href={freshmanGuide}>新生入學服務網</a>}</td>
          </tr>)}</tbody>
        </table>
      </div>
      <section><h2>注意事項</h2>{list(notice.notices)}</section>
      <section className="first-selection-reminders"><h2>選課叮嚀</h2>{list(notice.reminders)}</section>
      <div className="first-selection-schedule-action">
        <Link to={firstSelectionFeesPath} aria-label="進入初選主畫面"><img src={assets+'finish_reading.png'} width="411" height="68" alt=""/></Link>
      </div>
    </> : <section className="first-selection-fees">
      <h2>其他事項</h2>
      {list(notice.feeNotes)}
      <p>※各學制收費標準請參閱<a href="https://www.acc.stu.edu.tw/">會計室</a>的學雜費資料。</p>
      <div className="first-selection-fee-action">
        <Dialog>
          <DialogTrigger asChild><button type="button" aria-label="進入初選系統"><img src={assets+'enter_first_course.png'} width="411" height="68" alt=""/></button></DialogTrigger>
          <DialogContent role="alertdialog" showCloseButton={false} className="first-selection-dialog">
            <DialogTitle>目前無法進入初選系統</DialogTitle>
            <DialogDescription>確認後返回校務資訊系統。</DialogDescription>
            <DialogClose asChild><button type="button" onClick={()=>navigate('/school-affairs',{replace:true})}>OK</button></DialogClose>
          </DialogContent>
        </Dialog>
      </div>
    </section>)}
  </main></div>;
}
