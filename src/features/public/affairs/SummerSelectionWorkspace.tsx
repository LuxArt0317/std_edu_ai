import {useEffect,useState} from 'react';
import {Link} from 'react-router';
import {readCourseAdjustment,readSummerNotice} from '@/services/courseAdjustment';
import {adjustmentPaths,adjustmentTerm,type AdjustmentRow,type SummerNotice} from '../../../../server/courseAdjustmentContract.js';
import './summerSelection.css';

const path=adjustmentPaths.summer;
const crest='/stu-reference/course-adjustment/late-add-crest.gif';

function useSummerRecord<T>(load:(signal:AbortSignal)=>Promise<T>){
  const [result,setResult]=useState<{data:T}|{error:true}|null>(null);
  const [attempt,setAttempt]=useState(0);
  useEffect(()=>{
    const controller=new AbortController();
    void load(controller.signal).then(data=>{
      if(!controller.signal.aborted)setResult({data});
    },()=>{
      if(!controller.signal.aborted)setResult({error:true});
    });
    return ()=>controller.abort();
  },[attempt,load]);
  return {result,retry:()=>{setResult(null);setAttempt(value=>value+1);}};
}

function SummerEligibility({userId,year}:{userId:string;year:number}){
  const [load]=useState(()=>(signal:AbortSignal)=>readCourseAdjustment(userId,'summer',signal,undefined,year));
  const {result,retry}=useSummerRecord(load);
  const record=result&&'data'in result?result.data.record:undefined;
  const decision=record?.decision;
  const text:Record<AdjustmentRow['decision'],string>={
    missing_college:'系統找不到對應的學籍資料(學院代碼)，請向教務處反應處理，謝謝。',
    eligible:'站內資格紀錄顯示您符合暑期選課資格。',
    ineligible:'站內資格紀錄顯示您不符合暑期選課資格。',
    unverified:'此學年度尚無已確認的暑期選課資格。',
  };
  return <main lang="zh-Hant" className="summer-selection" aria-label="暑期選課學生身份檢查">
    <p className="summer-selection-status">
      <img src={crest} alt="樹德科技大學" width="163" height="147"/>{' '}
      {record!==undefined?<span>{text[decision??'unverified']}</span>:
        result&&'error'in result?<span role="alert">暑期選課資格暫時無法查詢。 <button type="button" onClick={retry}>重試</button></span>:
          <span role="status">查詢暑期選課資格中…</span>}
    </p>
    {record!==undefined&&decision!=='missing_college'&&<nav aria-label="暑期選課">
      <Link to={path+'/notice?year='+year}>{year} 學年度暑期選課公告</Link>
      {decision==='eligible'&&<Link to={'/school-affairs/services/11-1?summerYear='+year}>暑期選課紀錄</Link>}
    </nav>}
  </main>;
}

function SummerNoticeView({year}:{year:number}){
  const [load]=useState(()=>(signal:AbortSignal)=>readSummerNotice(year,signal));
  const {result,retry}=useSummerRecord<SummerNotice|null>(load);
  const notice=result&&'data'in result?result.data:undefined;
  return <main lang="zh-Hant" className="summer-selection summer-selection-notice">
    <img src={crest} alt="樹德科技大學" width="163" height="147"/>
    <h1>{year} 學年度暑期選課公告</h1>
    <form action={path+'/notice'} method="get">
      <label>學年度 <input type="number" name="year" min="100" max="999" defaultValue={year} required/></label>
      <button type="submit">查詢</button>
    </form>
    {!result&&<p role="status">載入暑期選課公告中…</p>}
    {result&&'error'in result&&<p role="alert">暑期選課公告暫時無法載入。 <button type="button" onClick={retry}>重試</button></p>}
    {notice===null&&<p>此學年度尚無已存的暑期選課公告。</p>}
    {notice&&<dl>
      <dt>公告日期</dt><dd>{notice.published_on}</dd>
      <dt>課程收費</dt><dd>每學分 NT${notice.fee_per_unit.toLocaleString('en-US')}，零學分課程按授課時數以同一費率計費。</dd>
      <dt>開班門檻</dt><dd>至少 {notice.minimum_paid_students} 位選課並繳費的學生。</dd>
      <dt>選課須知</dt><dd><ul>{notice.registration_rules_zh.map(rule=><li key={rule}>{rule}</li>)}</ul></dd>
      <dt>公告來源</dt><dd><a href={notice.source_url}>教務處公告</a></dd>
    </dl>}
    <p><Link to={path+'?year='+year}>暑期選課資格</Link></p>
  </main>;
}

export function SummerSelectionWorkspace({userId,notice,search}:{userId:string;notice:boolean;search:string}){
  const selector=new URLSearchParams(search).getAll('year');
  const invalid=selector.length>1||(selector.length===1&&!/^[1-9][0-9]{2}$/.test(selector[0]));
  const [currentYear]=useState(()=>adjustmentTerm().academicYear);
  const year=selector.length===1&&!invalid?Number(selector[0]):currentYear;
  useEffect(()=>{document.title=notice?'暑期選課公告':'暑期選課-學生身份檢查';},[notice]);
  if(invalid)return <main lang="zh-Hant" className="summer-selection"><p role="alert">請選擇有效的學年度。</p><Link to={notice?path+'/notice':path}>返回</Link></main>;
  return notice?<SummerNoticeView year={year}/>:<SummerEligibility userId={userId} year={year}/>;
}
