import { useEffect, useState, type ReactNode } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router';
import { Bell, ChevronDown, ChevronRight, ExternalLink, LogOut, MessageSquare, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import type { DtmAssignment, DtmCourse } from '@/services/schoolAffairsWorkspace';
import { useAffairsAuth } from '../affairs/authContext';
import { safeSchoolReturnPath, signOutAffairs, startGoogleSignIn } from '../affairs/authClient';
import { useAffairsRecords } from '../affairs/useAffairsRecords';
import { campusAssistantOpenEvent } from '../PublicAssistant';
import { announcements, categories, coursesByTerm, dtmViews, observedAt, otherCategories, quickLinks, type DtmView } from './catalog';
import { DtmStudentRecords } from './DtmStudentRecords';
import { DtmSubmissionWorkspace } from './DtmSubmissionWorkspace';
import { termLabel, useDtmLocale, type DtmLocale, type DtmTranslate } from './locale';
import './digital-materials.css';

const brand = '數位教材網 Digital Teaching Materials (教材上網平台)';
const official = 'https://dtm.stu.edu.tw/';
const courseHref = (id:string) => '/dtm/course/'+encodeURIComponent(id);
const navigationTerms = categories.map(([term])=>term).filter(term=>/^11[2-5]學年度第[12]學期$/.test(term));

type DtmRoute = {mode:'home'|'login'|'dashboard'|'assignments'|'grades'|'course'|'missing';id?:string;view?:DtmView;assignmentId?:string;submissionView?:'detail'|'edit'};
function dtmRoute(pathname:string):DtmRoute {
  const path = pathname.replace(/^\/school-sites\/dtm\.stu\.edu\.tw/,'/dtm').replace(/\/$/,'');
  if (path==='/dtm/login'||path==='/dtm/login/index.php') return {mode:'login'};
  if (path==='/dtm') return {mode:'home'};
  if (path==='/dtm/dashboard'||path==='/dtm/my') return {mode:'dashboard'};
  if (path==='/dtm/assignments') return {mode:'assignments'};
  if (path==='/dtm/grades') return {mode:'grades'};
  const assignment=/^\/dtm\/course\/([a-zA-Z0-9-]+)\/assignment\/([a-zA-Z0-9-]+)(\/edit)?$/.exec(path);
  if(assignment)return {mode:'course',id:assignment[1],view:'assignments',assignmentId:assignment[2],submissionView:assignment[3]?'edit':'detail'};
  const course = /^\/dtm\/course\/([a-zA-Z0-9-]+)(?:\/([a-z]+))?$/.exec(path);
  if (course && (!course[2] || dtmViews.includes(course[2] as DtmView)))
    return {mode:'course',id:course[1],view:(course[2]||'materials') as DtmView};
  return {mode:'missing'};
}

function OfficialLink({href,children,icon = false}:{href:string;children:ReactNode;icon?:boolean}) {
  return <a href={href} target="_blank" rel="noopener noreferrer">{children}{icon && <> <ExternalLink size={13} aria-hidden="true"/></>}</a>;
}

function Navigation({courses,home,selected,view,displayName,t}:{courses:DtmCourse[];home:boolean;selected?:DtmCourse;view?:DtmView;displayName:string;t:DtmTranslate}) {
  const [membersOpen,setMembersOpen]=useState(false);
  const ownTerms = new Map(coursesByTerm(courses));
  const terms = [...new Set<string>([...navigationTerms,...ownTerms.keys()])]
    .sort((a,b)=>b.localeCompare(a,undefined,{numeric:true}));
  return <aside className="dtm-left" aria-label={t('數位教材網導覽','DTM navigation')}>
    {(home||selected) && <section className="dtm-card dtm-important-information">
      <h2>{t('重要消息','Important information')}</h2>
      <p><strong>{t('遠距教學課程','Online classes')}</strong>{t('請到',' use ')} <OfficialLink href="https://tc.stu.edu.tw/">{t('>>TronClass創課<<','TronClass')}</OfficialLink></p>
      <p>{t('本平台只存放','This platform hosts ')}<strong>{t('實體課程','in-person courses')}</strong></p>
    </section>}
    <nav className="dtm-card dtm-navigation" aria-label={t('我的課程選單','My courses navigation')}>
      <h2><i className="dtm-navigation-icon" aria-hidden="true">{'\uf0e8'}</i>{t('導覽','Navigation')}</h2>
      <Link className="dtm-tree-home" to="/dtm">{t('首頁','Home')}</Link>
      <Link className="dtm-tree-page" to="/dtm/dashboard">{t('儀表板','Dashboard')}</Link>
      <details className="dtm-tree">
        <summary>{t('網站頁面','Site pages')}</summary>
        <ul><li><Link to="/dtm#dtm-announcements">{t('系統公告','System announcements')}</Link></li></ul>
      </details>
      <details className="dtm-tree" open>
        <summary>{t('我的課程','My courses')}</summary>
        {terms.map(term=><details key={term} open={selected?.term===term}>
          <summary>{termLabel(term,t)}</summary>
          {ownTerms.has(term)
            ? <ul>{ownTerms.get(term)?.map(course=><li key={course.id}>{selected?.id===course.id
              ? <details className="dtm-tree-selected" open><summary>{course.title}</summary>
                <ul><li><button className="dtm-tree-member" type="button" onClick={()=>setMembersOpen(true)}>{t('成員','Participants')}</button></li>
                  <li><Link to={courseHref(course.id)+'/grades'} aria-current={view==='grades'?'page':undefined}>{t('成績','Grades')}</Link></li></ul>
              </details>
              :<Link to={courseHref(course.id)}>{course.title}</Link>}</li>)}</ul>
            : <p className="dtm-tree-empty">{t('此學期沒有已儲存的課程。','No saved courses for this term.')}</p>}
        </details>)}
      </details>
    </nav>
    {home && <>
    <section className="dtm-card">
      <h2>{t('教學專區－教師','Teaching guides for instructors')}</h2>
      <OfficialLink href={official+'mod/url/view.php?id=611329'}>{t('教材上傳教學','Upload materials')}</OfficialLink>
      <OfficialLink href={official+'mod/url/view.php?id=34355'}>{t('Moodle使用教學','Moodle guide')}</OfficialLink>
      <OfficialLink href="https://tc.stu.edu.tw/">{t('TronClass平台使用教學(教師版)','TronClass guide for instructors')}</OfficialLink>
    </section>
    <section className="dtm-card">
      <h2>{t('教學專區－學生','Teaching guides for students')}</h2>
      <OfficialLink href={official+'mod/url/view.php?id=34355'}>{t('Moodle使用教學','Moodle guide')}</OfficialLink>
      <OfficialLink href="https://tc.stu.edu.tw/">{t('TronClass平台使用教學(學生版)','TronClass guide for students')}</OfficialLink>
    </section>
    </>}
    {selected&&view==='grades'&&<section className="dtm-card dtm-grade-navigation">
      <h2>{t('管理','Administration')}</h2><details className="dtm-tree" open><summary>{t('成績管理','Grade administration')}</summary>
        <ul><li><Link to="/dtm/grades">{t('綜覽報告','Overview report')}</Link></li><li><Link to={courseHref(selected.id)+'/grades'} aria-current="page">{t('用戶報告','User report')}</Link></li></ul>
      </details>
    </section>}
    {selected&&<Contacts t={t}/>}
    <Dialog open={membersOpen} onOpenChange={setMembersOpen}><DialogContent>
      <DialogHeader><DialogTitle>{t('成員','Participants')}</DialogTitle><DialogDescription>{t('此課程的個人紀錄帳號。','The account associated with these personal course records.')}</DialogDescription></DialogHeader>
      <p>{displayName}</p>
    </DialogContent></Dialog>
  </aside>;
}

function Contacts({t}:{t:DtmTranslate}) {
  return <section className="dtm-card dtm-contacts">
      <h2>{t('聯絡方式','Contacts')}</h2>
      <p><strong>{t('一般生、校際選課生','Registration and course enrollment')}</strong>{t('請洽教務處註冊課務組: ',': ')}07-6158000#2012</p>
      <p><strong>{t('教材上網','Course materials')}</strong>{t('請洽教務處註冊課務組: ',': ')}07-6158000#2010</p>
      <p><strong>{t('學分班學員','Credit courses')}</strong>{t('請洽推廣教育中心: ',': ')}07-6158000#2505</p>
      <p><strong>{t('碩習生','International affairs')}</strong>{t('請洽國際與兩岸事務處: ',': ')}07-6158000#1612</p>
      <p><strong>{t('系統問題','Technical support')}</strong>{t('請洽電算中心: ',': ')}07-6158000#2440<br/>{t('或 ','or ')}<a href="mailto:service@stu.edu.tw">service@stu.edu.tw</a>{t('（非上班時間請寫信）',' (email outside office hours)')}</p>
    </section>;
}

function Resources({t}:{t:DtmTranslate}) {
  return <aside className="dtm-right" aria-label={t('教材網資源','DTM resources')}>
    <section className="dtm-card">
      <h2>{t('快速連結','Quick links')}</h2>
      {quickLinks.map(([zh,url,en])=>url.startsWith('/')?<Link key={url} to={url}>{t(zh,en)}</Link>:<OfficialLink key={url} href={url}>{t(zh,en)}</OfficialLink>)}
    </section>
    <Contacts t={t}/>
    <section className="dtm-card">
      <h2>{t('電腦軟硬體規格需求','System requirements')}</h2>
      <p><b>{t('軟硬體需求：','Software and hardware')}</b><br/>{t('Moodle 可在電腦或行動裝置的瀏覽器中使用，無需安裝其他軟體。','Open Moodle in a desktop or mobile browser. No additional software is required.')}</p>
      <p><b>{t('瀏覽器版本需求：','Browser')}</b><br/>{t('請使用目前版本的 Firefox、Safari 或 Chrome。','Use a current version of Firefox, Safari or Chrome.')}</p>
      <p><b>{t('網路頻寬需求：','Internet connection')}</b><br/>{t('教材播放建議使用穩定的網路連線。','Use a stable internet connection for playback.')}</p>
      <p><b>{t('教材播放軟體需求：','Media playback')}</b><br/>{t('雲端硬碟教材可在瀏覽器中開啟。','Open cloud-hosted materials directly in your browser.')}</p>
    </section>
  </aside>;
}

function DtmHome({courses,t}:{courses:DtmCourse[];t:DtmTranslate}) {
  const [search,setSearch] = useState('');
  const [expanded,setExpanded] = useState<number[]>([1]);
  const matching = courses.filter(course=>[course.code,course.title,course.term,termLabel(course.term,t)].join(' ').toLowerCase().includes(search.trim().toLowerCase()));
  return <>
    <h2 id="dtm-announcements">{t('系統公告','System announcements')}</h2>
    <ul className="dtm-notices">
      {announcements.map(([zh,url,en],index)=><li key={url} className={index<2?'dtm-important':undefined}>
        <img src={url.includes('/mod/url/')?'/dtm-theme/url.svg':'/dtm-theme/page.svg'} width="24" height="24" alt=""/>
        <OfficialLink href={url}>{t(zh,en)}</OfficialLink>
      </li>)}
    </ul>
    <div className="dtm-category-heading">
      <h2>{t('課程類別','Course categories')}</h2>
      <Button size="sm" variant="ghost" onClick={()=>setExpanded(expanded.length?[]:categories.map(([, , id])=>id))}>
        {expanded.length?<ChevronDown aria-hidden="true"/>:<ChevronRight aria-hidden="true"/>}
        {expanded.length?t('全部縮合','Collapse all'):t('全部展開','Expand all')}
      </Button>
    </div>
    <div className="dtm-categories">
      {categories.map(([label,count,id])=><details key={id} open={expanded.includes(id)} onToggle={event=>{
        const open=event.currentTarget.open;
        setExpanded(current=>current.includes(id)===open?current:open?[...current,id]:current.filter(item=>item!==id));
      }}>
        <summary>{id===1?t('其它','Other courses'):termLabel(label,t)}{count>0&&<small> ({count})</small>}</summary>
        <div className="dtm-category-body">
          {id===1&&<ul className="dtm-other-categories">{otherCategories.map(([zh,en,categoryId,total])=>
            <li key={categoryId}><OfficialLink href={official+'course/index.php?categoryid='+categoryId}>{t(zh,en)}{total>0?' ('+total+')':''}</OfficialLink></li>)}</ul>}
          {matching.filter(course=>course.term===label).map(course=><Link className="dtm-course-link" to={courseHref(course.id)} key={course.id}>{course.title}<ChevronRight size={16}/></Link>)}
          {id!==1 && <OfficialLink href={official+'course/index.php?categoryid='+id}>{t('開啟校方課程類別','Open university category')}</OfficialLink>}
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

function WorkspaceHeader({route,course,assignment,displayName,t}:{route:DtmRoute;course?:DtmCourse;assignment?:DtmAssignment;displayName:string;t:DtmTranslate}) {
  return <>
    {route.mode==='dashboard'?<header className="dtm-dashboard-header">
      <img className="dtm-avatar" src="/dtm-theme/user-large.png" alt="" width="100" height="100"/><h1>{displayName}</h1>
    </header>:<h1>{course?course.title+(route.view==='grades'?t(': 瀏覽: 用戶報告',': View: User report'):''):t('數位教材網 DIGITAL TEACHING MATERIALS (教材上網平台)','Digital Teaching Materials')}</h1>}
    {route.mode!=='home'&&<nav className="dtm-breadcrumb" aria-label={t('頁面位置','Breadcrumb')}>
      <Link to="/dtm">{t('首頁','Home')}</Link><ChevronRight size={16} aria-hidden="true"/>
      {course?<>
        <Link to="/dtm/dashboard">{t('我的課程','My courses')}</Link><ChevronRight size={16} aria-hidden="true"/>
        <Link to="/dtm/dashboard">{termLabel(course.term,t)}</Link><ChevronRight size={16} aria-hidden="true"/>
        <Link to={courseHref(course.id)} aria-current={route.view==='materials'?'page':undefined}>{course.code}</Link>
        {route.view==='grades'&&<><ChevronRight size={16} aria-hidden="true"/><Link to={courseHref(course.id)+'/grades'}>{t('成績管理','Grade administration')}</Link><ChevronRight size={16} aria-hidden="true"/><span>{t('用戶報告','User report')}</span></>}
        {assignment&&<><ChevronRight size={16} aria-hidden="true"/><Link to={courseHref(course.id)+'/assignments'}>{t('作業','Assignments')}</Link><ChevronRight size={16} aria-hidden="true"/>
          <Link to={courseHref(course.id)+'/assignment/'+assignment.id} aria-current={route.submissionView==='detail'?'page':undefined}>{assignment.title}</Link>
          {route.submissionView==='edit'&&<><ChevronRight size={16} aria-hidden="true"/><span>{t('編輯繳交作業','Edit submission')}</span></>}</>}
        {course.sourceMode==='sample'&&<span className="dtm-sample-label">{t('範例','Sample')}</span>}
      </>:route.mode==='dashboard'?t('儀表板','Dashboard'):route.mode==='assignments'?t('我的作業','My assignments'):route.mode==='grades'?t('我的成績','My grades'):t('我的教材網','My DTM workspace')}
    </nav>}
  </>;
}

function SignedInWorkspace({userId,route,t,hash,displayName}:{userId:string;route:DtmRoute;t:DtmTranslate;hash:string;displayName:string}) {
  const {snapshot,error,loading,refresh}=useAffairsRecords(userId);
  const navigate=useNavigate();
  const selected=snapshot?.dtm.courses.find(course=>course.id===route.id);
  const assignment=snapshot?.profile.userId===userId?snapshot.assignments.find(row=>row.id===route.assignmentId&&row.dtmCourseId===selected?.id):undefined;
  useEffect(()=>{
    if (!snapshot || !/^#[a-z0-9_-]+$/i.test(hash)) return;
    const frame=requestAnimationFrame(()=>document.getElementById(hash.slice(1))?.scrollIntoView({block:'nearest'}));
    return ()=>cancelAnimationFrame(frame);
  },[snapshot,hash,route.mode,route.view]);
  return <>
    <WorkspaceHeader route={route} course={selected} assignment={assignment} displayName={displayName} t={t}/>
    {error&&<div role="alert" className="dtm-error">{error} <Button size="sm" variant="outline" onClick={refresh}>{t('重試','Retry')}</Button></div>}
    {loading&&!snapshot&&<p role="status">{t('載入課程紀錄中…','Loading course records…')}</p>}
    {snapshot&&<div className={'dtm-columns'+(route.mode==='home'?'':' dtm-columns-course')}>
      <Navigation courses={snapshot.dtm.courses} home={route.mode==='home'} selected={selected} view={route.view} displayName={snapshot.profile.displayName||displayName} t={t}/>
      <section className={'dtm-center'+(route.mode==='course'?' dtm-course-center':'')+((route.mode==='grades'||route.view==='grades')?' dtm-grade-center':'')+(route.assignmentId?' dtm-submission-center':'')} aria-label={t('教材網內容','Digital teaching materials content')}>
        {route.mode==='home'?<DtmHome courses={snapshot.dtm.courses} t={t}/>
          :route.mode==='missing'||(route.mode==='course'&&!selected)||(route.assignmentId&&!assignment)
            ?loading?<p role="status">{t('載入課程中…','Loading course…')}</p>:<div className="dtm-card"><h2>{t('找不到課程或頁面','Course or page unavailable')}</h2>
              <p>{t('請從您的儀表板選擇一門課。','Choose a course from your dashboard.')}</p><Link to="/dtm/dashboard">{t('前往儀表板','Open dashboard')}</Link></div>
            :assignment&&selected?<DtmSubmissionWorkspace key={userId+':'+assignment.id} userId={userId}
              assignment={{id:assignment.id,userId,courseId:selected.id,title:assignment.title}} view={route.submissionView||'detail'}
              onNavigate={view=>navigate(courseHref(selected.id)+'/assignment/'+assignment.id+(view==='edit'?'/edit':''))} onSaved={refresh}/>
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
  const displayName = user?.user_metadata?.full_name || user?.email || 'Google';
  return <div className={user?'dtm is-signed-in':'dtm'} lang={locale}>
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
          <DropdownMenuTrigger asChild><Button variant="ghost" className="dtm-user" data-campus-assistant-menu
            aria-label={t('帳號選單：','Account menu: ')+displayName}>
            <img className="dtm-avatar" src="/dtm-theme/user-small.png" alt="" width="37" height="37"/><span>{displayName}</span><ChevronDown size={14} aria-hidden="true"/>
          </Button></DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem asChild><Link to="/dtm/dashboard">{t('儀表板','Dashboard')}</Link></DropdownMenuItem>
            <DropdownMenuItem asChild><Link to="/dtm/assignments">{t('我的作業','My assignments')}</Link></DropdownMenuItem>
            <DropdownMenuItem asChild><Link to="/dtm/grades">{t('我的成績','My grades')}</Link></DropdownMenuItem>
            <DropdownMenuItem onSelect={()=>window.dispatchEvent(new Event(campusAssistantOpenEvent))}>{t('校園助理','Campus assistant')}</DropdownMenuItem>
            <DropdownMenuItem onSelect={()=>void signOut()} disabled={busy}><LogOut size={16}/>{t('登出','Sign out')}</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </>:t('您尚未登入。','You are not logged in.')}</div>
    </header>
    <main className="dtm-main" id="dtm-content" tabIndex={-1}>
      {!user&&<><h1>{t('數位教材網 DIGITAL TEACHING MATERIALS (教材上網平台)','Digital Teaching Materials')}</h1>
        <nav className="dtm-breadcrumb" aria-label={t('頁面位置','Breadcrumb')}><Link to="/dtm">{t('首頁','Home')}</Link><ChevronRight size={16} aria-hidden="true"/>{t('登入網站','Log in to the site')}</nav>
      </>}
      {error&&<p role="alert" className="dtm-error">{error}</p>}
      {!user?<section className="dtm-login">
        <h2>{t('登入數位教材網','Sign in to Digital Teaching Materials')}</h2>
        <p>{t('使用您的 Google 帳號開啟 stu.best 教材、作業與成績紀錄。','Use your Google account to open your materials, assignments and grade records on stu.best.')}</p>
        <Button size="lg" onClick={()=>void signIn()} disabled={busy}><img src="/auth/google-g.png" alt="" width="20" height="20"/>{busy?t('連線中…','Opening Google…'):'Continue with Google'}</Button>
        <p className="dtm-note">{t('校方教材與正式成績請使用校方數位教材網。','Use university Moodle for official materials and grades.')}</p>
        <p><OfficialLink href={official} icon>{t('開啟校方 Moodle','Open university Moodle')}</OfficialLink> · <Link to="/school-affairs/login">{t('校務系統','School Affairs')}</Link></p>
      </section>:<SignedInWorkspace key={user.id} userId={user.id} route={route} t={t} hash={hash} displayName={displayName}/>}
    </main>
    <footer className="dtm-footer">
      <span>{t('數位教材網 · stu.best 獨立學生工作區','Digital Teaching Materials · Independent stu.best student workspace')}</span>
      {user && route.mode==='home' && <span className="dtm-reference-note">{t('校方公告與課程類別查閱日期 ','University directory checked ')}<time dateTime={observedAt}>{observedAt}</time></span>}
      <Link to="/school-affairs/privacy">{t('帳號與隱私','Account and privacy')}</Link>
    </footer>
  </div>;
}
