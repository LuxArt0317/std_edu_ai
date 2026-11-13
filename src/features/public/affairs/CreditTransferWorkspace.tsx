import {useEffect,useRef,useState,type FormEvent} from 'react';
import {Link} from 'react-router';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {CreditTransferError,readCreditTransfers,saveCreditTransfer} from '@/services/creditTransfer';
import {creditTransferPath,creditTransferReasons,creditTransferDecisions,creditTransferSave,creditTransferSubmit,creditTransferReview,
  validCreditTransferAction,type CreditTransferReason,type CreditTransferCourse,type CreditTransferDecision,type CreditTransferRow,type CreditTransferWrite}
  from '../../../../server/creditTransferContract.js';
import {CourseSelectionSystemShell} from './CourseSelectionIndex';
import './creditTransfer.css';

const historyPath=creditTransferPath+'/history';
const instructions='https://www.aca.stu.edu.tw/%E6%8A%B5%E5%85%8D%E5%AD%B8%E5%88%86/';
const statuses={draft:'草稿',submitted:'待站內審查',reviewed:'站內已審查'};
const reasons=Object.entries(creditTransferReasons) as [CreditTransferReason,string][];
const decisions=Object.entries(creditTransferDecisions) as [CreditTransferDecision,string][];
type DraftCourse=Omit<CreditTransferCourse,'previous_credits'|'requested_credits'> & {
  key:string;previous_credits:string;requested_credits:string;
};
const blankCourse=():DraftCourse=>({key:crypto.randomUUID(),previous_title:'',previous_credits:'',requested_title:'',requested_credits:'',course_kind:'required'});

function useTransfers(userId:string,target=userId,admin=false) {
  const [rows,setRows]=useState<CreditTransferRow[]>();
  const [attempt,setAttempt]=useState(0);
  const [error,setError]=useState('');
  const [pending,setPending]=useState<CreditTransferWrite|null>(null);
  const [saving,setSaving]=useState(false);
  const [notice,setNotice]=useState('');
  const active=useRef<AbortController|null>(null);
  const inFlight=useRef(false);
  useEffect(()=>{
    const controller=new AbortController();
    active.current=controller;
    void readCreditTransfers(userId,controller.signal,admin?target:undefined).then(records=>{
      if(!controller.signal.aborted)setRows(records);
    }).catch(()=>{
      if(!controller.signal.aborted)setError('無法載入抵免紀錄。');
    });
    return ()=>controller.abort();
  },[userId,target,admin,attempt]);
  function reload() {
    if(inFlight.current)return;
    setPending(null);setNotice('');setError('');setRows(undefined);setAttempt(value=>value+1);
  }
  async function save(action:CreditTransferWrite) {
    const controller=active.current;
    if(!controller||controller.signal.aborted||inFlight.current)return;
    inFlight.current=true;
    setSaving(true);setError('');setNotice('');setPending(action);
    try{
      const row=await saveCreditTransfer(userId,target,controller.signal,action);
      if(controller.signal.aborted)return;
      setRows(current=>[...(current??[]).filter(item=>item.id!==row.id),row]);
      setNotice(row.status==='draft'?'已儲存草稿。':row.status==='submitted'?'已送出站內審查。':'已儲存審查結果。');
      setPending(null);
    }catch(reason){
      if(controller.signal.aborted)return;
      if(reason instanceof CreditTransferError&&[400,401,403,409].includes(reason.status)){
        setPending(null);
        setError(reason.status===409?'紀錄已變更，請重新載入。':'無法儲存這項變更。');
      }else setError('尚未確認儲存結果。重試會使用同一筆請求。');
    }finally{
      inFlight.current=false;
      if(!controller.signal.aborted)setSaving(false);
    }
  }
  return {rows,error,notice,pending,saving,save,reload};
}

function CourseRows({row}:{row:CreditTransferRow}) {
  return <div className="credit-transfer-table" role="region" aria-label="抵免課程" tabIndex={0}>
    <table><thead><tr>{['原修習課程','原學分','擬抵免課程','學分','必選修','審查結果'].map(label=><th key={label} scope="col">{label}</th>)}</tr></thead>
      <tbody>{row.courses.map((course,index)=><tr key={index}>
        <td>{course.previous_title}</td><td>{course.previous_credits}</td><td>{course.requested_title}</td>
        <td>{course.requested_credits}</td><td>{course.course_kind==='required'?'必修':'選修'}</td>
        <td>{row.decisions?creditTransferDecisions[row.decisions[index]]:'—'}</td>
      </tr>)}</tbody></table>
  </div>;
}

function ApplicationEditor({row,reason,disabled,onSave}:{row?:CreditTransferRow;reason:CreditTransferReason;disabled:boolean;onSave:(action:CreditTransferWrite)=>void}) {
  const [id]=useState(()=>row?.id??crypto.randomUUID());
  const [school,setSchool]=useState(row?.previous_school??'');
  const [courses,setCourses]=useState<DraftCourse[]>(()=>row?.courses.map(course=>({...course,key:crypto.randomUUID(),
    previous_credits:String(course.previous_credits),requested_credits:String(course.requested_credits)}))??[blankCourse()]);
  const [error,setError]=useState('');
  function edit<K extends keyof Omit<DraftCourse,'key'>>(key:string,field:K,value:DraftCourse[K]){
    setCourses(current=>current.map(course=>course.key===key?{...course,[field]:value}:course));
  }
  function submit(event:FormEvent) {
    event.preventDefault();
    if(disabled)return;
    const payload={
      id,reason,previous_school:school.trim(),courses:courses.map(course=>({
        previous_title:course.previous_title.trim(),previous_credits:Number(course.previous_credits),
        requested_title:course.requested_title.trim(),requested_credits:Number(course.requested_credits),course_kind:course.course_kind,
      })),expected_version:row?.version??0,request_id:crypto.randomUUID(),
    };
    if(!validCreditTransferAction(creditTransferSave,payload)){
      setError('請填寫完整的學校、課程名稱及學分。');return;
    }
    setError('');
    onSave({kind:creditTransferSave,payload});
  }
  return <form onSubmit={submit} className="credit-transfer-form">
    <fieldset disabled={disabled}>
      <label>原修習學校<Input required maxLength={160} value={school} onChange={event=>setSchool(event.target.value)}/></label>
      {courses.map((course,index)=><fieldset className="credit-transfer-course" key={course.key}>
        <legend>課程 {index+1}</legend>
        <label>原修習課程<Input required maxLength={160} value={course.previous_title} onChange={event=>edit(course.key,'previous_title',event.target.value)}/></label>
        <label>原學分<Input required type="number" min="0" max="99.99" step=".01" value={course.previous_credits} onChange={event=>edit(course.key,'previous_credits',event.target.value)}/></label>
        <label>擬抵免課程<Input required maxLength={160} value={course.requested_title} onChange={event=>edit(course.key,'requested_title',event.target.value)}/></label>
        <label>擬抵免學分<Input required type="number" min="0" max="99.99" step=".01" value={course.requested_credits} onChange={event=>edit(course.key,'requested_credits',event.target.value)}/></label>
        <label>必選修<select value={course.course_kind} onChange={event=>edit(course.key,'course_kind',event.target.value as CreditTransferCourse['course_kind'])}>
          <option value="required">必修</option><option value="elective">選修</option>
        </select></label>
        {courses.length>1&&<Button type="button" variant="outline" onClick={()=>setCourses(current=>current.filter(item=>item.key!==course.key))}>移除此課程</Button>}
      </fieldset>)}
      <div className="credit-transfer-actions">
        <Button type="button" variant="outline" disabled={courses.length>=20} onClick={()=>setCourses(current=>[...current,blankCourse()])}>新增課程</Button>
        <Button type="submit">儲存草稿</Button>
      </div>
    </fieldset>
    {error&&<p role="alert">{error}</p>}
  </form>;
}

export function CreditTransferWorkspace({userId,history}:{userId:string;history:boolean}) {
  const model=useTransfers(userId);
  const [reason,setReason]=useState<CreditTransferReason>('external_transfer');
  const [confirm,setConfirm]=useState(false);
  const row=model.rows?.find(item=>item.reason===reason);
  const locked=model.saving||!!model.pending;
  return <CourseSelectionSystemShell title={history?'抵免學分紀錄':'抵免學分申請'} subtitle={history?'紀錄查詢':'申請表'}
    breadcrumb={{title:'抵免學分',path:creditTransferPath}} snapshotDescription={false}>
    <section className="credit-transfer">
      <nav className="credit-transfer-actions" aria-label="抵免學分選單">
        <Link to={creditTransferPath}>抵免學分申請</Link><Link to={historyPath}>抵免學分紀錄</Link>
        <Link to={creditTransferPath+'/notes'}>個人備註</Link>
      </nav>
      {model.error&&<p role="alert">{model.error}</p>}
      {model.notice&&<p role="status">{model.notice}</p>}
      {model.error&&!model.pending&&<Button type="button" variant="outline" onClick={model.reload}>重新載入</Button>}
      {model.pending&&!model.saving&&<Button type="button" onClick={()=>{if(model.pending)void model.save(model.pending);}}>重試儲存</Button>}
      {!model.rows&&!model.error&&<p role="status">載入抵免學分紀錄中…</p>}
      {model.rows&& (history?<div className="space-y-4">
        {model.rows.length===0&&<p>目前沒有站內抵免學分紀錄。</p>}
        {model.rows.map(item=><article key={item.id} className="credit-transfer-record">
          <h2>{creditTransferReasons[item.reason]} · {statuses[item.status]}</h2>
          <p>{item.previous_school}</p>
          <CourseRows row={item}/>
        </article>)}
      </div>:<>
        <p>站內申請。正式抵免須依<a href={instructions}>教務處抵免流程</a>辦理。</p>
        <label>申請身分<select disabled={locked} value={reason} onChange={event=>{setConfirm(false);setReason(event.target.value as CreditTransferReason);}}>
          {reasons.map(([value,label])=><option value={value} key={value}>{label}</option>)}
        </select></label>
        {(!row||row.status==='draft')&&<ApplicationEditor key={reason+'/'+(row?.version??0)} row={row} reason={reason}
          disabled={locked} onSave={action=>void model.save(action)}/>}
        {row&&<article className="credit-transfer-record">
          <h2>已儲存的申請 · {statuses[row.status]}</h2>
          <p>{row.previous_school}</p>
          <CourseRows row={row}/>
          <div className="credit-transfer-actions credit-transfer-no-print">
            <Button type="button" variant="outline" onClick={()=>window.print()}>列印站內申請表</Button>
            {row.status==='draft'&&!confirm&&<Button type="button" disabled={locked} onClick={()=>setConfirm(true)}>送出站內審查</Button>}
            {row.status==='draft'&&confirm&&<>
              <p>確認送出已儲存的版本？送出後無法再編輯。</p>
              <Button type="button" disabled={locked} onClick={()=>void model.save({kind:creditTransferSubmit,payload:{
                id:row.id,expected_version:row.version,request_id:crypto.randomUUID(),
              }})}>確認送出</Button>
              <Button type="button" disabled={locked} variant="outline" onClick={()=>setConfirm(false)}>取消</Button>
            </>}
          </div>
        </article>}
      </>)}
    </section>
  </CourseSelectionSystemShell>;
}

function ReviewForm({row,disabled,onReview}:{row:CreditTransferRow;disabled:boolean;onReview:(action:CreditTransferWrite)=>void}) {
  const [values,setValues]=useState<string[]>(()=>row.courses.map(()=>''));
  return <form onSubmit={event=>{
    event.preventDefault();
    if(disabled)return;
    const payload={id:row.id,expected_version:row.version,request_id:crypto.randomUUID(),decisions:values as CreditTransferDecision[]};
    if(validCreditTransferAction(creditTransferReview,payload))onReview({kind:creditTransferReview,payload});
  }} className="credit-transfer-form">
    {row.courses.map((course,index)=><label key={index}>審查課程 {index+1} · {course.requested_title}
      <select required disabled={disabled} value={values[index]} onChange={event=>setValues(current=>current.map((value,i)=>i===index?event.target.value:value))}>
        <option value="">選擇結果</option>{decisions.map(([value,label])=><option key={value} value={value}>{label}</option>)}
      </select>
    </label>)}
    <Button type="submit" disabled={disabled}>儲存站內審查結果</Button>
  </form>;
}

function StudentReviews({userId,target,busy}:{userId:string;target:string;busy:boolean}) {
  const model=useTransfers(userId,target,true);
  return <div className="space-y-3">
    {model.error&&<p role="alert">{model.error}</p>}
    {model.notice&&<p role="status">{model.notice}</p>}
    {model.error&&!model.pending&&<Button type="button" variant="outline" onClick={model.reload}>重新載入</Button>}
    {model.pending&&!model.saving&&<Button type="button" disabled={busy} onClick={()=>{if(model.pending)void model.save(model.pending);}}>重試儲存</Button>}
    {!model.rows&&!model.error&&<p role="status">載入抵免學分紀錄中…</p>}
    {model.rows?.length===0&&<p>這個帳戶沒有站內抵免申請。</p>}
    {model.rows?.map(row=><article key={row.id} className="credit-transfer-record">
      <h4>{creditTransferReasons[row.reason]} · {statuses[row.status]}</h4>
      <p>{row.previous_school}</p><CourseRows row={row}/>
      {row.status==='submitted'&&<ReviewForm key={row.version} row={row} disabled={busy||model.saving||!!model.pending} onReview={action=>void model.save(action)}/>}
    </article>)}
  </div>;
}

export function CreditTransferManager({userId,profiles,busy}:{userId:string;profiles:{user_id:string;email:string;display_name:string}[];busy:boolean}) {
  const [target,setTarget]=useState('');
  if(!profiles.length)return null;
  return <section className="affairs-manager credit-transfer" aria-label="Credit transfer review">
    <h3>Credit transfer review</h3>
    <label>Credit transfer account<select value={target} disabled={busy} onChange={event=>setTarget(event.target.value)}>
      <option value="">Select student</option>
      {profiles.map(profile=><option key={profile.user_id} value={profile.user_id}>{profile.display_name} · {profile.email}</option>)}
    </select></label>
    {target&&<StudentReviews key={target} userId={userId} target={target} busy={busy}/>}
  </section>;
}
