import {useId,type ReactNode} from 'react';
import {Link} from 'react-router';
import {DropdownMenu,DropdownMenuContent,DropdownMenuItem,DropdownMenuTrigger} from '@/components/ui/dropdown-menu';
import {referenceAsset} from '../site/reference';
import './courseSelectionIndex.css';

const courseSelectionIndexPath='/school-affairs/course-selection';
const creditLoadEntryReference={
  observedOn:'2026-11-13',
  source:'https://infosys.stu.edu.tw/WebSelectCourse/AppOverCredit/Index',
  path:'/school-affairs/services/7-1',
} as const;

const menus=[
  {title:'選課資訊',links:[['選課記錄查詢','/school-affairs/services/11-1'],['我的課表','/school-affairs/services/11-2'],['選課確認','/school-affairs/services/6-6'],['棄選','/school-affairs/services/6-4'],['即時教學反應','/school-affairs/services/7-6']]},
  {title:'超、減修學分',links:[['超減修學分申請',creditLoadEntryReference.path],['歷年超減修申請紀錄','/school-affairs/services/11-3']]},
  {title:'抵免學分',links:[['抵免學分申請','/school-affairs/services/7-2'],['已抵免學分記錄查詢','https://infosys.stu.edu.tw/WebSelectCourse/StuCcredit/GetCreditTransfer']]},
  {title:'Index',links:[['Index',courseSelectionIndexPath],['Logout','/school-affairs/signed-out']]},
] as const;

export function CourseSelectionSourceIcon({glyph,className=''}:{glyph:string;className?:string}) {
  return <i className={`course-selection-system-icon ${className}`} aria-hidden="true">{glyph}</i>;
}

/** Shared observed WebSelectCourse chrome; no account data or application capability. */
export function CourseSelectionSystemShell({title,subtitle,application=false,children}:{title:string;subtitle:string;application?:boolean;children:ReactNode}) {
  const description=useId();
  return <div className="course-selection-system" lang="zh-Hant" data-observed-on={creditLoadEntryReference.observedOn}>
    <div className="course-selection-system-frame">
      <header className="course-selection-system-brand">
        <Link to={courseSelectionIndexPath}><img src={referenceAsset('https://info.stu.edu.tw/ePortal/assets/img/stu/stuBanner.svg')} width="20.4375" height="24" alt=""/>校務資訊管理系統</Link><span>Shu-Te University</span>
      </header>
      <nav className="course-selection-system-nav" aria-label="選課系統選單">
        {menus.map(menu=><DropdownMenu key={menu.title} modal={false}>
          <DropdownMenuTrigger asChild><button type="button">{menu.title}<span className="course-selection-system-caret" aria-hidden="true"/></button></DropdownMenuTrigger>
          <DropdownMenuContent className="course-selection-system-menu" align="end">
            {menu.links.map(([label,path])=><DropdownMenuItem asChild key={path}>{path.startsWith('https:')
              ?<a href={path} target="_blank" rel="noopener noreferrer">{label}</a>
              :<Link to={path}>{label}</Link>}</DropdownMenuItem>)}
          </DropdownMenuContent>
        </DropdownMenu>)}
      </nav>
      <nav className="course-selection-system-breadcrumb" aria-label="頁面位置">
        <CourseSelectionSourceIcon glyph={'\uf015'}/><Link to={courseSelectionIndexPath}>Index</Link>
        {application&&<><span aria-hidden="true">›</span><Link to={creditLoadEntryReference.path}>超修減修學分系統</Link></>}
      </nav>
      <main className="course-selection-system-main" aria-describedby={description}>
        <p id={description} className="course-selection-system-visually-hidden">校方頁面擷取於 2026-11-13；顯示當時的說明與申請期間，不代表目前開放狀態。</p>
        <header className="course-selection-system-heading"><h1><CourseSelectionSourceIcon glyph={'\uf19c'}/>{' '}{title}{' '}<small><CourseSelectionSourceIcon glyph={'\uf101'}/>{' '}{subtitle}</small></h1></header>
        {children}
      </main>
    </div>
    <footer className="course-selection-system-footer">stu.best</footer>
  </div>;
}

const destinations=[
  {label:'學生超減修申請',path:creditLoadEntryReference.path,description:'學生於申請開放期間內申請超減修首頁。',tone:'green'},
  {label:'學生歷年超減修申請紀錄查詢',path:'/school-affairs/services/11-3',description:'學生可使用此功能查詢在學期間所申請超減修紀錄。',tone:'blue'},
  {label:'導師審核',path:courseSelectionIndexPath+'/review/tutor',description:'導師審核',tone:'purple'},
  {label:'系主任線上審核',path:courseSelectionIndexPath+'/review/dean',description:'系主任線上審核',tone:'purple'},
  {label:'教務組線上審核',path:courseSelectionIndexPath+'/review/academic',description:'教務組線上審核',tone:'purple'},
] as const;

export function CourseSelectionIndex() {
  return <CourseSelectionSystemShell title="Index" subtitle="選課申請查詢系統">
    <div className="course-selection-index-row"><section className="course-selection-index-column" aria-labelledby="course-selection-index-functions">
      <h2 id="course-selection-index-functions" className="course-selection-system-section-title"><strong>系統功能說明</strong></h2>
      {destinations.map(item=><section className="course-selection-index-panel" key={item.path}>
        <h3><Link className={'course-selection-index-'+item.tone} to={item.path}>{item.label}</Link></h3><p>{item.description}</p>
      </section>)}
      <div className="course-selection-index-panel">
        <h3><Link className="course-selection-index-purple" to="/school-affairs/services/11-1">選課記錄查詢</Link></h3>
        <h3><Link className="course-selection-index-purple" to="/school-affairs/services/11-2">學生一周課表首頁</Link></h3>
        <h3><Link className="course-selection-index-purple" to="/school-affairs/services/7-6">線上教學反應</Link></h3>
        <h3><Link className="course-selection-index-purple" to="/school-affairs/services/6-4">棄選</Link></h3>
      </div>
    </section></div>
  </CourseSelectionSystemShell>;
}
