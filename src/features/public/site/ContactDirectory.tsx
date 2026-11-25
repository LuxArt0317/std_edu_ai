import {useState} from 'react';
import {Link} from 'react-router';
import {findPublicContacts,publicContactDirectory,publicContactPhoneHref} from '../../../../server/publicContactDirectoryContract.js';
import {referenceAsset} from './reference';
import './contactDirectory.css';

export default function ContactDirectory(){
 const [query,setQuery]=useState(''),rows=findPublicContacts(query);
 return <div className="student-site public-contact-page">
  <a className="reference-skip" href="#contact-content">跳至主要內容</a>
  <header className="reference-header"><div className="reference-header-inner">
   <Link className="reference-brand" to="/"><img src={referenceAsset('https://www.stu.edu.tw/wp-content/uploads/2025/10/stulogo500px-150x150.png')} width={56} height={56} alt=""/><span><strong>樹德科技大學</strong><small>校園聯絡資訊</small></span></Link>
   <nav aria-label="校園導覽"><a href="/">首頁</a><a href="/在校學生/">在校學生</a><a href="/行政單位/">行政單位</a><a href="/學術單位/">學術單位</a></nav>
  </div></header>
  <div className="student-title-band"><h1>{publicContactDirectory.title}</h1></div>
  <main id="contact-content" className="public-contact-content" tabIndex={-1}>
   <p>查閱目前已收錄的單位電話、分機及電子郵件。若未找到所需單位，可由行政單位或學術單位頁面繼續查詢。</p>
   <form role="search" onSubmit={event=>event.preventDefault()} className="public-contact-search"><label htmlFor="contact-query">搜尋單位、分機或電子郵件</label><div><input id="contact-query" type="search" value={query} maxLength={120} onChange={event=>setQuery(event.currentTarget.value)} placeholder="例如：教務處、國際、2242"/><button type="button" onClick={()=>setQuery('')} disabled={!query}>清除</button></div></form>
   <p role="status">顯示 {rows.length} / {publicContactDirectory.records.length} 個已收錄聯絡項目</p>
   {rows.length?<div className="public-contact-table-region" tabIndex={0} role="region" aria-label="單位聯絡資訊表，可水平捲動"><table><caption className="sr-only">已收錄的單位聯絡資訊</caption><thead><tr><th scope="col">單位</th><th scope="col">電話／分機</th><th scope="col">電子郵件</th><th scope="col">位置及資料來源</th></tr></thead><tbody>{rows.map(row=><tr key={row.id}><th scope="row">{row.name}</th><td><a href={publicContactPhoneHref(row.phone)}>{row.phone}</a>{row.extensions.length>0&&<small>分機 {row.extensions.join('、')}</small>}</td><td>{row.email?<a href={'mailto:'+row.email}>{row.email}</a>:'—'}</td><td>{row.address&&<p>{row.address}</p>}<details><summary>資料來源</summary><a href={row.source.url}>{row.source.title}</a><small>擷取日期：{row.source.capturedOn}</small></details></td></tr>)}</tbody></table></div>:<p className="public-contact-empty">找不到符合的已收錄聯絡資料。</p>}
   <p className="public-contact-note">「—」或空白欄位表示尚未收錄，不表示該單位沒有聯絡方式。分機未列出時，請透過電話或電子郵件向該單位詢問。</p>
  </main>
  <footer className="student-reference-footer"><Link to="/">回到首頁</Link><span aria-hidden="true"> · </span><Link to="/在校學生/">在校學生</Link></footer>
 </div>;
}
