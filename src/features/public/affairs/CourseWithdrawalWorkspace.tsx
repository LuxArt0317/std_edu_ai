import {useEffect,useRef,useState} from 'react';
import {Link} from 'react-router';
import {Dialog,DialogContent,DialogTitle,DialogDescription} from '@/components/ui/dialog';
import {CourseWithdrawalError,readCourseWithdrawal,saveCourseWithdrawal} from '@/services/courseWithdrawal';
import {withdrawalPath,withdrawalTaipeiInput,type WithdrawalSnapshot,type WithdrawalCourse,type WithdrawalAction} from '../../../../server/courseWithdrawalContract.js';
import {CourseSelectionSystemShell} from './CourseSelectionIndex';
import './courseWithdrawal.css';

const messages={
  unconfigured:'目前尚未設定站內棄選期間。',
  scheduled:'站內棄選期間尚未開始。',
  open:'站內棄選期間已開放。',
  closed:'站內棄選期間已結束。',
};

function operationOf(course:WithdrawalCourse):WithdrawalAction['operation']|null {
  if(course.remark_text==='Y(W)')return 'restore';
  return course.remark_text===null?'withdraw':null;
}

export function CourseWithdrawalWorkspace({userId}:{userId:string}) {
  const [data,setData]=useState<WithdrawalSnapshot>();
  const [loadError,setLoadError]=useState(false);
  const [attempt,setAttempt]=useState(0);
  const [selected,setSelected]=useState<WithdrawalCourse|null>(null);
  const [working,setWorking]=useState(false);
  const [message,setMessage]=useState('');
  const [error,setError]=useState('');
  const [pending,setPending]=useState<WithdrawalAction|null>(null);
  const active=useRef<AbortController|null>(null);
  const inFlight=useRef(false);
  const trigger=useRef<HTMLButtonElement|null>(null);
  const section=useRef<HTMLElement|null>(null);

  useEffect(()=>{
    const controller=new AbortController();
    active.current=controller;
    void readCourseWithdrawal(userId,controller.signal).then(result=>{
      if(!controller.signal.aborted)setData(result);
    }).catch(()=>{
      if(!controller.signal.aborted)setLoadError(true);
    });
    return ()=>controller.abort();
  },[userId,attempt]);

  function reload() {
    if(inFlight.current)return;
    setData(undefined);
    setLoadError(false);
    setAttempt(value=>value+1);
  }
  function dismiss() {
    if(inFlight.current)return;
    setSelected(null);
    setPending(null);
    setError('');
    if(pending)reload();
  }
  async function save() {
    const controller=active.current;
    if(inFlight.current||!controller||controller.signal.aborted||!selected)return;
    const operation=operationOf(selected);
    if(!operation)return;
    const payload=pending??{course_id:selected.id,operation,expected_version:selected.version,request_id:crypto.randomUUID()};
    inFlight.current=true;
    setPending(payload);
    setWorking(true);
    setError('');
    setMessage('');
    try{
      const result=await saveCourseWithdrawal(userId,controller.signal,payload);
      if(controller.signal.aborted)return;
      setSelected(null);
      setPending(null);
      setMessage(result.remark?'已儲存站內棄選。':'已還原站內棄選。');
      setData(undefined);
      setAttempt(value=>value+1);
    }catch(reason){
      if(controller.signal.aborted)return;
      if(reason instanceof CourseWithdrawalError && [400,401,403,409].includes(reason.status)){
        setPending(null);
        setSelected(null);
        setError(reason.status===409?'棄選期間或課程紀錄已變更，請重新確認。':'無法變更此課程的棄選狀態。');
        setData(undefined);
        setAttempt(value=>value+1);
      }else{
        setError('尚未確認是否儲存成功。重試會使用同一筆請求。');
      }
    }finally{
      inFlight.current=false;
      if(!controller.signal.aborted)setWorking(false);
    }
  }

  const restore=selected?.remark_text==='Y(W)';
  return <CourseSelectionSystemShell title="棄選" subtitle="課程清單" breadcrumb={{title:'棄選',path:withdrawalPath}} snapshotDescription={false}>
    <section ref={section} className="course-withdrawal" aria-label="棄選課程" tabIndex={-1}>
      {message&&<p role="status">{message}</p>}
      {error&&!selected&&<p role="alert">{error}</p>}
      {loadError&&<p role="alert">無法載入棄選紀錄。 <button type="button" onClick={reload}>重試</button></p>}
      {!data&&!loadError&&<p role="status">載入棄選紀錄中…</p>}
      {data&&<>
        <h2 className="course-selection-system-section-title">{data.academicYear} 學年度第 {data.semester} 學期</h2>
        <p>{messages[data.state]}</p>
        {data.window&&<p>台北時間 {withdrawalTaipeiInput(data.window.opensAt).replace('T',' ')} 至 {withdrawalTaipeiInput(data.window.closesAt).replace('T',' ')}</p>}
        <div className="course-withdrawal-table" tabIndex={0} role="region" aria-label="棄選清單">
          <table>
            <thead><tr>{['序號','當期課程代碼','課程名稱','必選修','學分','教師一','註記','操作'].map(heading=><th key={heading} scope="col">{heading}</th>)}</tr></thead>
            <tbody>{data.courses.map((course,index)=>{
              const operation=operationOf(course);
              return <tr key={course.id}><td>{index+1}</td><td>{course.term_course_code}</td><td>{course.course_title}</td>
                <td>{course.required_elective_text}</td><td>{course.credits}</td><td>{course.instructor_one}</td>
                <td>{course.remark_text==='Y(W)'?'Y（已棄選）':course.remark_text}</td>
                <td>{data.state==='open'&&operation&&<button type="button" aria-label={(operation==='restore'?'還原 ':'棄選 ')+course.course_title}
                  onClick={event=>{trigger.current=event.currentTarget;setSelected(course);setError('');setMessage('');}}>{operation==='restore'?'還原':'棄選'}</button>}</td></tr>;
            })}
            {!data.courses.length&&<tr><td colSpan={8}>目前沒有本學期的棄選課程紀錄。</td></tr>}</tbody>
          </table>
        </div>
        <p>已棄選的課程仍列於清單中。站內期間結束前可還原。</p>
        <p><Link to="/school-affairs/services/11-1">選課記錄查詢</Link></p>
      </>}
    </section>
    <Dialog open={selected!==null} onOpenChange={open=>{if(!open)dismiss();}}>
      <DialogContent className="course-withdrawal-dialog" showCloseButton={false} lang="zh-Hant"
        onCloseAutoFocus={event=>{event.preventDefault();(trigger.current?.isConnected?trigger.current:section.current)?.focus();}}>
        <DialogTitle>{restore?'確認還原':'確認棄選'}</DialogTitle>
        <DialogDescription>{selected?.term_course_code} · {selected?.course_title}。此操作會更新 stu.best 的課程紀錄。</DialogDescription>
        {error&&<p role="alert">{error}</p>}
        <div className="course-withdrawal-buttons">
          <button type="button" disabled={working} onClick={dismiss}>取消</button>
          <button type="button" disabled={working} onClick={()=>void save()}>{working?'儲存中…':pending?'重試儲存':restore?'確認還原課程':'確認棄選課程'}</button>
        </div>
      </DialogContent>
    </Dialog>
  </CourseSelectionSystemShell>;
}
