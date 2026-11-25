import {useState, type ReactNode} from 'react';
import {Link} from 'react-router';
import {ChevronDown, House, Info, RotateCcw, Settings} from 'lucide-react';
import {DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger} from '@/components/ui/dropdown-menu';
import {Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle} from '@/components/ui/dialog';
import {ExchangeGrantRecords} from './ExchangeGrantRecords';
import {exchangeReceiptNotice} from './noticePages.js';
import {ServiceNoticeAssistant} from './ServiceNoticeAssistant';
import {referenceAsset} from '../site/reference';
import {
  exchangeGrantDirections, exchangeGrantManual, exchangeGrantMenu, exchangeGrantPath,
  exchangeGrantTitle, grantRulesIndex, type ExchangeGrantKind,
} from './exchangeGrantReference';
import './exchangeGrant.css';

const href = (view: string) => `${exchangeGrantPath}/${view}`;

function GrantShell({view, title, compact, children}: {view: string; title?: string; compact?: boolean; children: ReactNode}) {
  const [fontSize, setFontSize] = useState(16);
  const [settings, setSettings] = useState(false);
  return <div className="exchange-grant" lang="zh-Hant" data-observed-on="2026-11-13">
    <div className="exchange-grant-frame">
      <header className="exchange-grant-brand">
        <Link to={exchangeGrantPath}><img src={referenceAsset('https://info.stu.edu.tw/ePortal/assets/img/stu/stuBanner.svg')} width="19" height="24" alt="" />
          {compact ? title : exchangeGrantTitle}</Link>
        {!compact && <span>Shu-Te University</span>}
      </header>
      {!compact && <nav className="exchange-grant-menu" aria-label="學生功能選項">
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild><button type="button">學生功能選項 <ChevronDown size={13} aria-hidden="true" /></button></DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="exchange-grant-dropdown">
            {exchangeGrantMenu.map(item => <DropdownMenuItem key={item.key} asChild>
              <Link to={href(item.key)}>{item.label}</Link>
            </DropdownMenuItem>)}
          </DropdownMenuContent>
        </DropdownMenu>
      </nav>}
      <nav className="exchange-grant-crumb" aria-label="頁面位置">
        {!compact && <><House size={17} aria-hidden="true" /><Link to={exchangeGrantPath}>{view ? '學生' : 'Home'}</Link>
          {view && <><span aria-hidden="true">›</span><span>{title}</span></>}</>}
      </nav>
      <main className="exchange-grant-main" style={{fontSize}}>
        <div className="exchange-grant-settings">
          <button className="exchange-grant-gear" type="button" aria-label="顯示設定" aria-expanded={settings} onClick={() => setSettings(value => !value)}>
            <Settings size={20} aria-hidden="true" />
          </button>
          {settings && <div className="exchange-grant-settings-panel" aria-label="字型大小">
            <span>Font Size</span>
            <button type="button" disabled={fontSize <= 13} onClick={() => setFontSize(value => value - 1)}>-A</button>
            <button type="button" disabled={fontSize >= 21} onClick={() => setFontSize(value => value + 1)}>+A</button>
          </div>}
        </div>
        {children}
      </main>
    </div>
    <footer className="exchange-grant-footer">stu.best</footer>
  </div>;
}

function GrantIndex({receipt}: {receipt: boolean}) {
  return <GrantShell view="">
    <section className="exchange-grant-column" aria-labelledby="grant-functions">
      <h1 id="grant-functions"><Info size={15} aria-hidden="true" /> 系統功能說明:</h1>
      <table className="exchange-grant-index-table">
        <thead><tr><th scope="col">角色</th><th scope="col">功能項目</th><th scope="col">功能說明</th></tr></thead>
        <tbody>
          {exchangeGrantMenu.map(item => <tr key={item.key}>
            <td>{item.role}</td><td><Link to={href(item.key)}>{item.label}</Link></td><td>{item.description}</td>
          </tr>)}
          <tr><td>操作手冊</td><td><a className="exchange-grant-manual" href={exchangeGrantManual} target="_blank" rel="noopener noreferrer">操作手冊</a></td><td>操作手冊</td></tr>
        </tbody>
      </table>
    </section>
    {receipt && <ReceiptNotice />}
  </GrantShell>;
}

function ReceiptNotice() {
  return <Dialog open>
    <DialogContent showCloseButton={false} role="alertdialog" className="exchange-grant-dialog" onEscapeKeyDown={event => event.preventDefault()} onInteractOutside={event => event.preventDefault()}>
      <DialogTitle>{exchangeReceiptNotice.title}</DialogTitle>
      <DialogDescription>返回助學金申請管理系統。</DialogDescription>
      <DialogClose asChild><Link className="exchange-grant-button" to={exchangeGrantPath} replace>確定</Link></DialogClose>
      <ServiceNoticeAssistant />
    </DialogContent>
  </Dialog>;
}

function GrantDirections({kind}: {kind: ExchangeGrantKind}) {
  const reference = exchangeGrantDirections[kind];
  return <GrantShell view={kind} title={reference.title} compact>
    <div className="exchange-grant-column exchange-grant-directions">
      <section className="exchange-grant-instructions" aria-labelledby="grant-instructions">
        <h1 id="grant-instructions">一、作業說明：</h1>
        <p>1.申請：申請人應於活動舉辦首日之二週前檢附下列文件，由所屬系（所）或行政單位逐級簽章後送至學生事務處生活輔導組辦理，並於出發前完成簽核。</p>
        <p>2.結案：「獲補助者應於活動結束後」，檢附下列文件向學生事務處生活輔導組辦理結案備查：</p>
        <ol>{reference.closing.map((item,index) => <li key={item}>（{'一二三四五'[index]}）{item}</li>)}</ol>
        <p className="exchange-grant-attachment"><a href={grantRulesIndex} target="_blank" rel="noopener noreferrer">附件：{reference.rulesTitle}</a></p>
      </section>
      <section className="exchange-grant-consent" aria-labelledby="grant-collection">
        <h2 id="grant-collection">二、資料收集說明：</h2>
        <p>在 stu.best 儲存的申請草稿與心得報告會保存在您的帳戶。</p>
        <div className="exchange-grant-actions">
          <Link className="exchange-grant-button" to={exchangeGrantPath}><RotateCcw size={13} aria-hidden="true" /> 不同意，離開本系統</Link>
          {kind === 'conference' ? <Link className="exchange-grant-button exchange-grant-save" to={href('conference/application')}>{reference.title}</Link>
            : <span className="exchange-grant-unavailable">申請表暫未開放於此網站</span>}
        </div>
      </section>
    </div>
  </GrantShell>;
}

export function ExchangeGrantWorkspace({view, userId, displayName}: {
  view: string; userId: string; displayName: string;
}) {
  if (view === 'conference' || view === 'exchange') return <GrantDirections kind={view} />;
  if (view === 'reports' || view === 'conference/application') {
    const reports = view === 'reports';
    const title = reports ? exchangeGrantMenu[2].label : exchangeGrantDirections.conference.formTitle;
    return <GrantShell view={view} title={title}>
      <ExchangeGrantRecords key={`${userId}:${view}`} userId={userId} displayName={displayName} reports={reports} />
    </GrantShell>;
  }
  return <GrantIndex receipt={view === 'receipts'} />;
}
