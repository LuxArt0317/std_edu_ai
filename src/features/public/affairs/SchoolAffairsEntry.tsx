import { useEffect, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { referenceAsset } from '../site/reference';
import SchoolAffairsPortal from './SchoolAffairsPortal';
import { useAffairsAuth } from './authContext';
import { affairsCallbackPath, completeGoogleSignIn, startGoogleSignIn, signOutAffairs } from './authClient';
import './login.css';
import { SchoolAffairsPrivacy } from './SchoolAccountRecords';
const base = 'https://info.stu.edu.tw/ePortal/';
const campusPhotos = Array.from({ length: 16 }, (_, index) =>
  referenceAsset(`${base}assets/images/stu${index}.jpg`),
);

function CampusPhotoCarousel() {
  // The source page randomizes the first of 15 starting photos, then cycles all 16.
  const [photo, setPhoto] = useState(() => Math.floor(Math.random() * 15));
  const [playing, setPlaying] = useState(() =>
    typeof window !== 'undefined' && !window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  );

  useEffect(() => {
    const next = new Image();
    next.src = campusPhotos[(photo + 1) % campusPhotos.length];
  }, [photo]);

  useEffect(() => {
    if (!playing) return;
    const timer = window.setInterval(() => setPhoto(current => (current + 1) % campusPhotos.length), 5000);
    return () => window.clearInterval(timer);
  }, [playing]);

  return <div className="affairs-login-photo" aria-roledescription="carousel" aria-label="樹德科技大學校園照片">
    <img src={campusPhotos[photo]} alt={`樹德科技大學校園照片 ${photo + 1} / ${campusPhotos.length}`} width="900" height="600" />
    <Button variant="ghost" type="button" aria-label="Previous campus photo" onClick={() => setPhoto(current => (current - 1 + campusPhotos.length) % campusPhotos.length)}><ChevronLeft/></Button>
    <Button variant="ghost" type="button" aria-label="Next campus photo" onClick={() => setPhoto(current => (current + 1) % campusPhotos.length)}><ChevronRight/></Button>
    <Button variant="ghost" type="button" className="affairs-login-photo-play" aria-label={playing ? 'Pause campus photos' : 'Play campus photos'} onClick={() => setPlaying(value => !value)}>{playing ? 'Pause' : 'Play'}</Button>
  </div>;
}
function GoogleCallback() {
  const { search } = useLocation();
  const navigate = useNavigate();
  const [error, setError] = useState(''), [complete, setComplete] = useState(false);
  const {user,error:identityError} = useAffairsAuth();
  useEffect(() => {
    if (complete && user) navigate('/school-affairs', {replace:true});
  }, [complete,user,navigate]);
  useEffect(() => {
    let active = true;
    void completeGoogleSignIn(search).then(() => {
      if (active) setComplete(true);
    }).catch(() => {
      // Remove OAuth codes/errors from the address bar without displaying provider payloads.
      if (active) { window.history.replaceState(null, '', affairsCallbackPath); setError('Google sign-in did not finish. The link may have expired or been cancelled. Please start again.'); }
    });
    return () => { active = false; };
  }, [search, navigate]);
  return <main className="affairs-login"><section className="affairs-login-wrap affairs-login-card">
    <h1>Google sign-in</h1>
    {(error || (complete && identityError)) ? <><p role="alert">{error || identityError}</p><Link to="/school-affairs/login">Return to sign in</Link></> : <p role="status">Completing your secure sign-in…</p>}
  </section></main>;
}
function SchoolSignOut() {
  const navigate = useNavigate();
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    void signOutAffairs().then(() => { if (active) navigate('/school-affairs/login', { replace: true }); })
      .catch(() => { if (active) setError('Sign out failed. Check your connection and try again.'); });
    return () => { active = false; };
  }, [navigate]);
  return <main className="affairs-login"><section className="affairs-login-wrap affairs-login-card">
    <h1>Sign out</h1>{error ? <><p role="alert">{error}</p><Button onClick={() => window.location.reload()}>Try again</Button></> : <p role="status">Signing out…</p>}
  </section></main>;
}
export default function SchoolAffairsEntry() {
  const { pathname } = useLocation();
  const { user, loading, error: sessionError } = useAffairsAuth();
  const [panel, setPanel] = useState(false);
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  useEffect(() => { document.title = '校務系統 · stu.best'; }, []);
  if (pathname === '/school-affairs/privacy') return <SchoolAffairsPrivacy />;
  if (pathname === affairsCallbackPath) return <GoogleCallback />;
  if (/\/signed-out\/?$/.test(pathname)) return <SchoolSignOut />;
  if (loading) return <main className="affairs-login"><p role="status">Checking your School Affairs session…</p></main>;
  if (user && pathname === '/school-affairs/login') return <Navigate to="/school-affairs" replace />;
  if (user) return <SchoolAffairsPortal key={user.id} user={user} />;
  if (pathname !== '/school-affairs/login') return <Navigate to="/school-affairs/login" replace />;
  return <main className="affairs-login" style={{backgroundImage:`url("${referenceAsset(base+'assets/css/images/pattern.jpg')}")`}}>
    <div className="affairs-login-wrap">
      <h1 aria-label="校務系統登入"><img src={referenceAsset(base+'assets/img/stu/stuLogo.svg')} alt="樹德科技大學 SHU-TE UNIVERSITY" width="220" height="37"/><span className="sr-only">校務系統登入</span></h1>
      <section className="affairs-login-card" aria-label="School Affairs sign in">
        <CampusPhotoCarousel />
        <div className="affairs-google-entry">
          <h2>登入 School Affairs</h2>
          <p>使用您的 Google 帳號登入 stu.best。<br/>Sign in to stu.best with your Google account.</p>
          <Button className="affairs-google-button" disabled={busy} onClick={()=>{
            setBusy(true);setError('');
            void startGoogleSignIn().catch(()=>{setError('Google sign-in is not available yet. Please try again later or contact the site administrator.');setBusy(false);});
          }}><img src="/auth/google-g.png" alt="" width="20" height="20"/>{busy?'Connecting to Google…':'Continue with Google'}</Button>
          {(error || sessionError) && <p role="alert">{error || sessionError}</p>}
          <p className="affairs-login-status">Google handles your password. We receive your name, email and profile picture, not your Gmail messages.</p>
          <p className="affairs-login-status">此帳號與 Nexus 分開。登入不會自動連接校方學籍、成績或繳費紀錄；僅顯示已授權連結至您帳號的資料。</p>
          <Link to="/school-affairs/privacy">Privacy &amp; account information</Link>
        </div>
        <div className="affairs-login-actions"><Button onClick={()=>setPanel(!panel)} aria-expanded={panel}>資訊系統選單(MENU)</Button><Link to="/在校學生/">學生服務目錄</Link></div>
        {panel && <section className="affairs-login-information"><h2>資訊服務選單</h2><Link to="/在校學生/">在校學生服務目錄</Link><Link to="/">校園網站首頁</Link></section>}
        <p className="affairs-login-status">stu.best 是獨立網站，非校方官方登入服務。不會要求您的校務密碼。</p>
      </section>
      <footer>School Affairs · stu.best · Independent campus website</footer>
    </div>
  </main>;
}
