import {useEffect,useState} from 'react';
import {Link} from 'react-router';
import {readCourseAdjustment,readLateAddNotice} from '@/services/courseAdjustment';
import {adjustmentPaths,type AdjustmentNotice,type AdjustmentPhase} from '../../../../server/courseAdjustmentContract.js';
import './courseAdjustment.css';

const assets='/stu-reference/course-adjustment/';
const index='/school-affairs/menu/aca/all';
const late=adjustmentPaths.late_add;

function EligibilityNotice({userId,phase}:{userId:string;phase:AdjustmentPhase}) {
  const [data,setData]=useState<Awaited<ReturnType<typeof readCourseAdjustment>>>();
  const [error,setError]=useState(false);
  const [attempt,setAttempt]=useState(0);
  useEffect(()=>{
    const controller=new AbortController();
    void readCourseAdjustment(userId,phase,controller.signal).then(value=>{
      if(!controller.signal.aborted)setData(value);
    }).catch(()=>{
      if(!controller.signal.aborted)setError(true);
    });
    return ()=>controller.abort();
  },[userId,phase,attempt]);
  const decision=data?.record?.decision;
  return <main className="course-adjustment-event" lang="zh-Hant">
    <header><h1><img src={assets+'stu_logo.png'} alt="樹德科技大學" width="70" height="70"/>{' '}
      <img src={assets+'title.png'} alt="系統訊息通知" width="155" height="49"/></h1></header>
    <section aria-label={phase==='add_drop'?'加退選':'補加選'}>
      <p>親愛同學您好：</p>
      {error&&<p role="alert">選課資格暫時無法查詢。 <button type="button" onClick={()=>{setError(false);setAttempt(value=>value+1);}}>重試</button></p>}
      {!data&&!error&&<p role="status">查詢選課資格中…</p>}
      {data&&<>
        <p>{data.term.academicYear} 學年度第 {data.term.semester} 學期</p>
        <p>{decision==='ineligible'?'站內紀錄顯示您不具備本階段選課資格。':decision==='eligible'?'站內紀錄顯示您具備本階段選課資格。':'目前沒有已確認的站內選課資格。'}
          {data.record&&<small>（{data.record.checked_on}）</small>}</p>
        <p>若有疑問請洽教務處註冊課務組，分機：2009、2010、2012、2016。</p>
        {decision==='eligible'&&<p>選課請至<a href={phase==='add_drop'
          ?'https://info.stu.edu.tw/aca/student/SelectCourse/StuSecondCourse/selnote.asp'
          :'https://info.stu.edu.tw/aca/student/SelectCourse/AddCourseLogin.asp'}>校方選課系統</a>。</p>}
      </>}
    </section>
    <footer><nav aria-label="相關連結">
      <Link to={phase==='add_drop'?index:late}>上一頁</Link>
      <Link to="/">樹德首頁</Link><Link to="/school-affairs">校務資訊系統</Link>
      <a href="https://www.ecc.stu.edu.tw/">電子計算機中心</a>
    </nav><p>© Shu-Te University 樹德科技大學 82445 高雄市燕巢區橫山路59號 (07) 6158000#2401</p></footer>
  </main>;
}

function LateAddNotice({view}:{view:'home'|'notice'|'fees'}) {
  const [notice,setNotice]=useState<AdjustmentNotice>();
  const [error,setError]=useState(false);
  const [attempt,setAttempt]=useState(0);
  useEffect(()=>{
    const controller=new AbortController();
    void readLateAddNotice(controller.signal).then(value=>{
      if(!controller.signal.aborted)setNotice(value);
    }).catch(()=>{
      if(!controller.signal.aborted)setError(true);
    });
    return ()=>controller.abort();
  },[attempt]);
  return <main className="course-adjustment-late" lang="zh-Hant">
    <header><img src={assets+'late-add-crest.gif'} alt="樹德科技大學" width="163" height="147"/>
      <nav aria-label="補加選說明"><Link to={late+'/notice'}>選課注意事項</Link><Link to={late+'/fees'}>收費說明</Link></nav>
    </header>
    {view==='home'&&<div className="course-adjustment-bar">補加選階段</div>}
    <h1>{view==='home'?'補加選系統':view==='notice'?'選課注意事項':'進修部收費說明'}</h1>
    {error&&<p role="alert">補加選公告暫時無法載入。 <button type="button" onClick={()=>{setError(false);setAttempt(value=>value+1);}}>重試</button></p>}
    {!notice&&!error&&<p role="status">載入補加選公告中…</p>}
    {notice&&<section>
      {view==='home'&&<p className="course-adjustment-entry"><Link to={late+'/entry'}>[補加選階段]</Link></p>}
      {(view==='home'?notice.rules_zh:view==='notice'?notice.selection_notes:notice.fee_notes).map(row=><p key={row}>{row}</p>)}
    </section>}
    {view!=='home'&&<Link to={late}>上一頁</Link>}
  </main>;
}

export function CourseAdjustmentWorkspace({userId,path}:{userId:string;path:string}) {
  if(path===adjustmentPaths.add_drop||path===late+'/entry')return <EligibilityNotice key={userId+path} userId={userId} phase={path===adjustmentPaths.add_drop?'add_drop':'late_add'}/>;
  return <LateAddNotice view={path===late+'/notice'?'notice':path===late+'/fees'?'fees':'home'}/>;
}
