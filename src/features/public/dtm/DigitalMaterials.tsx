import { useEffect, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate, useParams } from 'react-router';
import { Bell, ChevronDown, ChevronRight, FileText, LogOut, MessageSquare, UserRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAffairsAuth } from '../affairs/authContext';
import { signOutAffairs, startGoogleSignIn } from '../affairs/authClient';
import { loadSchoolAffairsData, type AffairsSnapshot } from '@/services/schoolAffairsWorkspace';
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
  return <div className="dtm">
    <header className="dtm-top"><Link to="/dtm" className="dtm-brand">{title}</Link><span className="dtm-language">正體中文 (zh_tw) <ChevronDown size={16}/></span><div className="dtm-top-account">{user ? <><Bell size={18} aria-label="Notifications"/><MessageSquare size={18} aria-label="Messages"/><UserRound size={20}/><span>{snapshot?.profile.displayName || user.email}</span><Button variant="ghost" size="sm" disabled={busy} onClick={signOut}><LogOut size={16}/> 登出</Button></> : 'You are not logged in.'}</div></header>
    <main className="dtm-main"><h1>數位教材網 <span>DIGITAL TEACHING MATERIALS (教材上網平台)</span></h1>
      <nav className="dtm-breadcrumb" aria-label="Breadcrumb"><Link to="/dtm">Home</Link>{loginPath ? <><ChevronRight size={16}/>Log in to the site</> : selected ? <><ChevronRight size={16}/><Link to="/dtm">My courses</Link><ChevronRight size={16}/>{selected.title}</> : null}</nav>
      {!user ? <div className="dtm-login"><h2>樹德科大老師與學生請使用 Google 登入</h2><p>Sign in with the same Google account used for the stu.best School Affairs preview.</p><Button size="lg" onClick={signIn} disabled={busy}><span className="dtm-google-g">G</span>{busy ? 'Opening Google…' : 'Continue with Google'}</Button><p className="dtm-note">stu.best 是獨立介面預覽。此登入不連接校方 Moodle 帳號；登入後顯示範例課程。</p><p><Link to="/school-affairs/login">School Affairs</Link> · <Link to="/">School homepage</Link></p>{error && <p role="alert" className="dtm-error">{error}</p>}</div>
      : <><div className="dtm-sample" role="note">範例資料 · Sample stu.best records only. No official university courses, submissions or Moodle account are connected.</div>
      {error && <div role="alert" className="dtm-error">{error} <Button variant="outline" onClick={() => window.location.reload()}>Retry</Button></div>}
      {!snapshot && !error ? <p role="status">Loading your sample courses…</p> : snapshot ? <div className="dtm-columns">
        <aside className="dtm-left"><section className="dtm-card"><h2>重要消息</h2><p>本平台僅顯示 stu.best 範例教材，校方實際課程請至官方平台查詢。</p></section><section className="dtm-card"><h2>導覽</h2><Link to="/dtm">首頁 · 儀表板</Link><button type="button" className="dtm-tree" aria-expanded={expanded} onClick={() => setExpanded(value => !value)}>我的課程 <ChevronDown size={16}/></button>{expanded && <ul><li>115學年度第1學期<ul>{snapshot.dtm.courses.map(course => <li key={course.id}><Link to={`/dtm/course/${course.id}`}>{course.title}</Link></li>)}</ul></li></ul>}</section><section className="dtm-card"><h2>教學專區</h2><p>Open a sample course to browse its materials.</p></section></aside>
        <section className="dtm-center">{selected ? <><h2>{selected.title}</h2><p className="dtm-course-meta">{selected.code} · {selected.term} · {selected.role}</p><h3>Course materials</h3><div className="dtm-materials">{selected.materials.map(item => <article className="dtm-card" key={item.id}><FileText size={20}/><div><strong>{item.title}</strong><span>{item.kind} · {item.summary}</span></div></article>)}</div><p className="dtm-note">These materials are preview records; there are no downloads or official submissions.</p></> : <><h2>系統公告</h2><ul className="dtm-notices">{snapshot.dtm.notices.map(notice => <li key={notice.id}><FileText size={18}/><div><strong>{notice.title}</strong><span>{notice.body}</span></div></li>)}</ul><h2>課程類別</h2><details open><summary>115學年度第1學期 ({snapshot.dtm.courses.length})</summary>{snapshot.dtm.courses.map(course => <Link className="dtm-course-link" to={`/dtm/course/${course.id}`} key={course.id}>{course.title}<ChevronRight size={16}/></Link>)}</details></>}</section>
        <aside className="dtm-right"><section className="dtm-card"><h2>快速連結</h2><Link to="/">學校首頁</Link><Link to="/school-affairs">校務資訊系統</Link><Link to="/在校學生/">在校學生</Link></section><section className="dtm-card"><h2>聯絡方式</h2><p>Official contact details should be checked on the university site.</p><Link to="/在校學生/">學生服務目錄</Link></section><section className="dtm-card"><h2>我的帳號</h2><p>{snapshot.profile.displayName}<br/>{snapshot.profile.email}</p><p>Google session shared with School Affairs.</p></section></aside>
      </div> : null}</>}
    </main><footer className="dtm-footer"><span>{user ? `Signed in as ${user.email}` : 'You are not logged in.'}</span><span>stu.best · independent campus website preview</span></footer>
  </div>;
}
