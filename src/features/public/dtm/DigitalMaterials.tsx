import { useEffect, useState, type ReactNode } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router';
import { Bell, ChevronDown, ChevronRight, ExternalLink, LogOut, MessageSquare, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import type { DtmAssignment, DtmCourse, DtmMaterial } from '@/services/schoolAffairsWorkspace';
import { useAffairsAuth } from '../affairs/authContext';
import { safeSchoolReturnPath, signOutAffairs, startGoogleSignIn } from '../affairs/authClient';
import {learningLoginReturnFromQuery} from '../../../../server/learningEntryContract.js';
import { useAffairsRecords } from '../affairs/useAffairsRecords';
import { campusAssistantOpenEvent } from '../PublicAssistant';
import { announcements, categories, coursesByTerm, dtmViews, observedAt, otherCategories, quickLinks, type DtmView } from './catalog';
import { DtmCourseCreateDialog, DtmStudentRecords } from './DtmStudentRecords';
import { DtmSubmissionWorkspace } from './DtmSubmissionWorkspace';
import {useDtmCourseAssignment} from './useDtmCourseAssignment';
import {useDtmCourseResource} from './useDtmCourseResource';
import {DtmCourseResource} from './DtmCourseResource';
import {DtmCourseContent} from './DtmCourseContent';
import {useDtmCourseHeader} from './useDtmCourseHeader';
import { DtmDashboardLayout, type DtmDashboardConfiguration } from './DtmDashboardLayout';
import { termLabel, useDtmLocale, type DtmLocale, type DtmTranslate } from './locale';
import './digital-materials.css';

const brand = '數位教材網 Digital Teaching Materials (教材上網平台)';
const official = 'https://dtm.stu.edu.tw/';
const courseHref = (id:string) => '/dtm/course/'+encodeURIComponent(id);
const navigationTerms = categories.map(([term])=>term).filter(term=>/^11[2-5]學年度第[12]學期$/.test(term));
const dashboardSocials=[
  ['Android','\uf17b','https://play.google.com/store/apps/details?id=com.stu.webphone'],
  ['Apple','\uf179','https://itunes.apple.com/tw/app/shu-de-ke-ji-da-xue/id992708520?mt=8'],
  ['YouTube','\uf167','https://www.youtube.com/c/StuEduTw'],
  ['Wikipedia','\uf266','https://zh.wikipedia.org/wiki/樹德科技大學'],
  ['Google+','\uf0d5','https://plus.google.com/'],
  ['Facebook','\uf09a','https://www.facebook.com/ShuTeUniversity/'],
] as const;

type CourseHeader=Pick<DtmCourse,'id'|'title'|'code'|'term'>&Partial<Pick<DtmCourse,'sourceMode'>>;
type DtmRoute = {mode:'home'|'login'|'dashboard'|'assignments'|'grades'|'course'|'missing';id?:string;view?:DtmView;gradeReportView?:'overview';assignmentId?:string;submissionView?:'detail'|'edit';materialId?:string};
function dtmRoute(pathname:string):DtmRoute {
  const path = pathname.replace(/^\/school-sites\/dtm\.stu\.edu\.tw/,'/dtm').replace(/\/$/,'');
  if (path==='/dtm/login'||path==='/dtm/login/index.php') return {mode:'login'};
  if (path==='/dtm') return {mode:'home'};
  if (path==='/dtm/dashboard'||path==='/dtm/my') return {mode:'dashboard'};
  if (path==='/dtm/assignments') return {mode:'assignments'};
  if (path==='/dtm/grades') return {mode:'grades'};
  const overview=/^\/dtm\/course\/([a-zA-Z0-9-]+)\/grades\/overview$/.exec(path);
  if(overview)return {mode:'course',id:overview[1],view:'grades',gradeReportView:'overview'};
  const material=/^\/dtm\/course\/([a-zA-Z0-9-]+)\/material\/([a-zA-Z0-9-]+)$/.exec(path);
  if(material)return {mode:'course',id:material[1],view:'materials',materialId:material[2]};
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

function DashboardBlockContent({enabled,noOverflow=false,children}:{enabled:boolean;noOverflow?:boolean;children:ReactNode}) {
  return enabled?<div className="dtm-dashboard-block-content">{noOverflow?<div className="dtm-dashboard-no-overflow">{children}</div>:children}</div>:<>{children}</>;
}

function Navigation({courses,home,dashboard,selected,view,gradeReportView,material,displayName,t,dashboardBlock,dashboardControls}:{courses:CourseHeader[];home:boolean;dashboard:boolean;selected?:CourseHeader;view?:DtmView;gradeReportView?:'overview';material?:Pick<DtmMaterial,'id'|'title'>;displayName:string;t:DtmTranslate;dashboardBlock?:'important'|'navigation'|'contacts';dashboardControls?:ReactNode}) {
  const [membersOpen,setMembersOpen]=useState(false);
  const ownTerms = new Map(coursesByTerm(courses));
  const terms = [...new Set<string>([...navigationTerms,...ownTerms.keys()])]
    .sort((a,b)=>b.localeCompare(a,undefined,{numeric:true}));
  const content=<>
    {(dashboardBlock?dashboardBlock==='important':home||dashboard||selected) && <>
    {dashboard&&<a className="dtm-dashboard-block-skip" href="#dtm-after-important">{t('略過重要消息','Skip Important information')}</a>}
    <section className="dtm-card dtm-important-information">
      <h2>{t('重要消息','Important information')}</h2>
      {dashboardControls}
      <DashboardBlockContent enabled={dashboard} noOverflow>
      <p><strong>{t('遠距教學課程','Online classes')}</strong>{t('請到',' use ')} <OfficialLink href="https://tc.stu.edu.tw/">{t('>>TronClass創課<<','TronClass')}</OfficialLink></p>
      <p>{t('本平台只存放','This platform hosts ')}<strong>{t('實體課程','in-person courses')}</strong></p>
      </DashboardBlockContent>
    </section>
    {dashboard&&<span className="dtm-dashboard-skip-target" id="dtm-after-important" tabIndex={-1}/>}
    </>}
    {(!dashboardBlock||dashboardBlock==='navigation')&&<>
    {dashboard&&<a className="dtm-dashboard-block-skip" href="#dtm-after-navigation">{t('略過導覽','Skip Navigation')}</a>}
    <nav className="dtm-card dtm-navigation" aria-label={t('我的課程選單','My courses navigation')}>
      <h2><i className="dtm-navigation-icon" aria-hidden="true">{'\uf0e8'}</i>{t('導覽','Navigation')}</h2>
      {dashboardControls}
      <DashboardBlockContent enabled={dashboard}>
      <Link className="dtm-tree-home" to="/dtm" aria-current={home?'page':undefined}>{t('首頁','Home')}</Link>
      <Link className="dtm-tree-page" to="/dtm/dashboard" aria-current={dashboard?'page':undefined}>{t('儀表板','Dashboard')}</Link>
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
                  <li><Link to={courseHref(course.id)+'/grades'} aria-current={view==='grades'?'page':undefined}>{t('成績','Grades')}</Link></li>
                  {material&&<li><details open><summary>{t('教材區','Course materials')}</summary><ul><li><Link to={courseHref(course.id)+'/material/'+encodeURIComponent(material.id)} aria-current="page"><img src="/dtm-theme/url.svg" alt="" width="16" height="16"/>{material.title}</Link></li></ul></details></li>}</ul>
              </details>
              :<Link to={courseHref(course.id)}>{course.title}</Link>}</li>)}</ul>
            : <p className="dtm-tree-empty">{t('此學期沒有已儲存的課程。','No saved courses for this term.')}</p>}
        </details>)}
      </details>
      </DashboardBlockContent>
    </nav>
    {dashboard&&<span className="dtm-dashboard-skip-target" id="dtm-after-navigation" tabIndex={-1}/>}
    </>}
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
        <ul><li><Link to={courseHref(selected.id)+'/grades/overview'} aria-current={gradeReportView==='overview'?'page':undefined}>{t('綜覽報告','Overview report')}</Link></li><li><Link to={courseHref(selected.id)+'/grades'} aria-current={gradeReportView==='overview'?undefined:'page'}>{t('用戶報告','User report')}</Link></li></ul>
      </details>
    </section>}
    {(dashboardBlock?dashboardBlock==='contacts':dashboard||selected)&&<Contacts t={t} dashboard={dashboard} controls={dashboardControls}/>}
    <Dialog open={membersOpen} onOpenChange={setMembersOpen}><DialogContent>
      <DialogHeader><DialogTitle>{t('成員','Participants')}</DialogTitle><DialogDescription>{t('此課程的個人紀錄帳號。','The account associated with these personal course records.')}</DialogDescription></DialogHeader>
      <p>{displayName}</p>
    </DialogContent></Dialog>
  </>;
  return dashboardBlock?content:<aside className="dtm-left" aria-label={t('數位教材網導覽','DTM navigation')}>{content}</aside>;
}

function Contacts({t,dashboard=false,controls}:{t:DtmTranslate;dashboard?:boolean;controls?:ReactNode}) {
  const department=(zh:string,en:string)=>dashboard
    ?<>{t('請洽','Contact ')}<strong className="dtm-contact-department">{t(zh,en)}</strong>: </>
    :t('請洽'+zh+': ',': ');
  return <>
    {dashboard&&<a className="dtm-dashboard-block-skip" href="#dtm-after-contacts">{t('略過聯絡方式','Skip Contacts')}</a>}
    <section className="dtm-card dtm-contacts">
      <h2>{t('聯絡方式','Contacts')}</h2>
      {controls}
      <DashboardBlockContent enabled={dashboard} noOverflow>
      <p><strong>{t('一般生、校際選課生','Registration and course enrollment')}</strong>{department('教務處註冊課務組','Registration and Curriculum Section')}07-6158000#2012</p>
      <p><strong>{t('教材上網','Course materials')}</strong>{t('請洽教務處註冊課務組: ',': ')}07-6158000#2010</p>
      <p><strong>{t('學分班學員','Credit courses')}</strong>{department('推廣教育中心','Continuing Education Center')}{dashboard?'07-615800#2505':'07-6158000#2505'}</p>
      <p><strong>{t('碩習生','International affairs')}</strong>{department('國際與兩岸事務處','International and Cross-Strait Affairs Office')}07-6158000#1612</p>
      <p><strong>{t('系統問題','Technical support')}</strong>{department('電算中心','Computer Center')}07-6158000#2440<br/>{t('或 ','or ')}<a href="mailto:service@stu.edu.tw">service@stu.edu.tw</a>{dashboard?<strong className="dtm-contact-after-hours">{t('(非上班時間請寫信)',' (email outside office hours)')}</strong>:t('（非上班時間請寫信）',' (email outside office hours)')}</p>
      </DashboardBlockContent>
    </section>
    {dashboard&&<span className="dtm-dashboard-skip-target" id="dtm-after-contacts" tabIndex={-1}/>}
  </>;
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

function WorkspaceHeader({route,course,assignment,material,displayName,t,dashboardConfiguration}:{route:DtmRoute;course?:CourseHeader;assignment?:DtmAssignment;material?:Pick<DtmMaterial,'id'|'title'>;displayName:string;t:DtmTranslate;dashboardConfiguration?:DtmDashboardConfiguration|null}) {
  return <>
    {route.mode==='dashboard'?<header className="dtm-dashboard-header">
      <span className="dtm-dashboard-avatar"><img className="dtm-avatar" src="/dtm-theme/user-large.png" alt="" width="100" height="100"/></span><h1>{displayName}</h1>
    </header>:<h1>{course?course.title+(route.view==='grades'?(route.gradeReportView==='overview'?t(': 瀏覽: 綜覽報告',': View: Overview report'):t(': 瀏覽: 用戶報告',': View: User report')):''):t('數位教材網 DIGITAL TEACHING MATERIALS (教材上網平台)','Digital Teaching Materials')}</h1>}
    {route.mode!=='home'&&<nav className="dtm-breadcrumb" aria-label={t('頁面位置','Breadcrumb')}>
      <Link to="/dtm">{t('首頁','Home')}</Link><ChevronRight size={16} aria-hidden="true"/>
      {course?<>
        <Link to="/dtm/dashboard">{t('我的課程','My courses')}</Link><ChevronRight size={16} aria-hidden="true"/>
        <Link to="/dtm/dashboard">{termLabel(course.term,t)}</Link><ChevronRight size={16} aria-hidden="true"/>
        <Link to={courseHref(course.id)} aria-current={route.view==='materials'&&!route.materialId?'page':undefined}>{route.view==='grades'||route.materialId?course.title:course.code}</Link>
        {route.view==='grades'&&(route.gradeReportView==='overview'?<><ChevronRight size={16} aria-hidden="true"/><span>{t('綜覽報告','Overview report')}</span></>:<><ChevronRight size={16} aria-hidden="true"/><Link to={courseHref(course.id)+'/grades'}>{t('成績管理','Grade administration')}</Link><ChevronRight size={16} aria-hidden="true"/><span>{t('用戶報告','User report')}</span></>)}
        {assignment&&<><ChevronRight size={16} aria-hidden="true"/><Link to={courseHref(course.id)+'/assignments'}>{t('作業','Assignments')}</Link><ChevronRight size={16} aria-hidden="true"/>
          <Link to={courseHref(course.id)+'/assignment/'+assignment.id} aria-current={route.submissionView==='detail'?'page':undefined}>{assignment.title}</Link>
          {route.submissionView==='edit'&&<><ChevronRight size={16} aria-hidden="true"/><span>{t('編輯繳交作業','Edit submission')}</span></>}</>}
        {material&&<><ChevronRight size={16} aria-hidden="true"/><Link to={courseHref(course.id)}>{t('教材區','Course materials')}</Link><ChevronRight size={16} aria-hidden="true"/><span aria-current="page">{material.title}</span></>}
        {course.sourceMode==='sample'&&<span className="dtm-sample-label">{t('範例','Sample')}</span>}
      </>:route.mode==='dashboard'?dashboardConfiguration?<>
        <Link to="/dtm/dashboard" aria-disabled={!dashboardConfiguration.canCancel} onClick={event=>{event.preventDefault();if(dashboardConfiguration.canCancel)dashboardConfiguration.onCancel();}}>{t('儀表板','Dashboard')}</Link>
        <ChevronRight size={16} aria-hidden="true"/><span>{dashboardConfiguration.title}</span><ChevronRight size={16} aria-hidden="true"/><span aria-current="page">{t('組態','Configuration')}</span>
      </>:t('儀表板','Dashboard'):route.mode==='assignments'?t('我的作業','My assignments'):route.mode==='grades'?t('我的成績','My grades'):t('我的教材網','My DTM workspace')}
    </nav>}
  </>;
}

function SignedInWorkspace({userId,route,t,hash,displayName,creatingCourse,onCreatingCourseChange}:{
  userId:string;route:DtmRoute;t:DtmTranslate;hash:string;displayName:string;
  creatingCourse:boolean;onCreatingCourseChange:(open:boolean)=>void;
}) {
  const {snapshot:loadedSnapshot,error,loading,refresh}=useAffairsRecords(userId);
  const snapshot=loadedSnapshot?.profile.userId===userId?loadedSnapshot:undefined;
  const navigate=useNavigate();
  const exactResource=useDtmCourseResource(userId,route.materialId?route.id:undefined,route.materialId,snapshot?.checkedAt);
  const resourceCourse=exactResource.data?.course;
  const knownCourse=snapshot?.dtm.courses.find(course=>course.id===route.id);
  const exactHeaderNeeded=route.mode==='course'&&!route.materialId&&!knownCourse&&(route.view==='materials'||Boolean(route.assignmentId));
  const header=useDtmCourseHeader(userId,exactHeaderNeeded?route.id:undefined,snapshot?.checkedAt);
  const fallbackCourse=route.mode==='course'&&route.view==='materials'&&!route.assignmentId&&!route.materialId&&!knownCourse;
  const selected:CourseHeader|undefined=route.materialId?resourceCourse:knownCourse??header.course??undefined;
  const navigationCourses=selected&&!snapshot?.dtm.courses.some(course=>course.id===selected.id)
    ?[...(snapshot?.dtm.courses||[]),selected]:snapshot?.dtm.courses||[];
  const material=exactResource.data?.material??undefined;
  const exactAssignment=useDtmCourseAssignment(userId,route.id,route.assignmentId,snapshot?.checkedAt);
  const assignment=exactAssignment.assignment??undefined;
  useEffect(()=>{
    if (!snapshot || !/^#[a-z0-9_-]+$/i.test(hash)) return;
    const frame=requestAnimationFrame(()=>document.getElementById(hash.slice(1))?.scrollIntoView({block:'nearest'}));
    return ()=>cancelAnimationFrame(frame);
  },[snapshot,hash,route.mode,route.view]);
  return <>
    {(route.mode!=='dashboard'||!snapshot)&&<WorkspaceHeader route={route} course={selected} assignment={assignment} material={material} displayName={displayName} t={t}/>}
    {error&&<div role="alert" className="dtm-error">{error} <Button size="sm" variant="outline" onClick={refresh}>{t('重試','Retry')}</Button></div>}
    {loading&&!snapshot&&<p role="status">{t('載入課程紀錄中…','Loading course records…')}</p>}
    {snapshot&&route.mode==='dashboard'&&<DtmDashboardLayout userId={userId} t={t} renderHeader={configuration=><WorkspaceHeader route={route} displayName={displayName} t={t} dashboardConfiguration={configuration}/>} renderBlock={(id,controls)=><Navigation courses={snapshot.dtm.courses} home={false} dashboard displayName={snapshot.profile.displayName||displayName} t={t} dashboardBlock={id} dashboardControls={controls}/>}/>}
    {(snapshot||route.mode==='course')&&route.mode!=='dashboard'&&<div className={'dtm-columns'+(route.mode==='home'?'':' dtm-columns-course')}>
      <Navigation courses={navigationCourses} home={route.mode==='home'} dashboard={false} selected={selected} view={route.view} gradeReportView={route.gradeReportView} material={material} displayName={snapshot?.profile.displayName||displayName} t={t}/>
      <section className={'dtm-center'+(route.mode==='course'?' dtm-course-center':'')+((route.mode==='grades'||route.view==='grades')?' dtm-grade-center':'')+(route.assignmentId?' dtm-submission-center':'')+(route.materialId?' dtm-resource-center':'')} aria-label={t('教材網內容','Digital teaching materials content')}>
        {route.mode==='home'?<DtmHome courses={snapshot?.dtm.courses||[]} t={t}/>
          :route.materialId?exactResource.loading?<p role="status">{t('載入教材中…','Loading material…')}</p>
            :exactResource.failed?<div role="alert" className="dtm-error">{t('無法載入教材。請重試。','Could not load this material. Please retry.')} <Button size="sm" variant="outline" onClick={exactResource.retry}>{t('重試','Retry')}</Button></div>
            :material?<DtmCourseResource material={material} t={t}/>:<div className="dtm-card"><h2>{t('找不到教材','Material unavailable')}</h2><Link to={selected?courseHref(selected.id):'/dtm/dashboard'}>{t('返回課程','Back to course')}</Link></div>
          :exactHeaderNeeded&&header.loading?<p role="status">{t('載入課程中…','Loading course…')}</p>
          :exactHeaderNeeded&&header.failed?<div role="alert" className="dtm-error">{t('無法載入課程。請重試。','Could not load this course. Please retry.')} <Button size="sm" variant="outline" onClick={header.retry}>{t('重試','Retry')}</Button></div>
          :fallbackCourse&&route.id?<DtmCourseContent key={userId+':'+route.id} userId={userId} courseId={route.id} refreshKey={snapshot?.checkedAt||''} t={t}
            onOpenAssignment={id=>navigate(courseHref(route.id!)+'/assignment/'+id)} onOpenMaterial={row=>navigate(courseHref(route.id!)+'/material/'+row.id)}/>
          :route.assignmentId&&selected&&exactAssignment.loading?<p role="status">{t('載入作業中…','Loading assignment…')}</p>
          :route.assignmentId&&selected&&exactAssignment.failed?<div role="alert" className="dtm-error">{t('無法載入作業。請重試。','Could not load this assignment. Please retry.')} <Button size="sm" variant="outline" onClick={exactAssignment.retry}>{t('重試','Retry')}</Button></div>
          :route.mode==='missing'||(route.mode==='course'&&!selected)||(route.assignmentId&&!assignment)
            ?loading?<p role="status">{t('載入課程中…','Loading course…')}</p>:<div className="dtm-card"><h2>{t('找不到課程或頁面','Course or page unavailable')}</h2>
              <p>{t('請從您的儀表板選擇一門課。','Choose a course from your dashboard.')}</p><Link to="/dtm/dashboard">{t('前往儀表板','Open dashboard')}</Link></div>
            :assignment&&selected?<DtmSubmissionWorkspace key={userId+':'+assignment.id} userId={userId}
              assignment={{id:assignment.id,userId,courseId:selected.id,title:assignment.title}} view={route.submissionView||'detail'}
              onNavigate={view=>navigate(courseHref(selected.id)+'/assignment/'+assignment.id+(view==='edit'?'/edit':''))} onSaved={refresh}/>
            :route.mode!=='login'&&snapshot&&<DtmStudentRecords key={route.mode+':'+(route.id||'')+':'+(route.view||'')+':'+(route.gradeReportView||'')} snapshot={snapshot}
              course={knownCourse} view={route.view} gradeReportView={route.gradeReportView} mode={route.mode} t={t} refresh={refresh}/>}
      </section>
      {route.mode==='home'&&<Resources t={t}/>}
    </div>}
    <DtmCourseCreateDialog userId={userId} open={creatingCourse} onOpenChange={onCreatingCourseChange} t={t} onSaved={id=>{
      onCreatingCourseChange(false);refresh();navigate(courseHref(id));
    }}/>
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
  const [creatingCourseFor,setCreatingCourseFor]=useState<string|null>(null);
  const returnTo=learningLoginReturnFromQuery('dtm',search);

  useEffect(()=>{document.title=brand+' · stu.best';},[]);
  if(creatingCourseFor!==null&&creatingCourseFor!==user?.id)setCreatingCourseFor(null);
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
  return <div className={user?'dtm is-signed-in'+(route.mode==='dashboard'?' is-dashboard':''):'dtm'} lang={locale}>
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
            <DropdownMenuItem onSelect={()=>setCreatingCourseFor(user.id)}>{t('新增課程','Add course')}</DropdownMenuItem>
            <DropdownMenuItem asChild><Link to="/dtm/assignments">{t('我的作業','My assignments')}</Link></DropdownMenuItem>
            <DropdownMenuItem asChild><Link to="/dtm/grades">{t('我的成績','My grades')}</Link></DropdownMenuItem>
            <DropdownMenuItem onSelect={()=>window.dispatchEvent(new Event(campusAssistantOpenEvent))}>{t('校園助理','Campus assistant')}</DropdownMenuItem>
            <DropdownMenuItem asChild><Link to="/school-affairs/privacy">{t('帳號與隱私','Account and privacy')}</Link></DropdownMenuItem>
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
      </section>:<SignedInWorkspace key={user.id} userId={user.id} route={route} t={t} hash={hash} displayName={displayName}
        creatingCourse={creatingCourseFor===user.id} onCreatingCourseChange={open=>setCreatingCourseFor(open?user.id:null)}/>}
    </main>
    {user&&route.mode==='dashboard'?<footer className="dtm-footer dtm-dashboard-footer">
      <div className="dtm-dashboard-footer-row">
        <div className="dtm-dashboard-footer-column"><div className="dtm-dashboard-footer-block dtm-dashboard-login-info">
          {t('您以 ','You are logged in as ')}<Link to="/school-affairs/records">{displayName}</Link>{t(' 登入 (',' (')}<button type="button" onClick={()=>void signOut()} disabled={busy}>{t('登出','Log out')}</button>)
        </div></div>
        <div className="dtm-dashboard-footer-column dtm-dashboard-footer-empty" aria-hidden="true"/>
        <div className="dtm-dashboard-footer-column"><div className="dtm-dashboard-footer-block">
          {dashboardSocials.map(([label,glyph,href])=><a className="dtm-dashboard-social" href={href} key={label} aria-label={label} target="_blank" rel="noopener noreferrer"><i aria-hidden="true">{glyph}</i></a>)}
          <Link className="dtm-dashboard-social" to="/" aria-label={t('學校首頁','University homepage')}><i aria-hidden="true">{'\uf0ac'}</i></Link>
        </div></div>
      </div>
      <div className="dtm-dashboard-footer-attribution">Based on an original theme created by <OfficialLink href="https://moodle.org/plugins/view.php?plugin=theme_aardvark">Shaun Daubney</OfficialLink> | <OfficialLink href="https://moodle.org/">moodle.org</OfficialLink></div>
    </footer>:<footer className="dtm-footer">
      <span>{t('數位教材網 · stu.best 獨立學生工作區','Digital Teaching Materials · Independent stu.best student workspace')}</span>
      {user && route.mode==='home' && <span className="dtm-reference-note">{t('校方公告與課程類別查閱日期 ','University directory checked ')}<time dateTime={observedAt}>{observedAt}</time></span>}
      <Link to="/school-affairs/privacy">{t('帳號與隱私','Account and privacy')}</Link>
    </footer>}
  </div>;
}
