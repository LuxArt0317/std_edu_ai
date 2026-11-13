import {useState} from 'react';
import {Link} from 'react-router';
import {ArrowLeft, ArrowRight, ExternalLink} from 'lucide-react';
import {referenceAsset} from '../site/reference';
import {serviceLeadershipPath,serviceLeadershipViews,type ServiceLeadershipView} from './serviceLeadership.js';
import './service-leadership.css';

const title = '服務領導教育系統';

export function ServiceLeadershipWorkspace({view}: {view?:ServiceLeadershipView}) {
  const [menuOpen,setMenuOpen] = useState(true);
  return <div className="service-leadership" lang="zh-Hant">
    <div className="service-leadership-frame">
      <header className="service-leadership-banner">
        <Link to={serviceLeadershipPath}>
          <img src={referenceAsset('https://info.stu.edu.tw/ePortal/assets/img/stu/stuBanner.svg')} alt="" width="45" height="48" />
          <span><strong>{title}</strong><small>Campus Information Services</small></span>
        </Link>
        <div aria-hidden="true" className="service-leadership-dots" />
      </header>
      <button className="service-leadership-toggle" type="button" aria-label={menuOpen?'收合選單':'展開選單'}
        aria-expanded={menuOpen} aria-controls="service-leadership-nav" onClick={()=>setMenuOpen(open=>!open)}>
        {menuOpen?<ArrowLeft size={19} aria-hidden="true" />:<ArrowRight size={19} aria-hidden="true" />}
      </button>
      <div className="service-leadership-content">
        <nav id="service-leadership-nav" aria-label="服務講堂課程" hidden={!menuOpen}>
          <h2>服務講堂課程</h2>
          <Link aria-current={!view?'page':undefined} to={serviceLeadershipPath}>首頁</Link>
          {serviceLeadershipViews.map(item=><Link key={item.key} aria-current={view?.key===item.key?'page':undefined}
            to={serviceLeadershipPath+'/'+item.key}>{item.label}</Link>)}
        </nav>
        <main>
          <h1>{view?.heading ?? '功能說明'}</h1>
          {view ? <section className="service-leadership-detail" aria-labelledby="service-leadership-detail-title">
            <h2 id="service-leadership-detail-title">辦理方式</h2>
            {view.lines.map(line=><p key={line}>{line}</p>)}
            <p>此項功能需要使用校方帳號登入。</p>
            <a href={view.source} target="_blank" rel="noopener noreferrer">開啟校方{view.label} <ExternalLink size={13} aria-hidden="true" /></a>
          </section> : serviceLeadershipViews.map(item=><section className="service-leadership-function" key={item.key}>
            <h2><Link to={serviceLeadershipPath+'/'+item.key}>{item.heading}</Link></h2>
            {item.lines.map(line=><p key={line}>{line}</p>)}
          </section>)}
        </main>
      </div>
    </div>
    <footer>
      <nav aria-label="頁尾連結">
        <Link to="/school-affairs/signed-out">登出</Link><Link to={serviceLeadershipPath}>HomePage</Link>
        <Link to="/school-affairs">校務資訊系統</Link><a href="/">學校首頁</a><Link to="/student-sso">mySTU</Link>
      </nav>
      <p><Link to={serviceLeadershipPath+'/notes'}>個人備註</Link></p>
      <p>stu.best · 07-6158000#2401 · <a href="mailto:info@stu.edu.tw">info@stu.edu.tw</a></p>
    </footer>
  </div>;
}
