import {useEffect, useRef, useState, type FormEvent} from 'react';
import {Link} from 'react-router';
import {readTutorEvaluation, saveTutorEvaluation, TutorEvaluationError} from '@/services/tutorEvaluation';
import type {TutorEvaluationData,TutorEvaluationSubmission} from '../../../../server/tutorEvaluationContract.js';
import './tutor-evaluation.css';

const title = '樹德科技大學導師制度之學生評量表';
const ratings = [5,4,3,2,1];
const questions = [
  '導師會透過任何方式，與我們保持聯繫',
  '導師對於我的在學生活(含學習、人際、生涯、健康或住宿等)都能主動關心',
  '藉由與導師談話，我的問題能獲得適當的解決或其他資源的協助(例如：轉介諮商中心等)',
  '透過與導師的談話，對我的在學生活、身心健康及未來的生涯發展能有所幫助',
  '與導師的談話能有效促進師生溝通',
  '導師在與我進行互動時，讓我感受到溫暖',
  '導師會鼓勵我們參與校內、外活動',
  '導師能參與班級活動(例如：班會、班遊、聚餐等)，建立師生情感',
  '學期間導師至少會進行一次訪談，以瞭解我的近況',
  '整體而言，導師對我的關懷與訪談是有幫助的',
];

export function TutorEvaluationWorkspace({userId,displayName}: {userId:string;displayName:string}) {
  const [data,setData] = useState<TutorEvaluationData|null>(null);
  const [attempt,setAttempt] = useState(0);
  const [error,setError] = useState('');
  const [busy,setBusy] = useState(false);
  const [pending,setPending] = useState<TutorEvaluationSubmission|null>(null);
  const controller = useRef<AbortController|null>(null);
  const sending = useRef(false);
  useEffect(()=>{
    const current = new AbortController();
    controller.current = current;
    void readTutorEvaluation(userId,current.signal).then(result=>{
      if (!current.signal.aborted) setData(result);
    }).catch(()=>{
      if (!current.signal.aborted) setError('暫時無法載入問卷。');
    });
    return ()=>current.abort();
  },[userId,attempt]);

  const reload = () => {
    setError('');
    setData(null);
    setAttempt(value=>value+1);
  };

  async function save(submission:TutorEvaluationSubmission) {
    const current = controller.current;
    if (!current || current.signal.aborted || sending.current || !data || data.evaluation) return;
    sending.current = true;
    setBusy(true);
    setPending(submission);
    setError('');
    try {
      const receipt = await saveTutorEvaluation(userId,submission,current.signal);
      if (current.signal.aborted) return;
      setData({...data,evaluation:{ratings:submission.ratings,comment:submission.comment,submittedAt:receipt.submittedAt}});
      setPending(null);
    } catch (reason) {
      if (current.signal.aborted) return;
      if (reason instanceof TutorEvaluationError && reason.status === 409) {
        setPending(null);
        reload();
      } else if (reason instanceof TutorEvaluationError && reason.status < 500) {
        setPending(null);
        if ([401,403].includes(reason.status)) setData(null);
        setError(reason.status === 400 ? '請檢查問卷內容。' : '請重新登入後再試。');
      } else setError('暫時無法確認儲存結果，請重試。');
    } finally {
      sending.current = false;
      if (!current.signal.aborted) setBusy(false);
    }
  }

  function submit(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || !data || data.evaluation) return;
    const values = new FormData(event.currentTarget);
    const scores = questions.map((_,index)=>Number(values.get('q'+index)));
    if (scores.some(score=>!ratings.includes(score))) {
      setError('請完成所有評量題目。');
      return;
    }
    void save({request_id:crypto.randomUUID(),ratings:scores,comment:String(values.get('comment') ?? '')});
  }

  const submitted = data?.evaluation;
  const student = data?.student;
  return <main className="tutor-evaluation" lang="zh-Hant">
    <header>
      <Link className="tutor-office" to="/school-affairs/menu/sao/all">樹德科技大學學務處</Link>
      <Link className="tutor-return" to="/school-affairs/menu/sao/all">回上一頁</Link>
    </header>
    <h1>{title}</h1>
    <div className="tutor-directions">
      <p>填答說明：</p>
      <ol>
        <li>請依本學期與導師的實際互動情形填答。回覆會儲存在您的 stu.best 帳戶。</li>
        <li>每題請依所附尺度選擇一個答案。</li>
        <li>您可以填寫對導師輔導的意見或建議。</li>
      </ol>
      <p className="tutor-adviser">您的導師為：—</p>
    </div>
    <section aria-labelledby="tutor-profile">
      <h2 id="tutor-profile">基本資料</h2>
      <dl className="tutor-profile">
        {[
          ['學號',student?.number],['姓名',student?.name ?? displayName],
          ['性別',null],['學制',null],['科系',student?.department],['年級',student?.year],
        ].map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value ?? '—'}</dd></div>)}
      </dl>
    </section>
    <form key={submitted?.submittedAt ?? 'form'} onSubmit={submit}>
      <h2>評量項目及問題</h2>
      <fieldset disabled={!data || !!submitted || !!pending || busy}>
        <div className="tutor-scale">
          <b>一、問卷題目</b><span>非常同意</span>
          <span className="tutor-scale-numbers">{ratings.map(score=><b key={score}>{score}</b>)}</span><span>非常不同意</span>
        </div>
        {questions.map((question,index)=><div className="tutor-question" key={question}>
          <span id={'tutor-question-'+index}>{index+1}.{question}</span>
          <div className="tutor-rating" role="radiogroup" aria-labelledby={'tutor-question-'+index}>
            <span aria-hidden="true">{String(index+1).padStart(2,'0')}</span>
            {ratings.map(score=><label key={score}>
              <span className="tutor-mobile-score" aria-hidden="true">{score}</span>
              <input name={'q'+index} value={score} aria-label={String(score)} type="radio" required defaultChecked={submitted?.ratings[index]===score} />
            </label>)}
          </div>
        </div>)}
        <label className="tutor-comment-label" htmlFor="tutor-comment">二、對於我的導師，我有話要說……</label>
        <textarea id="tutor-comment" name="comment" maxLength={4000} defaultValue={submitted?.comment ?? ''} />
        {!submitted && <div className="tutor-submit"><button type="submit">完成</button></div>}
      </fieldset>
      <div className="tutor-status">
        {!data && !error && <p role="status">載入中…</p>}
        {submitted && <p role="status">已儲存至 stu.best。</p>}
        {error && <p role="alert">{error}</p>}
        {!data && error && <button type="button" onClick={reload}>重新載入</button>}
        {pending && !busy && <button type="button" onClick={()=>void save(pending)}>重試</button>}
      </div>
    </form>
  </main>;
}
