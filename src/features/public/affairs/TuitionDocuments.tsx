import {useEffect,useId,useRef,useState} from 'react';
import {Link} from 'react-router';
import {ChevronDown} from 'lucide-react';
import {DropdownMenu,DropdownMenuContent,DropdownMenuItem,DropdownMenuTrigger} from '@/components/ui/dropdown-menu';
import {referenceAsset} from '../site/reference';
import './tuitionDocuments.css';

export type TuitionView='summer'|'extended'|'evening'|'settlement';
const tuitionPaths={summer:'/school-affairs/services/48-1',extended:'/school-affairs/services/48-2',evening:'/school-affairs/services/48-3',settlement:'/school-affairs/services/49-1'} as const;
const titles={summer:'暑修生選課清單暨繳費收據',extended:'Index',evening:'進修部學分學雜費結算繳費單',settlement:'學分學雜費結算差額明細查詢'} as const;
const settlementSubtitle='依據實際修課學分數結算的學分學雜費差額';
const printLinks=[['summer','暑修選課繳費查詢'],['extended','延修選課繳費查詢'],['evening','學分學雜費結算繳費查詢']] as const;
export type TuitionPeriod={id:string;userId:string;label:string};
export type TuitionSettlementRecord={id:string;userId:string;periodId:string;text:string|null};
/** The host must verify actual local file content before supplying this capability. */
export type TuitionLocalDocument={id:string;userId:string;kind:'summer'|'evening';version:number;sourceMode:'local_demo';issuer:'stu.best';availability:'verified_local_file'};
export type TuitionDocumentRequest={documentId:string;documentVersion:number;kind:'summer'|'evening'};
export type TuitionDocumentsProps={
  view:TuitionView;userId:string;busy:boolean;error?:string|null;onReload:()=>void;onLogout:()=>void;
  settlement?:{periods:readonly TuitionPeriod[];selectedId:string;onSelect:(id:string)=>void;onQuery:(id:string)=>void|Promise<void>;queryCompleted?:boolean;record:TuitionSettlementRecord|null};
  document?:TuitionLocalDocument|null;onOpenLocalDocument?:(request:TuitionDocumentRequest)=>void|Promise<void>;
};
const identifier=(value:unknown):value is string=>typeof value==='string'&&value.trim().length>0;
function Icon({children}:{children:string}){return <i className="tuition-icon" aria-hidden="true">{children}</i>;}
function ownPeriods(periods:readonly TuitionPeriod[],userId:string){
  const owned=periods.filter(item=>item&&Object.hasOwn(item,'userId')&&item.userId===userId&&identifier(item.id)&&identifier(item.label));
  const counts=new Map<string,number>();for(const item of owned)counts.set(item.id,(counts.get(item.id)??0)+1);
  return owned.filter(item=>counts.get(item.id)===1);
}
function PrintInformation({view,userId,busy,document,onOpenLocalDocument}:Pick<TuitionDocumentsProps,'userId'|'busy'|'document'|'onOpenLocalDocument'>&{view:'summer'|'evening'}){
  const [opening,setOpening]=useState(false),[error,setError]=useState(''),inFlight=useRef(false),mounted=useRef(true);
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
  const available=Boolean(identifier(userId)&&document&&Object.hasOwn(document,'userId')&&document.userId===userId&&document.kind===view&&identifier(document.id)
    &&Number.isSafeInteger(document.version)&&document.version>0&&document.sourceMode==='local_demo'&&document.issuer==='stu.best'&&document.availability==='verified_local_file'&&onOpenLocalDocument);
  const open=async()=>{
    if(!available||!document||!onOpenLocalDocument||busy||inFlight.current)return;
    inFlight.current=true;setOpening(true);setError('');
    try{await onOpenLocalDocument({documentId:document.id,documentVersion:document.version,kind:view});}
    catch{if(mounted.current)setError('站內文件目前無法開啟，請稍後再試。');}
    finally{inFlight.current=false;if(mounted.current)setOpening(false);}
  };
  return <section className="tuition-print-information" aria-label="PDF 列印資訊">
    {view==='evening'&&<p className="tuition-evening-notice">不辦理就學貸款學生，請務必於教務處公告「延修生註冊須知」之繳費時間，才能開始印製延修生繳費單，以便產生正確學費應繳金額。</p>}
    <h2>系統需求資訊</h2><p>列印 {titles[view]} 需安裝PDF READER</p>
    <p>請事先至 <a href="https://get.adobe.com/reader/" target="_blank" rel="noopener noreferrer">ADOBE</a> 下載 Acrobat Adobe PDF Reader。</p>
    <button className="tuition-print-button" type="button" disabled={busy||opening||!available} onClick={()=>void open()}
      title={available?'開啟 stu.best 站內文件':'目前沒有可開啟的 stu.best 站內文件'} aria-label={`繼續列印 ${titles[view]} PDF（stu.best 站內文件）`}>繼續列印 {titles[view]} PDF</button>
    {opening&&<p className="tuition-local-state" role="status">開啟站內文件中…</p>}{error&&<p className="tuition-error" role="alert">{error}</p>}
  </section>;
}
function Settlement({userId,busy,settlement}:Pick<TuitionDocumentsProps,'userId'|'busy'|'settlement'>){
  const id=useId(),[expanded,setExpanded]=useState(true),[querying,setQuerying]=useState(false),[error,setError]=useState('');
  const inFlight=useRef(false),mounted=useRef(true);useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
  const periods=identifier(userId)?ownPeriods(settlement?.periods??[],userId):[];
  const selected=periods.find(period=>period.id===settlement?.selectedId);
  const record=selected&&settlement?.record&&Object.hasOwn(settlement.record,'userId')&&settlement.record.userId===userId
    &&settlement.record.periodId===selected.id&&identifier(settlement.record.id)&&(settlement.record.text===null||typeof settlement.record.text==='string')?settlement.record:null;
  const query=async()=>{
    if(!selected||!settlement||busy||inFlight.current)return;
    inFlight.current=true;setQuerying(true);setError('');
    try{await settlement.onQuery(selected.id);}catch{if(mounted.current)setError('站內結算紀錄暫時無法查詢，請稍後再試。');}
    finally{inFlight.current=false;if(mounted.current)setQuerying(false);}
  };
  return <>
    <div className="tuition-criteria-heading"><button type="button" aria-expanded={expanded} aria-controls={id} onClick={()=>setExpanded(value=>!value)}><Icon>{'\uf002'}</Icon>查詢條件輸入 <span aria-hidden="true">{expanded?'⌃':'⌄'}</span></button></div>
    <div id={id} hidden={!expanded} className="tuition-criteria"><h2>輸入關鍵字查詢符合條件記錄</h2>
      <form onSubmit={event=>{event.preventDefault();void query();}}><label className="tuition-visually-hidden" htmlFor={id+'-period'}>歷年結算資料</label>
        <select id={id+'-period'} value={selected?.id??''} disabled={busy||querying||periods.length===0} onChange={event=>settlement?.onSelect(event.target.value)}>
          <option value={periods.length?'':'prompt'} disabled>請選擇歷年結算資料</option>
          {!periods.length&&<option value="" disabled>無對應資料</option>}{periods.map(period=><option key={period.id} value={period.id}>{period.label}</option>)}
        </select><button className="tuition-query-button" type="submit" disabled={busy||querying||!selected}>查詢</button>
      </form>
    </div>
    {querying&&<p className="tuition-local-state" role="status">查詢站內結算紀錄中…</p>}{error&&<p className="tuition-error" role="alert">{error}</p>}
    {!busy&&!querying&&!error&&record&&<section className="tuition-local-record" aria-label="站內結算紀錄"><p>{record.text??'—'}</p></section>}
    {!busy&&!querying&&!error&&settlement?.queryCompleted&&!record&&<p className="tuition-local-state" role="status">目前沒有對應的站內結算紀錄。</p>}
    <section className="tuition-explanation"><h2><Icon>{'\uf129'}</Icon>說明</h2><ol><li>學分學雜費結算金額有疑問者，請電洽會計室6158000分機1501。</li></ol></section>
  </>;
}
function ExtendedIndex(){return <section className="tuition-index"><h2>系統功能說明</h2>
  <div><h3><Link to={tuitionPaths.settlement}>{titles.settlement}</Link></h3><p>{settlementSubtitle}</p></div>
  <div><h3>繳費清單列印</h3>{printLinks.map(([view,label])=><p key={view}><Link to={tuitionPaths[view]}>{label}</Link></p>)}</div>
  <p className="tuition-local-state" role="status">延修生繳費資料目前無法提供。</p>
</section>;}

/** Unmounted controlled source view. No requests, payment, issuance or PDF generation. */
export function TuitionDocuments(props:TuitionDocumentsProps){return <TuitionDocumentsContent key={props.userId+':'+props.view} {...props}/>;}
function TuitionDocumentsContent({view,userId,busy,error,onReload,onLogout,settlement,document,onOpenLocalDocument}:TuitionDocumentsProps){
  const title=titles[view],subtitle=view==='settlement'?settlementSubtitle:view==='extended'?'通用系統 Index':'PDF下載及列印';
  return <div className="tuition-documents" lang="zh-Hant"><div className="tuition-shell">
    <header className="tuition-brand"><Link to="/school-affairs"><img src={referenceAsset('https://info.stu.edu.tw/ePortal/assets/img/stu/stuBanner.svg')} width="22" height="24" alt=""/>{view==='extended'?'':title}</Link><span>Shu-Te University</span></header>
    <nav className="tuition-nav" aria-label="學雜費選單">
      <DropdownMenu modal={false}><DropdownMenuTrigger className="tuition-menu">查詢<ChevronDown aria-hidden="true"/></DropdownMenuTrigger><DropdownMenuContent className="tuition-dropdown" align="end"><DropdownMenuItem asChild><Link to={tuitionPaths.settlement}>{titles.settlement}</Link></DropdownMenuItem></DropdownMenuContent></DropdownMenu>
      <DropdownMenu modal={false}><DropdownMenuTrigger className="tuition-menu">繳費清單列印<ChevronDown aria-hidden="true"/></DropdownMenuTrigger><DropdownMenuContent className="tuition-dropdown" align="end">{printLinks.map(([kind,label])=><DropdownMenuItem asChild key={kind}><Link to={tuitionPaths[kind]}>{label}</Link></DropdownMenuItem>)}</DropdownMenuContent></DropdownMenu>
      <DropdownMenu modal={false}><DropdownMenuTrigger className="tuition-menu">Index<ChevronDown aria-hidden="true"/></DropdownMenuTrigger><DropdownMenuContent className="tuition-dropdown" align="end"><DropdownMenuItem asChild><Link to="/school-affairs">Index</Link></DropdownMenuItem><DropdownMenuItem onSelect={onLogout}>Logout</DropdownMenuItem></DropdownMenuContent></DropdownMenu>
    </nav>
    <nav className="tuition-breadcrumb" aria-label="頁面位置"><Icon>{'\uf015'}</Icon><Link to="/school-affairs">Index</Link>{view!=='extended'&&<><span aria-hidden="true">›</span><Link to={tuitionPaths[view]}>{title}</Link></>}</nav>
    <main className="tuition-main" aria-busy={busy}><header className="tuition-heading"><h1><Icon>{'\uf19c'}</Icon>{title} <small>» {subtitle}</small></h1></header>
      {busy&&<p className="tuition-local-state" role="status">載入站內繳費資料中…</p>}{error&&<p className="tuition-error" role="alert">{error} <button type="button" disabled={busy} onClick={onReload}>重新載入</button></p>}
      {view==='settlement'?<Settlement key={settlement?.selectedId??''} userId={userId} busy={busy||Boolean(error)} settlement={settlement}/>:view==='extended'?<ExtendedIndex/>:
        <PrintInformation key={`${document?.id??''}:${document?.version??0}`} view={view} userId={userId} busy={busy||Boolean(error)} document={document} onOpenLocalDocument={onOpenLocalDocument}/>}
    </main>
  </div><footer className="tuition-footer">stu.best · 站內紀錄</footer></div>;
}
