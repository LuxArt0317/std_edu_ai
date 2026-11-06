import { useEffect, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate, useParams } from 'react-router';
import { Bell, ChevronDown, ChevronRight, ExternalLink, FileText, LogOut, MessageSquare, Search, UserRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAffairsAuth } from '../affairs/authContext';
import { signOutAffairs, startGoogleSignIn } from '../affairs/authClient';
import { loadSchoolAffairsData, type AffairsSnapshot } from '@/services/schoolAffairsWorkspace';
import { announcements, categories, observedAt, quickLinks } from './catalog';
import './digital-materials.css';

const title = '數位教材網 Digital Teaching Materials (教材上網平台)';

export default function DigitalMaterials() {
  const { pathname } = useLocation();
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, loading } = useAffairsAuth();
  const [storedSnapshot, setSnapshot] = useState<AffairsSnapshot | null>(null);
  const snapshot = storedSnapshot?.profile.userId === user?.id ? storedSnapshot : null;
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState(true);
  const [courseSearch, setCourseSearch] = useState('');
  const loginPath = pathname === '/dtm/login' || pathname.endsWith('/login/index.php');
  useEffect(() => { document.title = `${title} · stu.best`; }, []);
  useEffect(() => {
    if (!user) return;
    let active = true;
    void loadSchoolAffairsData().then(data => { if (active) { setError(''); setSnapshot(data); } })
      .catch(reason => { if (active) setError(reason instanceof Error ? reason.message : 'Could not load digital materials.'); });
    return () => { active = false; };
  }, [user]);
  if (loading) return <main className="dtm-loading" role="status">Checking your Google session…</main>;
  if (user && loginPath) return <Navigate to="/dtm" replace />;
  if (!user && !loginPath) return <Navigate to="/dtm/login" replace />;
  async function signIn() {
    setBusy(true); setError('');
    try { await startGoogleSignIn('/dtm'); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Google sign-in could not start.'); setBusy(false); }
  }
  async function signOut() {
    setBusy(true); setError('');
    try { await signOutAffairs(); navigate('/dtm/login', {replace:true}); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Sign out failed.'); setBusy(false); }
  }
  const selected = snapshot?.dtm.courses.find(course => course.id === id);
  const matchingCourses = snapshot?.dtm.courses.filter(course => `${course.code} ${course.title} ${course.term}`.toLocaleLowerCase().includes(courseSearch.trim().toLocaleLowerCase())) || [];
  return <div className="dtm">
    <header className="dtm-top"><Link to="/dtm" className="dtm-brand">{title}</Link><span className="dtm-language">正體中文 (zh_tw) <ChevronDown size={16}/></span><div className="dtm-top-account">{user ? <><Bell size={18} aria-label="Notifications"/><MessageSquare size={18} aria-label="Messages"/><UserRound size={20}/><span>{snapshot?.profile.displayName || user.email}</span><Button variant="ghost" size="sm" disabled={busy} onClick={signOut}><LogOut size={16}/> 登出</Button></> : 'You are not logged in.'}</div></header>
    <main className="dtm-main"><h1>數位教材網 <span>DIGITAL TEACHING MATERIALS (教材上網平台)</span></h1>
      <nav className="dtm-breadcrumb" aria-label="Breadcrumb"><Link to="/dtm">Home</Link>{loginPath ? <><ChevronRight size={16}/>Log in to the site</> : selected ? <><ChevronRight size={16}/><Link to="/dtm">My courses</Link><ChevronRight size={16}/>{selected.title}</> : null}</nav>
      {!user ? <div className="dtm-login"><h2>樹德科大老師與學生請使用 Google 登入</h2><p>Sign in with the same Google account used for the stu.best School Affairs preview.</p><Button size="lg" onClick={signIn} disabled={busy}><span className="dtm-google-g">G</span>{busy ? 'Opening Google…' : 'Continue with Google'}</Button><p className="dtm-note">stu.best 是獨立介面預覽。此登入不連接校方 Moodle 帳號；登入後顯示範例課程。</p><p><Link to="/school-affairs/login">School Affairs</Link> · <Link to="/">School homepage</Link></p>{error && <p role="alert" className="dtm-error">{error}</p>}</div>
      : <><div className="dtm-sample" role="note">範例資料 · Sample stu.best records only. No official university courses, submissions or Moodle account are connected.</div>
      {error && <div role="alert" className="dtm-error">{error} <Button variant="outline" onClick={() => window.location.reload()}>Retry</Button></div>}
      {!snapshot && !error ? <p role="status">Loading your sample courses…</p> : snapshot ? <div className="dtm-columns">
        <aside className="dtm-left" aria-label="DTM navigation">
          <section className="dtm-card"><h2>重要消息</h2><p><strong>遠距教學課程</strong>請到 <a href="https://tc.stu.edu.tw/" target="_blank" rel="noreferrer">TronClass 創課 <ExternalLink size={13}/></a></p><p>官方數位教材網主要存放實體課程。</p></section>
          <section className="dtm-card dtm-navigation"><h2>導覽</h2><Link to="/dtm">首頁</Link><Link to="/dtm">儀表板</Link><button type="button" className="dtm-tree" aria-expanded={expanded} onClick={() => setExpanded(value => !value)}>我的課程 <ChevronDown size={16}/></button>{expanded && <ul><li>{snapshot.dtm.courses[0]?.term || '115學年度第1學期'}<ul>{snapshot.dtm.courses.map(course => <li key={course.id}><Link to={`/dtm/course/${course.id}`}>{course.title}</Link></li>)}</ul></li></ul>}</section>
          <section className="dtm-card"><h2>教學專區－教師</h2><a href="https://dtm.stu.edu.tw/" target="_blank" rel="noreferrer">教材上傳教學 <ExternalLink size={13}/></a><a href="https://dtm.stu.edu.tw/" target="_blank" rel="noreferrer">Moodle 使用教學 <ExternalLink size={13}/></a></section>
          <section className="dtm-card"><h2>教學專區－學生</h2><a href="https://dtm.stu.edu.tw/" target="_blank" rel="noreferrer">Moodle 使用教學 <ExternalLink size={13}/></a><a href="https://tc.stu.edu.tw/" target="_blank" rel="noreferrer">TronClass 平台 <ExternalLink size={13}/></a></section>
        </aside>
        <section className="dtm-center" aria-label="Digital teaching materials content">{selected ? <><h2>{selected.title}</h2><p className="dtm-course-meta">{selected.code} · {selected.term} · {selected.role} · stu.best sample</p><h3>課程教材 · Course materials</h3><div className="dtm-materials">{selected.materials.map(item => <article className="dtm-card" key={item.id}><FileText size={20}/><div><strong>{item.title}</strong><span>{item.kind} · {item.summary}</span></div></article>)}</div><h3>My assignments</h3><ul className="dtm-notices">{snapshot.assignments.filter(item=>item.dtmCourseId===selected.id).map(item=><li key={item.id}><FileText size={18}/><div><strong>{item.title}</strong><span>{item.status} · {item.dueAt?`Due ${new Date(item.dueAt).toLocaleString('en-US',{timeZone:'Asia/Taipei'})} Taipei`:'No due date'} · Sample</span></div></li>)}</ul><p className="dtm-note">These materials and assignments are stu.best sample records, not university submissions.</p></> : <>
          <h2>系統公告</h2><p className="dtm-reference-note">Official DTM notice titles observed {observedAt}. Open the source for the latest details; these notices are not account records.</p><ul className="dtm-notices">{announcements.map(([label,url],index) => <li key={url}><span className="dtm-document-icon" aria-hidden="true">{index%3===0?'🌐':'▤'}</span><a href={url} target="_blank" rel="noreferrer">{label} <ExternalLink size={13}/></a></li>)}</ul>
          <h2>我的 stu.best 教材 <span className="dtm-small-count">({snapshot.dtm.courses.length})</span></h2><ul className="dtm-notices">{snapshot.dtm.notices.map(notice => <li key={notice.id}><FileText size={18}/><div><strong>{notice.title}</strong><span>{notice.body} · Sample</span></div></li>)}</ul><h3>My assignments</h3><ul className="dtm-notices">{snapshot.assignments.filter(item=>item.dtmCourseId).map(item=><li key={item.id}><FileText size={18}/><div><strong>{item.course} · {item.title}</strong><span>{item.status} · {item.dueAt?`Due ${new Date(item.dueAt).toLocaleString('en-US',{timeZone:'Asia/Taipei'})} Taipei`:'No due date'} · Sample</span></div></li>)}</ul>
          <h2>課程類別</h2><div className="dtm-categories">{categories.map(([label,count,categoryId]) => <details key={categoryId}><summary>{label}{count>0 ? <small> ({count} at official DTM on {observedAt})</small> : null}</summary><div className="dtm-category-body">{matchingCourses.filter(course=>course.term===label).map(course=><Link className="dtm-course-link" to={`/dtm/course/${course.id}`} key={course.id}>{course.title}<ChevronRight size={16}/></Link>)}<a href={`https://dtm.stu.edu.tw/course/index.php?categoryid=${categoryId}`} target="_blank" rel="noreferrer">View official category <ExternalLink size={13}/></a></div></details>)}</div>
          <label className="dtm-search"><Search size={18}/>搜尋我的課程<input type="search" value={courseSearch} onChange={event=>setCourseSearch(event.target.value)} placeholder="Code or course title"/></label>{courseSearch && <div className="dtm-search-results">{matchingCourses.length ? matchingCourses.map(course=><Link className="dtm-course-link" to={`/dtm/course/${course.id}`} key={course.id}>{course.code} · {course.title}</Link>) : <p>No stu.best sample courses match.</p>}</div>}
        </>}</section>
        <aside className="dtm-right" aria-label="DTM resources"><section className="dtm-card"><h2>快速連結</h2>{quickLinks.map(([label,url]) => url.startsWith('/') ? <Link key={url} to={url}>{label}</Link> : <a key={url} href={url} target="_blank" rel="noreferrer">{label} <ExternalLink size={13}/></a>)}</section><section className="dtm-card"><h2>聯絡方式</h2><p><strong>一般生、校際選課生</strong> 教務處註冊課務組<br/>07-6158000#2012</p><p><strong>教材上網</strong> 教務處註冊課務組<br/>07-6158000#2010</p><p><strong>學分班學員</strong> 推廣教育中心<br/>07-6158000#2505</p><p><strong>系統問題</strong> 電算中心<br/>07-6158000#2440<br/><a href="mailto:service@stu.edu.tw">service@stu.edu.tw</a></p><small>Contact details observed {observedAt}; verify with the university before relying on them.</small></section><section className="dtm-card"><h2>電腦軟硬體規格需求</h2><p>Moodle runs in a web browser with a network connection. Use a current browser for best results.</p></section><section className="dtm-card"><h2>我的 stu.best 帳號</h2><p>{snapshot.profile.displayName}<br/>{snapshot.profile.email}</p><p>Google session shared with School Affairs. Official Moodle sign-in is separate.</p></section></aside>
      </div> : null}</>}
    </main><footer className="dtm-footer"><span>{user ? `Signed in as ${user.email}` : 'You are not logged in.'}</span><span>stu.best · independent campus website preview</span></footer>
  </div>;
}
