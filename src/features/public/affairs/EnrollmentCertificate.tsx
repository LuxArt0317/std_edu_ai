import {useEffect,useRef,useState} from 'react';
import {Link} from 'react-router';
import {ChevronDown} from 'lucide-react';
import {DropdownMenu,DropdownMenuContent,DropdownMenuItem,DropdownMenuTrigger} from '@/components/ui/dropdown-menu';
import {enrollmentCertificateColumns,enrollmentCertificatePath,enrollmentCertificateResult,enrollmentCertificateSourceNotes,enrollmentCertificateTimestamp,ownEnrollmentCertificate,verifiedEnrollmentCertificateDocument,
  type EnrollmentCertificateDocumentRequest,type EnrollmentCertificateRecords,type EnrollmentCertificateSnapshot} from '@/services/enrollmentCertificate';
import {referenceAsset} from '../site/reference';
import {EnrollmentCertificateClientError,loadEnrollmentCertificateData} from '@/services/enrollmentCertificateClient';
import './enrollmentCertificate.css';

export type EnrollmentCertificateProps={snapshot:EnrollmentCertificateSnapshot|null;busy:boolean;error?:string;onReload:()=>void;onLogout:()=>void;
  onOpenLocalDocument?:(request:EnrollmentCertificateDocumentRequest)=>void|Promise<void>};

/** Dedicated scope load; no broad account snapshot or document-opening callback. */
export function EnrollmentCertificateWorkspace({userId,onLogout,load=loadEnrollmentCertificateData}:{userId:string;onLogout:()=>void;load?:typeof loadEnrollmentCertificateData}){
  const [revision,setRevision]=useState(0);
  const [state,setState]=useState<{userId:string;revision:number;snapshot?:EnrollmentCertificateSnapshot;error?:string}>();
  useEffect(()=>{
    const controller=new AbortController();
    void load(userId,controller.signal).then(snapshot=>{
      if(snapshot.profile.userId!==userId)throw new EnrollmentCertificateClientError('登入帳戶已變更，請重新載入。',401);
      if(!controller.signal.aborted)setState({userId,revision,snapshot});
    }).catch(error=>{
      if(controller.signal.aborted)return;
      setState(prior=>({userId,revision,snapshot:prior?.userId===userId?prior.snapshot:undefined,error:error instanceof EnrollmentCertificateClientError?error.message:'在學證明條件資料暫時無法載入，請稍後再試。'}));
    });
    return ()=>controller.abort();
  },[userId,revision,load]);
  const current=state?.userId===userId?state:undefined;
  return <EnrollmentCertificate snapshot={current?.snapshot??null} busy={current?.revision!==revision} error={current?.error} onReload={()=>setRevision(value=>value+1)} onLogout={onLogout}/>;
}
const widths=[220.421875,185.34375,290.5859375,382.6484375];
function Icon({children}:{children:string}){return <i className="enrollment-certificate-icon" aria-hidden="true">{children}</i>;}
function LocalDocumentAction({records,userId,onOpen}:{records:EnrollmentCertificateRecords;userId:string;onOpen:NonNullable<EnrollmentCertificateProps['onOpenLocalDocument']>}){
  const inFlight=useRef(false),[opening,setOpening]=useState(false),[error,setError]=useState('');
  const open=async()=>{
    if(inFlight.current)return;
    const document=verifiedEnrollmentCertificateDocument(records,userId);
    if(!document){setError('站內文件狀態已變更，請重新載入後再試。');return;}
    inFlight.current=true;setOpening(true);setError('');
    try{await onOpen({documentId:document.id,assessmentId:document.assessmentId,expectedAssessmentVersion:document.assessmentVersion});}
    catch{setError('站內文件目前無法開啟，請稍後再試。');}
    finally{inFlight.current=false;setOpening(false);}
  };
  return <div className="enrollment-certificate-local-document"><button type="button" disabled={opening} onClick={open}>{opening?'開啟中…':'開啟 stu.best 站內示範文件'}</button>{error&&<p role="alert">{error}</p>}</div>;
}

/** Source-backed blocked layout only. This component performs no reads, writes or document generation. */
export function EnrollmentCertificate({snapshot,busy,error,onReload,onLogout,onOpenLocalDocument}:EnrollmentCertificateProps){
  const userId=snapshot?.profile.userId??'',records=snapshot?.enrollmentCertificate,{assessment,ambiguous}=ownEnrollmentCertificate(records,userId);
  const document=!busy&&!error?verifiedEnrollmentCertificateDocument(records,userId):null;
  const identity=assessment?.identity;
  return <div className="enrollment-certificate" lang="zh-Hant"><div className="enrollment-certificate-shell">
    <header className="enrollment-certificate-brand"><Link to="/school-affairs"><img src={referenceAsset('https://info.stu.edu.tw/ePortal/assets/img/stu/stuBanner.svg')} width="22" height="24" alt=""/>學籍查詢系統</Link><span>Shu-Te University</span></header>
    <nav className="enrollment-certificate-nav" aria-label="學籍查詢選單">
      <DropdownMenu modal={false}><DropdownMenuTrigger className="enrollment-certificate-menu">資料維護<ChevronDown aria-hidden="true"/></DropdownMenuTrigger><DropdownMenuContent className="enrollment-certificate-dropdown" align="end"><DropdownMenuItem disabled>----</DropdownMenuItem></DropdownMenuContent></DropdownMenu>
      <DropdownMenu modal={false}><DropdownMenuTrigger className="enrollment-certificate-menu">查詢<ChevronDown aria-hidden="true"/></DropdownMenuTrigger><DropdownMenuContent className="enrollment-certificate-dropdown" align="end"><DropdownMenuItem asChild><Link to={enrollmentCertificatePath}>查詢在學證明</Link></DropdownMenuItem></DropdownMenuContent></DropdownMenu>
      <DropdownMenu modal={false}><DropdownMenuTrigger className="enrollment-certificate-menu">Index<ChevronDown aria-hidden="true"/></DropdownMenuTrigger><DropdownMenuContent className="enrollment-certificate-dropdown" align="end"><DropdownMenuItem asChild><Link to="/school-affairs">Index</Link></DropdownMenuItem><DropdownMenuItem onSelect={onLogout}>Logout</DropdownMenuItem></DropdownMenuContent></DropdownMenu>
    </nav>
    <nav className="enrollment-certificate-breadcrumb" aria-label="頁面位置"><Icon>{'\uf015'}</Icon><Link to="/school-affairs">Index</Link><span aria-hidden="true">›</span><Link to={enrollmentCertificatePath}>查詢在學證明</Link></nav>
    <main className="enrollment-certificate-main" aria-busy={busy}>
      <header className="enrollment-certificate-heading"><h1><Icon>{'\uf19c'}</Icon>查詢在學證明 <small>» 查詢學籍及待繳費用情形，若符合條件方可產出在學證明</small></h1></header>
      <div className="enrollment-certificate-data">
      {busy&&<p className="enrollment-certificate-state" role="status">載入在學證明條件資料中…</p>}
      {error&&<p className="enrollment-certificate-error" role="alert">{error} <button type="button" disabled={busy} onClick={onReload}>重新載入</button></p>}
      <h2 className="enrollment-certificate-profile-heading"><Icon>{'\uf03a'}</Icon>以下為您的學籍基本資料</h2>
      <div className="enrollment-certificate-profile">學號：{identity?.studentNumber??'—'} ｜ 姓名：{identity?.studentName??'—'} ｜ 系所：{identity?.departmentName??'—'} ｜ 年級：{identity?.yearText??'—'} ｜ 班級：{identity?.classLabel??'—'}</div>
      <div className="enrollment-certificate-scroll" role="region" aria-label="在學證明條件紀錄，可左右捲動" tabIndex={0}><table className="enrollment-certificate-table" aria-label="在學證明條件紀錄">
        <colgroup>{widths.map((width,index)=><col key={index} style={{width:`${width/1079*100}%`}}/>)}</colgroup>
        <thead><tr>{enrollmentCertificateColumns.map(column=><th scope="col" key={column}>{column}</th>)}</tr></thead>
        <tbody>{assessment&&<tr><td>{assessment.academicYear??'—'}</td><td>{assessment.semester??'—'}</td><td>{assessment.hasPendingFees??'—'}</td><td className={assessment.status==='blocked'?'enrollment-certificate-blocked':undefined}>{enrollmentCertificateResult(assessment)}
          {document&&records&&onOpenLocalDocument&&<LocalDocumentAction key={`${userId}:${assessment.id}:${assessment.version}:${document.id}`} records={records} userId={userId} onOpen={onOpenLocalDocument}/>}</td></tr>}</tbody>
      </table></div>
      {!busy&&!error&&!assessment&&<p className="enrollment-certificate-state" role="status">{ambiguous?'目前有多筆站內條件紀錄，請重新載入並由管理員確認。':'目前沒有站內在學證明條件紀錄。'}</p>}
      <p className="enrollment-certificate-datetime">Date/Time : {enrollmentCertificateTimestamp(snapshot?.checkedAt)}</p>
      <section className="enrollment-certificate-notes" aria-label="來源網站注意事項（2026-11-13 擷取，非站內發證規則）"><h2><Icon>{'\uf129'}</Icon>注意事項</h2><ol>{enrollmentCertificateSourceNotes.map(note=><li key={note}>{note}</li>)}</ol></section>
      </div>
    </main>
  </div><footer className="enrollment-certificate-footer">stu.best · 站內示範紀錄</footer></div>;
}
