import {useEffect,useRef,useState,type FormEvent} from 'react';
import {Link} from 'react-router';
import {Dialog,DialogClose,DialogContent,DialogDescription,DialogTitle} from '@/components/ui/dialog';
import {confirmStudentProfile,loadStudentProfile,StudentProfileError} from '@/services/studentProfile';
import {profileFieldLabels,validProfileMobile,type ConfirmStudentProfile,type StudentProfileRecord} from '../../../../server/studentProfileContract.js';
import './studentProfile.css';

const title='學生基本資料確認';
const crest='/stu-reference/student-profile/heading.png';
const exit='/school-affairs/menu/aca/all';
type Field=keyof typeof profileFieldLabels;

function RadioValues({name,choices,value}:{name:string;choices:[string,string];value:number|null}){
  return <>{choices.map((label,index)=><label key={label} className="student-profile-radio">
    <input type="radio" name={name} disabled checked={value===index}/>{label}</label>)}</>;
}

function StudentProfileForm({record,userId,reload}:{record:StudentProfileRecord;userId:string;reload:()=>void}){
  const [saved,setSaved]=useState(record);
  const [mobile,setMobile]=useState(record.updated_mobile??'');
  const [request,setRequest]=useState<ConfirmStudentProfile|null>(null);
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[conflict,setConflict]=useState(false);
  const pending=useRef<ConfirmStudentProfile|null>(null),active=useRef<AbortController|null>(null);
  useEffect(()=>()=>active.current?.abort(),[]);
  const valid=validProfileMobile(mobile.trim()||null);
  const display=(field:Field)=>{
    const value=saved[field];
    if(field==='gender')return <RadioValues name={field} choices={['男','女']} value={value===null?null:value==='male'?0:1}/>;
    if(field==='overseas'||field==='indigenous')return <RadioValues name={field} choices={['是','否']} value={value===null?null:value===true?0:1}/>;
    return field==='identity_last_four'&&value?'••••••'+value:value??'';
  };
  const cell=(field:Field,span=1)=><><th scope="row">{field==='identity_last_four'?'身份證字號':profileFieldLabels[field]}：</th><td colSpan={span}>{display(field)}</td></>;
  function prepare(event:FormEvent){
    event.preventDefault();
    if(!valid||busy||conflict)return;
    const updated_mobile=mobile.trim()||null;
    if(!pending.current||pending.current.updated_mobile!==updated_mobile||pending.current.expected_version!==saved.version){
      pending.current={updated_mobile,confirmed:true,expected_version:saved.version,request_id:crypto.randomUUID()};
    }
    setError('');setRequest(pending.current);
  }
  async function submit(){
    if(!request||active.current)return;
    const controller=new AbortController();
    active.current=controller;
    setBusy(true);setError('');
    try{
      const result=await confirmStudentProfile(userId,request,controller.signal);
      if(controller.signal.aborted)return;
      setSaved({...saved,updated_mobile:request.updated_mobile??saved.updated_mobile,confirmed_at:result.confirmedAt,version:result.version});
      setMobile(request.updated_mobile??saved.updated_mobile??'');
      pending.current=null;setRequest(null);
    }catch(reason){
      if(!controller.signal.aborted){
        const stale=reason instanceof StudentProfileError&&(reason.status===409||reason.status===404);
        setConflict(stale);
        setError(stale?'資料已更新，請重新載入。':'無法確認儲存結果，請重試。');
      }
    }finally{
      active.current=null;
      if(!controller.signal.aborted)setBusy(false);
    }
  }
  return <form className="student-profile-form" onSubmit={prepare}>
    <div className="student-profile-table-scroll" role="region" tabIndex={0} aria-label={title}>
      <table className="student-profile-table" aria-label={title}>
        <colgroup><col className="student-profile-label"/><col/><col className="student-profile-label"/><col/></colgroup>
        <tbody>
          <tr>{cell('student_number')}{cell('name_zh')}</tr>
          <tr>{cell('name_en')}{cell('identity_last_four')}</tr>
          <tr>{cell('birthday_label')}{cell('gender')}</tr>
          <tr>{cell('overseas')}{cell('overseas_place')}</tr>
          <tr>{cell('indigenous')}{cell('indigenous_place')}</tr>
          <tr>{cell('registered_address',3)}</tr>
          <tr>{cell('mailing_address',3)}</tr>
          <tr>{cell('postal_code')}{cell('home_phone')}</tr>
          <tr>{cell('contact_phone')}{cell('original_mobile')}</tr>
          <tr><th scope="row"><label htmlFor="student-profile-mobile">更新行動電話：</label></th>
            <td colSpan={3}><input id="student-profile-mobile" type="tel" maxLength={20} autoComplete="tel" value={mobile}
              onChange={event=>setMobile(event.target.value)} aria-invalid={!valid}/></td></tr>
          <tr>{cell('guardian')}{cell('occupation')}</tr>
        </tbody>
      </table>
    </div>
    <div className="student-profile-actions">
      <button type="submit" disabled={!valid||busy||conflict}>確認後送出</button><Link to={exit}>離開</Link>
    </div>
    {conflict&&!request&&<p className="student-profile-message" role="alert">資料已更新。 <button type="button" onClick={reload}>重新載入</button></p>}
    {saved.confirmed_at&&<p className="student-profile-result" role="status">已確認基本資料。</p>}
    <Dialog open={Boolean(request)} onOpenChange={open=>{if(!open&&!busy)setRequest(null);}}>
      <DialogContent><DialogTitle>確認學生基本資料</DialogTitle>
        <DialogDescription>送出後會保存本次確認{request?.updated_mobile?'及更新的行動電話':''}。</DialogDescription>
        {error&&<p role="alert">{error}</p>}
        <div className="student-profile-dialog-actions">
          {conflict?<button type="button" onClick={reload}>重新載入</button>:<>
            <DialogClose disabled={busy} type="button">返回</DialogClose>
            <button type="button" onClick={()=>void submit()} disabled={busy}>{busy?'處理中…':'確認送出'}</button>
          </>}
        </div>
      </DialogContent>
    </Dialog>
  </form>;
}

export function StudentProfileWorkspace({userId}:{userId:string}){
  const [result,setResult]=useState<{record:StudentProfileRecord|null}|{error:true}|null>(null);
  const [attempt,setAttempt]=useState(0);
  useEffect(()=>{document.title=title;},[]);
  useEffect(()=>{
    const controller=new AbortController();
    void loadStudentProfile(userId,controller.signal).then(data=>{
      if(!controller.signal.aborted)setResult({record:data.record});
    },()=>{
      if(!controller.signal.aborted)setResult({error:true});
    });
    return ()=>controller.abort();
  },[userId,attempt]);
  function reload(){setResult(null);setAttempt(value=>value+1);}
  return <main className="student-profile" lang="zh-Hant"><div className="student-profile-frame">
    <header><div className="student-profile-banner"><span>Campus Information Services</span><span>Shu-Te University</span></div>
      <div className="student-profile-heading"><img src={crest} alt="" width="42" height="42"/><h1>{title}</h1></div></header>
    {!result&&<p className="student-profile-message" role="status">查詢學生基本資料中…</p>}
    {result&&'error'in result&&<p className="student-profile-message" role="alert">學生基本資料暫時無法載入。 <button type="button" onClick={reload}>重試</button></p>}
    {result&&'record'in result&&(result.record?<StudentProfileForm userId={userId} record={result.record} reload={reload}/>:
      <p className="student-profile-message">目前尚無可確認的學生基本資料。 <Link to={exit}>離開</Link></p>)}
    <section className="student-profile-notes"><h2>說明</h2>
      <ol><li>請檢查基本資料後確認送出。</li>
        <li>如需修改行動電話，可在此更新並送出。</li>
        <li>其他基本資料的變更請洽註冊課務組。</li>
      </ol>
      <table><thead><tr><th scope="col">修正項目</th><th scope="col">攜帶文件</th></tr></thead>
        <tbody><tr><td>姓名、身份證號、出生日期、戶籍地</td><td>個人戶籍謄本</td></tr>
          <tr><td>戶籍地址</td><td>個人戶籍謄本或身份證</td></tr></tbody></table>
    </section>
  </div></main>;
}
