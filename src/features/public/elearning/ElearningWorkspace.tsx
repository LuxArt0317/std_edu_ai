import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { useAffairsAuth } from '../affairs/authContext';
import { safeSchoolReturnPath, signOutAffairs, startGoogleSignIn } from '../affairs/authClient';
import { joinElearning, loadElearning, searchElearning } from '@/services/elearning';
import { elearningCoursePath, elearningOrigin, elearningPath as path, elearningCatalogPageSize,
  type ElearningCatalog, type ElearningCategory, type ElearningCourse, type ElearningWorkspace as Workspace } from '../../../../server/elearningContract.js';
import './elearning.css';

const siteTitle='樹德科技大學 數位學園(遠距教學平台)';
const categoryLink=(id:number)=>path+'/category/'+id;
const noticeLink=(id:number)=>path+'/notice/'+id;
const external=(url:string,label:ReactNode)=><a href={url} target="_blank" rel="noreferrer">{label}</a>;
const zhDate=new Intl.DateTimeFormat('zh-TW',{timeZone:'Asia/Taipei',dateStyle:'medium'});
const taipeiParts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'});

function Header({account,onSignOut,loggingOut,home=false}:{account?:string;onSignOut?:()=>void;loggingOut?:boolean;home?:boolean}){
  return <header className="elearning-header">
    <h1>{siteTitle}</h1>
    {home&&<p>elearning.stu.edu.tw</p>}
    <div className="elearning-account">{account
      ?<>您以 {account} 登入 (<button type="button" onClick={onSignOut} disabled={loggingOut}>登出</button>)</>
      :'You are not logged in.'}</div>
  </header>;
}
function Footer({account}:{account?:string}){
  return <footer className="elearning-footer">{account?<p>已登入 {account}</p>:<p>You are not logged in.</p>}<Link to={path}>Home</Link></footer>;
}
function Login({next,error}:{next:string;error:string}){
  const [pending,setPending]=useState(false),[failure,setFailure]=useState('');
  async function signIn(){
    if(pending)return;
    setPending(true);setFailure('');
    try{
      if(window.top!==window){
        window.top?.location.assign(path+'/login?'+new URLSearchParams({next}));
        return;
      }
      await startGoogleSignIn(next);
    }
    catch(reason){setFailure(reason instanceof Error?reason.message:'Google sign-in could not start.');setPending(false);}
  }
  return <div className="elearning-root" lang="zh-Hant"><div className="elearning-frame">
    <Header/>
    <nav className="elearning-breadcrumb" aria-label="Page path"><Link to={path}>Home</Link> ▸ Log in to the site</nav>
    <main className="elearning-login" id="elearning-main">
      <h2>樹德科大老師與學生請點擊以下連結登入</h2>
      <button type="button" className="elearning-google" onClick={()=>void signIn()} disabled={pending}>
        {pending?'Connecting to Google…':'Continue with Google'}
      </button>
      {(failure||error)&&<p role="alert" className="elearning-error">{failure||error}</p>}
      <div className="elearning-login-columns">
        <section><p>校際選課生、ETD 帳號</p>{external(elearningOrigin+'/login/index.php','前往校方登入')}</section>
        <section><h3>Is this your first time here?</h3><p>請使用 Google 帳戶登入 stu.best 數位學園。</p><p>校際選課及 ETD 服務請使用校方登入。</p></section>
      </div>
    </main>
    <Footer/>
  </div></div>;
}

function SideBlock({title,children}:{title:string;children:ReactNode}){
  return <section className="elearning-block"><h2>{title}</h2>{children}</section>;
}
function ImportantLinks(){
  return <SideBlock title="重要消息"><ul>
    <li>{external(elearningOrigin+'/mod/forum/discuss.php?d=474','平台防掛網機制')} <strong>(必看)</strong></li>
    <li>{external(elearningOrigin+'/mod/forum/discuss.php?d=156','學習統計功能')} <strong>(必看)</strong></li>
    <li><Link to={noticeLink(134865)}>統計報表大哉問</Link> <strong>(必看)</strong></li>
    <li>{external(elearningOrigin+'/pluginfile.php/191743/block_html/content/lawA01遠距教學實施辦法_1120531.pdf','遠距教學實施辦法')}</li>
    <li>{external(elearningOrigin+'/pluginfile.php/191743/block_html/content/lawA02遠距教學課程評鑑標準_1120531.pdf','遠距教學課程評鑑標準')}</li>
    <li>{external(elearningOrigin+'/pluginfile.php/191743/block_html/content/lawA03營區專班及產專班遠距教學評鑑標準_1120531.pdf','營區專班及產專班遠距教學評鑑標準')}</li>
  </ul></SideBlock>;
}
function Calendar(){
  const [today]=useState(()=>taipeiParts.format(new Date()));
  const [month,setMonth]=useState(()=>{
    const [year,month]=today.split('-').map(Number);
    return new Date(Date.UTC(year,month-1,1));
  });
  const year=month.getUTCFullYear(),index=month.getUTCMonth();
  const lead=(month.getUTCDay()+6)%7;
  const days=new Date(Date.UTC(year,index+1,0)).getUTCDate();
  function change(delta:number){setMonth(new Date(Date.UTC(year,index+delta,1)));}
  return <SideBlock title="行事曆"><div className="elearning-month">
    <button type="button" aria-label="上個月" onClick={()=>change(-1)}>◀</button>
    <span aria-live="polite">{year}年 {index+1}月</span>
    <button type="button" aria-label="下個月" onClick={()=>change(1)}>▶</button>
  </div><table aria-label={year+'年 '+(index+1)+'月'} className="elearning-calendar">
    <thead><tr>{['一','二','三','四','五','六','日'].map(c=><th scope="col" key={c}>{c}</th>)}</tr></thead>
    <tbody>{Array.from({length:Math.ceil((lead+days)/7)},(_,i)=><tr key={i}>{Array.from({length:7},(_,j)=>{
      const day=i*7+j-lead+1,valid=day>0&&day<=days;
      const current=valid&&today===new Date(Date.UTC(year,index,day)).toISOString().slice(0,10);
      return <td key={j} aria-current={current?'date':undefined}>{valid?day:''}</td>;
    })}</tr>)}</tbody>
  </table></SideBlock>;
}
function LeftColumn(){
  return <aside className="elearning-side" aria-label="導覽">
    <ImportantLinks/>
    <SideBlock title="導覽"><Link to={path}>首頁</Link><ul><li><Link to={path+'#elearning-notices'}>網站頁面</Link></li>
      <li><Link to={path+'/my-courses'}>我的課程</Link></li><li><Link to={path+'/categories'}>課程</Link></li></ul></SideBlock>
    <SideBlock title="管理">{external(elearningOrigin+'/user/profile.php','校方個人資料設定')}</SideBlock>
    <SideBlock title="遠距教學研習會"><Link to={elearningCoursePath(9718)}>遠距教學研習會</Link></SideBlock>
    <SideBlock title="教學專區－教師"><Link to={noticeLink(327358)}>TronClass平台操作手冊(教師版)</Link></SideBlock>
    <SideBlock title="教學專區－學生"><ul><li><Link to={noticeLink(325505)}>平台操作手冊(學生版)</Link></li>
      <li>{external('https://tc.stu.edu.tw/','TronClass創課 入口網站')}</li></ul></SideBlock>
  </aside>;
}
function RightColumn(){
  return <aside className="elearning-side" aria-label="學習資訊">
    <Calendar/>
    <SideBlock title="樹德科技大學智慧財產權宣導網站">{external('https://copyright.sao.stu.edu.tw/','樹德科技大學智慧財產權宣導網站')}</SideBlock>
    <SideBlock title="學習者電腦軟硬體規格需求"><Link to={noticeLink(158222)}>學習者電腦軟硬體規格需求</Link></SideBlock>
    <SideBlock title="重要連結"><ul><li><Link to="/">學校首頁</Link></li><li><Link to="/school-affairs">校務系統</Link></li>
      <li><Link to="/dtm">數位教材網</Link></li><li>{external('https://tc.stu.edu.tw/','TronClass 創課入口網站')}</li></ul></SideBlock>
    <SideBlock title="客服聯絡方式"><p>註冊課務組：07-6158000 #2010</p><p>電算中心：07-6158000 #2440</p><a href="mailto:service@stu.edu.tw">service@stu.edu.tw</a></SideBlock>
  </aside>;
}
function CategoryTree({rows,parent=null,expanded}:{rows:ElearningCategory[];parent?:number|null;expanded:boolean}){
  return <ul className="elearning-tree">
    {rows.filter(row=>row.parent_id===parent).map(row=><li key={row.id}>
      <Link to={categoryLink(row.id)}>{row.title}</Link>{row.source_count!==null&&<small> ({row.source_count})</small>}
      {expanded&&rows.some(child=>child.parent_id===row.id)&&<CategoryTree rows={rows} parent={row.id} expanded={expanded}/>}
    </li>)}
  </ul>;
}
function SearchBox({initial=''}:{initial?:string}){
  const navigate=useNavigate();
  function search(event:FormEvent<HTMLFormElement>){
    event.preventDefault();
    const term=String(new FormData(event.currentTarget).get('q')??'').trim();
    navigate(term?{pathname:path+'/search',search:new URLSearchParams({q:term}).toString()}:path+'/categories');
  }
  return <form onSubmit={search} className="elearning-search"><label>搜尋課程: <input name="q" defaultValue={initial} maxLength={100}/></label><button>Go</button></form>;
}
function CourseList({courses}:{courses:ElearningCourse[]}){
  return courses.length?<ul className="elearning-course-list">{courses.map(course=><li key={course.id}>
    <Link to={elearningCoursePath(course.id)}>{course.title}</Link>
  </li>)}</ul>:<p>目前沒有本站課程紀錄。</p>;
}
function CourseView({course,joined,userId,onJoined}:{course:ElearningCourse;joined?:string;userId:string;onJoined:()=>void}){
  const [open,setOpen]=useState(false),[pending,setPending]=useState(false),[error,setError]=useState('');
  const request=useRef<AbortController|null>(null);
  useEffect(()=>()=>request.current?.abort(),[]);
  async function confirm(){
    if(request.current)return;
    const controller=new AbortController();request.current=controller;
    setPending(true);setError('');
    try{await joinElearning(userId,course.id,controller.signal);if(!controller.signal.aborted){setOpen(false);onJoined();}}
    catch(reason){if(!controller.signal.aborted)setError(reason instanceof Error?reason.message:'無法完成加選，請重試。');}
    finally{request.current=null;if(!controller.signal.aborted)setPending(false);}
  }
  return <>
    <h2>{joined?course.title:'選課的選項'}</h2>
    {!joined&&<h3>{course.title}</h3>}
    {joined?<p role="status">已加入 · {zhDate.format(new Date(joined))}</p>:course.self_enroll?
      <section className="elearning-enroll"><h3>自行選課 (學生)</h3><p>不需要選課密碼</p>
        <button type="button" onClick={()=>setOpen(true)}>將我加入</button></section>:<p>此課程目前未開放本站加選。</p>}
    <p>{external(elearningOrigin+'/course/view.php?id='+course.id,'在校方 Moodle 開啟課程')}</p>
    <Dialog open={open} onOpenChange={value=>{if(!pending)setOpen(value);}}>
      <DialogContent><DialogTitle>確認加選</DialogTitle>
        <DialogDescription>將 {course.title} 加入您的 stu.best 數位學園帳戶。</DialogDescription>
        {error&&<p role="alert">{error}</p>}
        <button type="button" disabled={pending} onClick={()=>void confirm()}>{pending?'處理中…':'確認'}</button>
      </DialogContent>
    </Dialog>
  </>;
}
function CatalogResults({userId,category,query='',course,joined,onJoined}:{
  userId:string;category?:number;query?:string;course?:number;joined?:string;onJoined?:()=>void;
}){
  const {pathname,search}=useLocation();
  const params=new URLSearchParams(search);
  const rawPage=params.get('page')??'1';
  const page=/^[1-9]\d{0,3}$/.test(rawPage)&&Number(rawPage)<=1000&&!course?Number(rawPage):1;
  const filters=new URLSearchParams();
  if(course)filters.set('course',String(course));
  if(category)filters.set('category',String(category));
  if(query)filters.set('term',query);
  if(page!==1)filters.set('page',String(page));
  const key=filters.toString();

  return <CatalogPage key={key} userId={userId} filters={key} page={page} pathname={pathname}
    query={query} course={course} joined={joined} onJoined={onJoined}/>;
}

function CatalogPage({userId,filters,page,pathname,query,course,joined,onJoined}:{
  userId:string;filters:string;page:number;pathname:string;query:string;course?:number;joined?:string;onJoined?:()=>void;
}){
  const [data,setData]=useState<ElearningCatalog|null>(null);
  const [error,setError]=useState(false);
  const [attempt,setAttempt]=useState(0);
  useEffect(()=>{
    const controller=new AbortController();
    void searchElearning(userId,new URLSearchParams(filters),controller.signal).then(result=>{
      if(!controller.signal.aborted)setData(result);
    }).catch(()=>{if(!controller.signal.aborted)setError(true);});
    return ()=>controller.abort();
  },[userId,filters,attempt]);

  function toPage(number:number){
    const params=new URLSearchParams();
    if(query)params.set('q',query);
    if(number!==1)params.set('page',String(number));
    return {pathname,search:params.toString()};
  }
  if(error)return <p role="alert">無法讀取課程。 <button type="button" onClick={()=>{setError(false);setAttempt(value=>value+1);}}>重試</button></p>;
  if(!data)return <p role="status">讀取課程…</p>;
  if(course){
    const item=data.courses.find(row=>row.id===course);
    return item&&onJoined?<CourseView course={item} userId={userId} joined={joined} onJoined={onJoined}/>
      :<><h2>找不到課程</h2><Link to={path+'/categories'}>返回課程類別</Link></>;
  }
  const pageCount=Math.ceil(data.total/elearningCatalogPageSize);
  if(pageCount&&page>pageCount)return <p>此頁沒有課程。 <Link to={toPage(pageCount)}>前往最後一頁</Link></p>;
  return <>
    <CourseList courses={data.courses}/>
    {pageCount>1&&<nav aria-label="課程分頁" className="elearning-pagination">
      {page>1&&<Link to={toPage(page-1)}>上一頁</Link>}
      <span>第 {page} / {pageCount} 頁（{data.total} 門課程）</span>
      {page<pageCount&&<Link to={toPage(page+1)}>下一頁</Link>}
    </nav>}
  </>;
}
function Content({data,userId,reload}:{data:Workspace;userId:string;reload:()=>void}){
  const {pathname,search}=useLocation();
  const segments=pathname.replace(/\/$/,'').slice(path.length).split('/').filter(Boolean);
  const [view,value]=segments;
  const id=Number(value);
  const [expanded,setExpanded]=useState(true);
  const navigate=useNavigate();
  if(!view)return <>
    <section id="elearning-notices"><h2>系統公告</h2><ul className="elearning-notices">{data.notices.map(notice=><li key={notice.id}>
      <span aria-hidden="true" className={'elearning-file '+notice.kind}>{notice.kind==='folder'?'▣':'▤'}</span>
      <Link to={noticeLink(notice.id)} className={[325504,305241,329224].includes(notice.id)?'elearning-important':undefined}>{notice.title}</Link>
    </li>)}</ul></section>
    <section className="elearning-category-section"><h2>課程類別</h2>
      <button className="elearning-collapse" type="button" onClick={()=>setExpanded(current=>!current)}>{expanded?'全部縮合':'全部展開'}</button>
      <CategoryTree rows={data.categories} expanded={expanded}/>
      <p><Link to={path+'/categories'}>觀看更多</Link></p><SearchBox/>
    </section>
  </>;
  if(view==='categories'&&segments.length===1)return <><h2>課程類別</h2><CategoryTree rows={data.categories} expanded/><SearchBox/></>;
  if(view==='my-courses'&&segments.length===1){
    const ids=new Set(data.enrollments.map(row=>row.courseId));
    return <><h2>我的課程</h2><CourseList courses={data.courses.filter(course=>ids.has(course.id))}/></>;
  }
  if(view==='search'&&segments.length===1){
    const query=(new URLSearchParams(search).get('q')??'').slice(0,100).trim();
    return <><h2>搜尋課程</h2><SearchBox key={query} initial={query}/>
      <CatalogResults userId={userId} query={query}/></>;
  }
  if(view==='category'&&segments.length===2){
    const category=data.categories.find(row=>row.id===id);
    if(category)return <><h2>{category.title}</h2><label>課程類別: <select value={id} onChange={event=>navigate(categoryLink(Number(event.target.value)))}>
      {data.categories.map(row=><option key={row.id} value={row.id}>{row.title}</option>)}</select></label><SearchBox/>
      <CategoryTree rows={data.categories} parent={id} expanded/>
      <CatalogResults userId={userId} category={id}/>
      {external(elearningOrigin+'/course/index.php?categoryid='+id,'瀏覽校方課程類別')}
    </>;
  }
  if(view==='notice'&&segments.length===2){
    const notice=data.notices.find(row=>row.id===id);
    if(notice)return <><h2>{notice.title}</h2>{notice.local_body&&<p>{notice.local_body}</p>}
      {notice.id===325504&&<p>{external('https://tc.stu.edu.tw/','TronClass創課 入口網站')}</p>}
      <p>{external(elearningOrigin+'/mod/'+notice.kind+'/view.php?id='+id,'在校方 Moodle 開啟')}</p></>;
  }
  if(view==='course'&&segments.length===2&&/^[1-9]\d{0,9}$/.test(value)&&id<=2147483647)
    return <CatalogResults userId={userId} course={id} joined={data.enrollments.find(row=>row.courseId===id)?.joinedAt} onJoined={reload}/>;
  return <><h2>找不到頁面</h2><Link to={path}>返回首頁</Link></>;
}
function Session({userId,account}:{userId:string;account:string}){
  const location=useLocation(),navigate=useNavigate();
  const [data,setData]=useState<Workspace|null>(null),[revision,setRevision]=useState(0),[error,setError]=useState('');
  const [loggingOut,setLoggingOut]=useState(false),[logoutError,setLogoutError]=useState('');
  useEffect(()=>{
    const controller=new AbortController();
    void loadElearning(userId,controller.signal).then(result=>{if(!controller.signal.aborted)setData(result);},
      reason=>{if(!controller.signal.aborted)setError(reason instanceof Error?reason.message:'讀取失敗。');});
    return ()=>controller.abort();
  },[userId,revision]);
  function reload(){setData(null);setError('');setRevision(current=>current+1);}
  async function logout(){
    if(loggingOut)return;
    setLoggingOut(true);setLogoutError('');
    try{await signOutAffairs();navigate(path+'/login',{replace:true});}
    catch{setLogoutError('無法登出，請重試。');setLoggingOut(false);}
  }
  const home=location.pathname.replace(/\/$/,'')===path;
  const detail=!home;
  return <div className="elearning-root" lang="zh-Hant"><div className="elearning-frame">
    <a href="#elearning-main" className="elearning-skip">跳到主要內容</a>
    <Header account={account} onSignOut={()=>void logout()} loggingOut={loggingOut} home={home}/>
    {detail&&<nav className="elearning-breadcrumb" aria-label="頁面路徑"><Link to={path}>首頁</Link> ▸ <Link to={path+'/categories'}>課程</Link></nav>}
    {logoutError&&<p role="alert">{logoutError}</p>}
    <div className={'elearning-layout'+(detail?' detail':'')}><LeftColumn/><main id="elearning-main" className="elearning-content">
      {error?<div role="alert"><p>{error}</p><button type="button" onClick={reload}>重試</button></div>:data
        ?<Content data={data} userId={userId} reload={reload}/>:<p role="status">讀取數位學園…</p>}
    </main>{home&&<RightColumn/>}</div>
    <Footer account={account}/>
  </div></div>;
}
export default function ElearningWorkspace(){
  const {user,loading,error}=useAffairsAuth();
  const {pathname,search}=useLocation();
  const isLogin=pathname.replace(/\/$/,'')===path+'/login';
  const requested=safeSchoolReturnPath(isLogin?new URLSearchParams(search).get('next'):pathname,path);
  const next=requested===path||requested.startsWith(path+'/')?requested:path;
  useEffect(()=>{document.title=siteTitle;},[]);
  if(loading)return <main className="elearning-root" role="status">讀取數位學園…</main>;
  if(user&&isLogin)return <Navigate replace to={next}/>;
  if(!user&&!isLogin)return <Navigate replace to={{pathname:path+'/login',search:new URLSearchParams({next}).toString()}}/>;
  if(!user)return <Login next={next} error={error}/>;
  return <Session key={user.id} userId={user.id} account={user.email??'Google'}/>;
}
