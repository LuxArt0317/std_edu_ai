import { useEffect, useState, type ReactNode } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router';
import { Bell, ChevronRight, ExternalLink, FileText, Globe, LogOut, MessageSquare, Search, UserRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import type { DtmCourse } from '@/services/schoolAffairsWorkspace';
import { useAffairsAuth } from '../affairs/authContext';
import { safeSchoolReturnPath, signOutAffairs, startGoogleSignIn } from '../affairs/authClient';
import { useAffairsRecords } from '../affairs/useAffairsRecords';
import { officialRegistrarUrl, wifiGuidePath } from '../affairs/studentServices.js';
import { announcements, categories, coursesByTerm, dtmViews, observedAt, otherCategories, quickLinks, type DtmView } from './catalog';
import { DtmStudentRecords } from './DtmStudentRecords';
import { termLabel, useDtmLocale, type DtmLocale, type DtmTranslate } from './locale';
import './digital-materials.css';

const brand = '數位教材網 Digital Teaching Materials (教材上網平台)';
const official = 'https://dtm.stu.edu.tw/';
const courseHref = (id:string) => '/dtm/course/'+encodeURIComponent(id);

type DtmRoute = {mode:'home'|'login'|'dashboard'|'assignments'|'grades'|'course'|'missing';id?:string;view?:DtmView};
function dtmRoute(pathname:string):DtmRoute {
  const path = pathname.replace(/^\/school-sites\/dtm\.stu\.edu\.tw/,'/dtm').replace(/\/$/,'');
  if (path==='/dtm/login'||path==='/dtm/login/index.php') return {mode:'login'};
  if (path==='/dtm') return {mode:'home'};
  if (path==='/dtm/dashboard'||path==='/dtm/my') return {mode:'dashboard'};
  if (path==='/dtm/assignments') return {mode:'assignments'};
  if (path==='/dtm/grades') return {mode:'grades'};
  const course = /^\/dtm\/course\/([a-zA-Z0-9-]+)(?:\/([a-z]+))?$/.exec(path);
  if (course && (!course[2] || dtmViews.includes(course[2] as DtmView)))
    return {mode:'course',id:course[1],view:(course[2]||'materials') as DtmView};
  return {mode:'missing'};
}

function OfficialLink({href,children}:{href:string;children:ReactNode}) {
  return <a href={href} target="_blank" rel="noopener noreferrer">{children} <ExternalLink size={13} aria-hidden="true"/></a>;
}

function Navigation({courses,t}:{courses:DtmCourse[];t:DtmTranslate}) {
  return <aside className="dtm-left" aria-label={t('數位教材網導覽','DTM navigation')}>
    <section className="dtm-card">
      <h2>{t('重要消息','Important information')}</h2>
      <p><strong>{t('遠距教學課程','Online classes')}</strong> <OfficialLink href="https://tc.stu.edu.tw/">{t('請使用 TronClass 創課','Use TronClass')}</OfficialLink></p>
      <p>{t('校方數位教材網主要存放實體課程教材。','The university DTM site primarily hosts materials for in-person classes.')}</p>
    </section>
    <nav className="dtm-card dtm-navigation" aria-label={t('我的課程選單','My courses navigation')}>
      <h2>{t('導覽','Navigation')}</h2>
      <Link to="/dtm">{t('首頁','Home')}</Link>
      <Link to="/dtm/dashboard">{t('儀表板','Dashboard')}</Link>
      <Link to="/dtm/assignments">{t('我的作業','My assignments')}</Link>
      <Link to="/dtm/grades">{t('我的成績','My grades')}</Link>
      <details className="dtm-tree" open>
        <summary>{t('我的課程','My courses')}</summary>
        {coursesByTerm(courses).map(([term,rows])=><details key={term} open={rows.some(course=>course.sourceMode==='personal')}>
          <summary>{termLabel(term,t)}</summary>
          <ul>{rows.map(course=><li key={course.id}><Link to={courseHref(course.id)}>{course.title}</Link></li>)}</ul>
        </details>)}
      </details>
    </nav>
    <section className="dtm-card">
      <h2>{t('教學專區－教師','Teaching guides for instructors')}</h2>
      <OfficialLink href={official+'mod/url/view.php?id=611329'}>{t('教材上傳教學','Upload materials')}</OfficialLink>
      <OfficialLink href={official+'mod/url/view.php?id=34355'}>{t('Moodle 使用教學','Moodle guide')}</OfficialLink>
    </section>
    <section className="dtm-card">
      <h2>{t('教學專區－學生','Teaching guides for students')}</h2>
      <OfficialLink href={official+'mod/url/view.php?id=34355'}>{t('Moodle 使用教學','Moodle guide')}</OfficialLink>
      <OfficialLink href="https://tc.stu.edu.tw/">{t('TronClass 平台','TronClass')}</OfficialLink>
    </section>
  </aside>;
}

function Resources({t}:{t:DtmTranslate}) {
  return <aside className="dtm-right" aria-label={t('教材網資源','DTM resources')}>
    <section className="dtm-card">
      <h2>{t('快速連結','Quick links')}</h2>
      {quickLinks.map(([zh,url,en])=>url.startsWith('/')?<Link key={url} to={url}>{t(zh,en)}</Link>:<OfficialLink key={url} href={url}>{t(zh,en)}</OfficialLink>)}
      <Link to={wifiGuidePath}>{t('校園無線網路設定','Campus Wi-Fi setup')}</Link>
      <OfficialLink href={official}>{t('校方數位教材網','University Moodle')}</OfficialLink>
    </section>
    <section className="dtm-card">
      <h2>{t('聯絡方式','Contacts')}</h2>
      <p><strong>{t('註冊與選課','Registration and course enrollment')}</strong><br/>07-6158000 #2012</p>
      <p><strong>{t('教材上網','Course materials')}</strong><br/>07-6158000 #2010</p>
      <p><strong>{t('系統問題','Technical support')}</strong><br/>07-6158000 #2440<br/><a href="mailto:service@stu.edu.tw">service@stu.edu.tw</a></p>
      <OfficialLink href={officialRegistrarUrl}>{t('教務處註冊課務組','Registration and Curriculum Division')}</OfficialLink>
    </section>
    <section className="dtm-card">
      <h2>{t('電腦軟硬體規格需求','System requirements')}</h2>
      <p>{t('使用目前版本的瀏覽器與網路即可開啟教材。','Use a current web browser with an internet connection to open materials.')}</p>
    </section>
  </aside>;
}

function DtmHome({courses,t}:{courses:DtmCourse[];t:DtmTranslate}) {
  const [search,setSearch] = useState('');
  const [expanded,setExpanded] = useState<number[]>([1]);
  const matching = courses.filter(course=>[course.code,course.title,course.term,termLabel(course.term,t)].join(' ').toLowerCase().includes(search.trim().toLowerCase()));
  return <>
    <h2 id="dtm-announcements">{t('系統公告','System announcements')}</h2>
    <p className="dtm-reference-note">{t('校方公告標題，查閱於 '+observedAt+'。','University notice titles checked '+observedAt+'.')}</p>
    <ul className="dtm-notices">
      {announcements.map(([zh,url,en],index)=><li key={url} className={index<2?'dtm-important':undefined}>
        {url.includes('/mod/url/')?<Globe size={18} aria-hidden="true"/>:<FileText size={18} aria-hidden="true"/>}
        <OfficialLink href={url}>{t(zh,en)}</OfficialLink>
      </li>)}
    </ul>
    <div className="dtm-section-heading">
      <h2>{t('課程類別','Course categories')}</h2>
      <Button size="sm" variant="ghost" onClick={()=>setExpanded(expanded.length?[]:categories.map(([, , id])=>id))}>
        {expanded.length?t('全部縮合','Collapse all'):t('全部展開','Expand all')}
      </Button>
    </div>
    <div className="dtm-categories">
      {categories.map(([label,count,id])=><details key={id} open={expanded.includes(id)} onToggle={event=>{
        const open=event.currentTarget.open;
        setExpanded(current=>current.includes(id)===open?current:open?[...current,id]:current.filter(item=>item!==id));
      }}>
        <summary>{id===1?t('其他','Other courses'):termLabel(label,t)}{count>0&&<small> ({count.toLocaleString()})</small>}</summary>
        <div className="dtm-category-body">
          {id===1&&<ul className="dtm-other-categories">{otherCategories.map(([zh,en,categoryId,total])=>
            <li key={categoryId}><OfficialLink href={official+'course/index.php?categoryid='+categoryId}>{t(zh,en)}{total>0?' ('+total+')':''}</OfficialLink></li>)}</ul>}
          {matching.filter(course=>course.term===label).map(course=><Link className="dtm-course-link" to={courseHref(course.id)} key={course.id}>{course.title}<ChevronRight size={16}/></Link>)}
          <OfficialLink href={official+'course/index.php?categoryid='+id}>{t('開啟校方課程類別','Open university category')}</OfficialLink>
        </div>
      </details>)}
    </div>
    <OfficialLink href={official+'course/index.php?browse=categories&page=1&categoryid=0'}>{t('查看所有校方課程類別','See all university course categories')}</OfficialLink>
    <label className="dtm-search"><Search size={18} aria-hidden="true"/>{t('搜尋我的課程','Search my courses')}
      <input type="search" value={search} onChange={event=>setSearch(event.target.value)} placeholder={t('代碼或課程名稱','Code or course name')}/>
    </label>
    {search.trim()&&<div className="dtm-search-results">{matching.length
      ? matching.map(course=><Link className="dtm-course-link" to={courseHref(course.id)} key={course.id}>{course.code} · {course.title}</Link>)
      : <p>{t('沒有符合的課程。','No matching saved courses.')}</p>}</div>}
  </>;
}

function SignedInWorkspace({userId,route,t,hash}:{userId:string;route:DtmRoute;t:DtmTranslate;hash:string}) {
  const {snapshot,error,loading,refresh}=useAffairsRecords(userId);
  const selected=snapshot?.dtm.courses.find(course=>course.id===route.id);
  useEffect(()=>{
    if (!snapshot || !/^#[a-z0-9_-]+$/i.test(hash)) return;
    const frame=requestAnimationFrame(()=>document.getElementById(hash.slice(1))?.scrollIntoView({block:'nearest'}));
    return ()=>cancelAnimationFrame(frame);
  },[snapshot,hash,route.mode,route.view]);
  return <>
    {error&&<div role="alert" className="dtm-error">{error} <Button size="sm" variant="outline" onClick={refresh}>{t('重試','Retry')}</Button></div>}
    {loading&&!snapshot&&<p role="status">{t('載入課程紀錄中…','Loading course records…')}</p>}
    {snapshot&&<div className={'dtm-columns'+(route.mode==='home'?'':' dtm-columns-course')}>
      <Navigation courses={snapshot.dtm.courses} t={t}/>
      <section className="dtm-center" aria-label={t('教材網內容','Digital teaching materials content')}>
        {route.mode==='home'?<DtmHome courses={snapshot.dtm.courses} t={t}/>
          :route.mode==='missing'||(route.mode==='course'&&!selected)
            ?loading?<p role="status">{t('載入課程中…','Loading course…')}</p>:<div className="dtm-card"><h2>{t('找不到課程或頁面','Course or page unavailable')}</h2>
              <p>{t('請從您的儀表板選擇一門課。','Choose a course from your dashboard.')}</p><Link to="/dtm/dashboard">{t('前往儀表板','Open dashboard')}</Link></div>
            :route.mode!=='login'&&<DtmStudentRecords key={route.mode+':'+(route.id||'')+':'+(route.view||'')} snapshot={snapshot}
              course={selected} view={route.view} mode={route.mode} t={t} refresh={refresh}/>}
      </section>
      {route.mode==='home'&&<Resources t={t}/>}
    </div>}
  </>;
}

export default function DigitalMaterials() {
  const {pathname,search,hash}=useLocation();
  const route=dtmRoute(pathname);
  const navigate=useNavigate();
  const {user,loading}=useAffairsAuth();
  const {locale,changeLocale,t}=useDtmLocale();
  const [error,setError]=useState('');
  const [busy,setBusy]=useState(false);
  const next=safeSchoolReturnPath(new URLSearchParams(search).get('next'),'/dtm');
  const returnTo=next.startsWith('/dtm')?next:'/dtm';

  useEffect(()=>{document.title=brand+' · stu.best';},[]);
  if (loading) return <main className="dtm-loading" role="status">{t('正在確認 Google 登入…','Checking your Google session…')}</main>;
  if (user&&route.mode==='login') return <Navigate to={returnTo} replace/>;
  if (!user&&route.mode!=='login') {
    const target=safeSchoolReturnPath(pathname+hash,'/dtm');
    return <Navigate to={target==='/dtm'?'/dtm/login':'/dtm/login?next='+encodeURIComponent(target)} replace/>;
  }
  async function signIn() {
    setBusy(true);
    setError('');
    try {await startGoogleSignIn(returnTo);}
    catch (reason) {setError(reason instanceof Error?reason.message:t('無法開啟 Google 登入。','Could not start Google sign-in.'));setBusy(false);}
  }
  async function signOut() {
    setBusy(true);
    setError('');
    try {await signOutAffairs();navigate('/dtm/login',{replace:true});}
    catch (reason) {setError(reason instanceof Error?reason.message:t('登出失敗。','Sign out failed.'));}
    finally {setBusy(false);}
  }
  return <div className="dtm" lang={locale}>
    <a className="dtm-skip" href="#dtm-content">{t('跳至主內容','Skip to main content')}</a>
    <header className="dtm-top">
      <Link to="/dtm" className="dtm-brand">{brand}</Link>
      <label className="dtm-language"><span className="sr-only">Language / 語言</span>
        <select value={locale} onChange={event=>changeLocale(event.target.value as DtmLocale)}>
          <option value="zh-Hant" lang="zh-Hant">正體中文 (zh_tw)</option>
          <option value="en" lang="en">English (en)</option>
        </select>
      </label>
      <div className="dtm-top-account">{user?<>
        <Link className="dtm-top-icon" to="/dtm#dtm-announcements" aria-label={t('系統公告','System announcements')}><Bell size={19}/></Link>
        <a className="dtm-top-icon" href={official+'message/index.php'} target="_blank" rel="noopener noreferrer"
          aria-label={t('在校方 Moodle 開啟訊息','Open university Moodle messages')}><MessageSquare size={19}/></a>
        <DropdownMenu>
          <DropdownMenuTrigger asChild><Button variant="ghost" className="dtm-user"><UserRound size={20}/><span>{user.user_metadata?.full_name||user.email||'Google'}</span></Button></DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem asChild><Link to="/dtm/dashboard">{t('儀表板','Dashboard')}</Link></DropdownMenuItem>
            <DropdownMenuItem asChild><Link to="/dtm/grades">{t('我的成績','My grades')}</Link></DropdownMenuItem>
            <DropdownMenuItem onSelect={()=>void signOut()} disabled={busy}><LogOut size={16}/>{t('登出','Sign out')}</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </>:t('您尚未登入。','You are not logged in.')}</div>
    </header>
    <main className="dtm-main" id="dtm-content" tabIndex={-1}>
      <h1>{t('數位教材網 DIGITAL TEACHING MATERIALS (教材上網平台)','Digital Teaching Materials')}</h1>
      {route.mode!=='home'&&<nav className="dtm-breadcrumb" aria-label={t('頁面位置','Breadcrumb')}>
        <Link to="/dtm">{t('首頁','Home')}</Link><ChevronRight size={16} aria-hidden="true"/>
        {route.mode==='login'?t('登入網站','Log in to the site'):route.mode==='course'
          ? <Link to="/dtm/dashboard">{t('我的課程','My courses')}</Link>
          : t('我的教材網','My DTM workspace')}
      </nav>}
      {error&&<p role="alert" className="dtm-error">{error}</p>}
      {!user?<section className="dtm-login">
        <h2>{t('登入數位教材網','Sign in to Digital Teaching Materials')}</h2>
        <p>{t('使用您的 Google 帳號開啟 stu.best 教材、作業與成績紀錄。','Use your Google account to open your materials, assignments and grade records on stu.best.')}</p>
        <Button size="lg" onClick={()=>void signIn()} disabled={busy}><img src="/auth/google-g.png" alt="" width="20" height="20"/>{busy?t('連線中…','Opening Google…'):'Continue with Google'}</Button>
        <p className="dtm-note">{t('校方教材與正式成績請使用校方數位教材網。','Use university Moodle for official materials and grades.')}</p>
        <p><OfficialLink href={official}>{t('開啟校方 Moodle','Open university Moodle')}</OfficialLink> · <Link to="/school-affairs/login">{t('校務系統','School Affairs')}</Link></p>
      </section>:<SignedInWorkspace key={user.id} userId={user.id} route={route} t={t} hash={hash}/>}
    </main>
    <footer className="dtm-footer">
      <span>{t('數位教材網 · stu.best 獨立學生工作區','Digital Teaching Materials · Independent stu.best student workspace')}</span>
      <Link to="/school-affairs/privacy">{t('帳號與隱私','Account and privacy')}</Link>
    </footer>
  </div>;
}
