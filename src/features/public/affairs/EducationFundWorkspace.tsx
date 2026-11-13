import {Fragment} from 'react';
import {Link} from 'react-router';
import {educationFundReference as reference} from './educationFundContent';
import './educationFund.css';

/** The observed closed-period instructions contain no personal records or form. */
export function EducationFundWorkspace() {
  return <div className="education-fund" lang="zh-Hant" data-observed-on={reference.observedOn}>
    <div className="education-fund-shell">
      <header className="education-fund-header">
        <div className="education-fund-banner"><span>Information Integration System</span><span>Shu-Te University</span></div>
        <div className="education-fund-heading">
          <div className="education-fund-heading-row">
            <div className="education-fund-logo"><img src="/school-assets/03599fb12dbe1c0d2b5c.png" alt="" width="50" height="50"/></div>
            <h1>{reference.title}</h1>
          </div>
          <div className="education-fund-breakline" aria-hidden="true"/><div className="education-fund-left-breakline" aria-hidden="true"/>
        </div>
      </header>
      <main className="education-fund-container">
        <div className="education-fund-content"><div className="education-fund-region">
          <article className="education-fund-instructions" aria-labelledby="education-fund-instructions-title">
            <h2 id="education-fund-instructions-title">{reference.instructionsTitle}</h2>
            {reference.sections.map(section=><Fragment key={section.title}>
              <h3>{section.title}</h3>
              <div className={'education-fund-section'+(!('items' in section)&&!('paragraph' in section)?' education-fund-section-empty':'')}>
                {'items' in section?<ol>{section.items.map(item=><li key={item}>{item}</li>)}</ol>
                  :'paragraph' in section?<p>{'emphasized' in section?<em>{section.paragraph}</em>:section.paragraph}</p>:null}
              </div>
            </Fragment>)}
            <div className="education-fund-section education-fund-period"><p>{reference.periodText}</p></div>
          </article>
        </div></div>
      </main>
    </div>
    <footer className="education-fund-footer">
      <nav aria-label="學產助學金頁尾導覽">
        <Link to="/school-affairs/signed-out">登出</Link>{' '}
        <Link to={reference.path}>HomePage</Link>{' '}
        <Link to="/school-affairs">校務資訊系統</Link>{' '}
        <Link to="/">學校首頁</Link>{' '}
        <Link to="/student-sso">mySTU</Link>
      </nav>
      <p>stu.best | 07-6158000#2401</p>
      <p>For processing problems, please call 6158000-2401 or e-mail info@stu.edu.tw.</p>
    </footer>
  </div>;
}
