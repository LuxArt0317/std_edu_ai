import {useEffect,useId,useRef,useState} from 'react';
import {Link} from 'react-router';
import {ownStudentConductIdentity,ownStudentConductRecords,studentConductColumns,type StudentConductIdentity,type StudentConductRecords} from '@/services/studentConduct';
import './studentConduct.css';

/** A host may provide these capabilities only after verifying actual local content.
 * They are separate from record metadata; the current records backend exposes none. */
export type StudentConductDocument={id:string;userId:string;version:number;sourceMode:'local_demo';issuer:'stu.best';availability:'verified_local_file'};
export type StudentConductDetail={id:string;userId:string;recordId:string;recordVersion:number;version:number;sourceMode:'local_demo';availability:'verified_local_detail'};
export type StudentConductDocumentRequest={documentId:string;documentVersion:number};
export type StudentConductDetailRequest={detailId:string;detailVersion:number;recordId:string;recordVersion:number};
export type StudentConductProps={
  userId:string;identity:StudentConductIdentity|null;records:StudentConductRecords|null;busy:boolean;error?:string|null;onReload:()=>void;
  document?:StudentConductDocument|null;onDownload?:(request:StudentConductDocumentRequest)=>void|Promise<void>;
  details?:readonly StudentConductDetail[];onViewDetail?:(request:StudentConductDetailRequest)=>void|Promise<void>;
};
const asset=(name:string)=>'/stu-reference/conduct-'+name;
const identifier=(value:unknown):value is string=>typeof value==='string'&&value.trim().length>0;
const revision=(value:unknown)=>Number.isSafeInteger(value)&&Number(value)>0;
const owned=(value:{userId:string}|null|undefined,userId:string)=>Boolean(identifier(userId)&&value&&Object.hasOwn(value,'userId')&&value.userId===userId);

/** Unmounted, controlled source view. No account lookup, issuance, fetching or inferred totals. */
export function StudentConduct(props:StudentConductProps){return <AccountStudentConduct key={props.userId} {...props}/>;}
function AccountStudentConduct({userId,identity,records,busy,error,onReload,document:documentCapability,onDownload,details=[],onViewDetail}:StudentConductProps){
  const topId=useId(),numberId=useId(),nameId=useId();
  const [opening,setOpening]=useState(false),[actionError,setActionError]=useState(''),inFlight=useRef(false),mounted=useRef(true);
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
  const currentIdentity=ownStudentConductIdentity(identity,userId);
  const projectedRecords=ownStudentConductRecords(records,userId);
  const ready=Boolean(!busy&&!error&&projectedRecords!==null&&currentIdentity);
  const rows=ready?projectedRecords??[]:[];
  const downloadable=Boolean(ready&&owned(documentCapability,userId)&&identifier(documentCapability?.id)&&revision(documentCapability?.version)
    &&documentCapability?.sourceMode==='local_demo'&&documentCapability.issuer==='stu.best'&&documentCapability.availability==='verified_local_file'&&onDownload);
  const detailFor=(recordId:string,recordVersion:number)=>{
    const matches=details.filter(detail=>owned(detail,userId)&&detail.recordId===recordId&&detail.recordVersion===recordVersion&&identifier(detail.id)
      &&revision(detail.version)&&detail.sourceMode==='local_demo'&&detail.availability==='verified_local_detail');
    return matches.length===1&&onViewDetail?matches[0]:null;
  };
  async function run(action:()=>void|Promise<void>){
    if(!ready||inFlight.current)return;inFlight.current=true;setOpening(true);setActionError('');
    try{await action();}catch{if(mounted.current)setActionError('站內資料目前無法開啟，請稍後再試。');}
    finally{if(mounted.current){inFlight.current=false;setOpening(false);}}
  }
  const download=()=>{if(downloadable&&documentCapability&&onDownload)void run(()=>onDownload({documentId:documentCapability.id,documentVersion:documentCapability.version}));};
  return <div className="student-conduct" lang="zh-Hant" id={topId}>
    <div className="student-conduct-shell">
      <header className="student-conduct-header">
        <div className="student-conduct-banner"><span>學生操行系統</span><span>Shu-Te University</span></div>
        <div className="student-conduct-heading"><img src={asset('logo.png')} alt="" width="42" height="42"/><h1>獎懲列印作業(學生)</h1></div>
      </header>
      <div className="student-conduct-container"><main className="student-conduct-content" aria-busy={busy}>
        <img className="student-conduct-up-indicator" src={asset('arrowup.png')} alt="" aria-hidden="true"/>
        <section className="student-conduct-query" aria-label="學生獎懲資料">
          <form className="student-conduct-form" onSubmit={event=>event.preventDefault()}>
            <p className="student-conduct-identity"><label htmlFor={numberId}><span aria-hidden="true">*</span>學號</label>
              <input id={numberId} className="student-conduct-number" type="text" readOnly value={!busy&&!error?currentIdentity?.studentNumber??'':''} aria-label="學號"/>{' '}
              <label className="student-conduct-sr-only" htmlFor={nameId}>姓名</label><input id={nameId} className="student-conduct-name" type="text" readOnly value={!busy&&!error?currentIdentity?.studentName??'':''}/>{' '}
              <img src={asset('find.png')} alt="" width="16" height="16" className="student-conduct-find"/>
            </p>
            <div className="student-conduct-confirm"><button type="button" className="student-conduct-download" disabled={!downloadable||opening} onClick={download}
              aria-label="下載獎懲紀錄表（stu.best 站內文件）" title={downloadable?'下載已驗證的 stu.best 站內文件':'目前沒有可下載的 stu.best 站內文件'}>
              {downloadable?'下載 stu.best 獎懲紀錄表':'下載獎懲紀錄表(證明)'}
            </button></div>
            <hr/>
            <div className="student-conduct-instructions"><h2>操作說明</h2><ol><li><img src={asset('find.png')} alt="" width="16" height="16"/> 為輸入查詢條件欄位，其它欄位不做為查詢條件輸入欄位。</li></ol></div>
          </form>
        </section>
        {busy&&<p role="status" className="student-conduct-state">載入獎懲紀錄中…</p>}
        {error&&<p role="alert" className="student-conduct-state student-conduct-error">{error} <button type="button" onClick={onReload} disabled={busy}>重新載入</button></p>}
        {!busy&&!error&&!ready&&<p role="status" className="student-conduct-state student-conduct-unavailable">目前無法確認獎懲紀錄。 <button type="button" onClick={onReload}>重新載入</button></p>}
        {opening&&<p role="status" className="student-conduct-state">開啟 stu.best 站內資料中…</p>}
        {actionError&&<p role="alert" className="student-conduct-state student-conduct-error">{actionError}</p>}
        <section className="student-conduct-data" aria-label="獎懲紀錄">
          <div className="student-conduct-table-scroll" role="region" aria-label="獎懲紀錄表，可水平捲動" tabIndex={0}>
            <table className="student-conduct-table"><caption className="student-conduct-sr-only">學生個人獎懲紀錄</caption>
              <thead><tr>{studentConductColumns.map((column,index)=><th key={column.key} scope="col" style={{width:column.width+'%'}} className={index<6?'has-source-indicator':undefined}>{column.label}{index<6&&<span className="student-conduct-sort-indicator" aria-hidden="true"/>}</th>)}<th scope="col" style={{width:'6%'}}>檢視</th></tr></thead>
              <tbody>{rows.map((row,index)=>{const detail=detailFor(row.id,row.version);return <tr key={row.id}>
                {studentConductColumns.map(column=><td key={column.key}>{row[column.key]??'—'}</td>)}
                <td><button type="button" className="student-conduct-view" disabled={!detail||opening} title={detail?'檢視 stu.best 站內明細':'目前沒有可檢視的 stu.best 站內明細'}
                  aria-label={`檢視第 ${index+1} 筆站內獎懲明細`} onClick={()=>{if(detail&&onViewDetail)void run(()=>onViewDetail({detailId:detail.id,detailVersion:detail.version,recordId:row.id,recordVersion:row.version}));}}>檢視</button></td>
              </tr>;})}</tbody>
            </table>
          </div>
          {ready&&rows.length===0&&<p className="student-conduct-sr-only" role="status">目前沒有獎懲紀錄。</p>}
        </section>
        <div className="student-conduct-back-top"><a href={'#'+topId}>top</a></div>
      </main></div>
    </div>
    <footer className="student-conduct-footer"><p><Link to="/">學校首頁</Link>{' '}<Link to="/student-sso">mySTU</Link></p><p>stu.best · 站內紀錄</p></footer>
  </div>;
}
