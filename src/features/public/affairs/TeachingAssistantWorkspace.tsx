import {useState} from 'react';
import {Link, useNavigate} from 'react-router';
import {ChevronDown, House, Info, Settings, UsersRound} from 'lucide-react';
import {Dialog, DialogContent, DialogTitle} from '@/components/ui/dialog';
import {DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger} from '@/components/ui/dropdown-menu';
import {referenceAsset} from '../site/reference';
import {teachingAssistantPath} from './studentServices.js';
import './teaching-assistant.css';
const title = '教學助理(TA)管理系統';
const evaluation = '教學助理自我評表';
const logo = referenceAsset('https://info.stu.edu.tw/ePortal/assets/img/stu/stuBanner.svg');

export function TeachingAssistantWorkspace({view}: {view: '' | 'report' | 'evaluation'}) {
  const navigate = useNavigate();
  const [settings,setSettings] = useState(false);
  const [fontSize,setFontSize] = useState(16);
  const returnToIndex = () => navigate(teachingAssistantPath,{replace:true});
  if (view === 'evaluation') return <div className="ta-event-page" lang="zh-Hant">
    <main className="ta-event-frame">
      <div className="ta-event-content">
        <h1><img src={logo} width="40" height="44" alt="" />校務系統事件訊息</h1>
        <div className="ta-event-message"><UsersRound aria-hidden="true" /><p>無問卷記錄，期待下次您的協助與配合。</p></div>
        <p className="ta-event-related">相關連結：<Link to={teachingAssistantPath}>{title}</Link></p>
        <p className="ta-event-help">如有問題，請與電算中心聯繫。</p>
      </div>
      <footer>stu.best</footer>
    </main>
  </div>;
  return <div className="ta-index" lang="zh-Hant">
    <div className="ta-index-band">
      <div className="ta-index-frame">
        <header><Link to={teachingAssistantPath}><img src={logo} width="19" height="24" alt="" />{title}</Link><span>Shu-Te University</span></header>
        <nav className="ta-index-menu" aria-label="學生選單">
          <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild><button type="button">學生 <ChevronDown size={12} aria-hidden="true" /></button></DropdownMenuTrigger>
            <DropdownMenuContent align="end" sideOffset={0} className="ta-index-dropdown">
              <DropdownMenuItem asChild><Link to={teachingAssistantPath+'/report'}>撰寫/維護學習單</Link></DropdownMenuItem>
              <DropdownMenuItem asChild><Link to={teachingAssistantPath+'/evaluation'}>{evaluation}</Link></DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </nav>
        <nav className="ta-index-crumb" aria-label="頁面位置"><House size={17} aria-hidden="true" /><Link to={teachingAssistantPath}>Home</Link></nav>
        <main style={{fontSize}}>
          <div className="ta-index-settings">
            <button type="button" className="ta-index-gear" aria-label="顯示設定" aria-expanded={settings} onClick={()=>setSettings(value=>!value)}><Settings size={20} aria-hidden="true" /></button>
            {settings && <div><span>Font Size</span>
              <button type="button" disabled={fontSize<=13} onClick={()=>setFontSize(value=>value-1)}>-A</button>
              <button type="button" disabled={fontSize>=21} onClick={()=>setFontSize(value=>value+1)}>+A</button>
            </div>}
          </div>
          <section>
            <h1><Info size={15} aria-hidden="true" />系統功能說明:</h1>
            <table><thead><tr><th scope="col">項目</th><th scope="col">程式</th><th scope="col">說明</th></tr></thead>
              <tbody><tr><th scope="row">學生</th><td><ol><li><Link to={teachingAssistantPath+'/evaluation'}>{evaluation}</Link></li></ol></td>
                <td><ol><li>每年6月及12月填寫學習單前，請先填寫「{evaluation}」。</li></ol></td></tr></tbody>
            </table>
          </section>
        </main>
      </div>
    </div>
    <footer>stu.best</footer>
    {view === 'report' && <Dialog open onOpenChange={open=>{if(!open) returnToIndex();}}>
      <DialogContent role="alertdialog" showCloseButton={false}>
        <DialogTitle>目前無法開啟學習單。</DialogTitle>
        <button className="ta-report-confirm" type="button" onClick={returnToIndex}>確定</button>
      </DialogContent>
    </Dialog>}
  </div>;
}
