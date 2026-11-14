import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { downloadHealthReport, loadHealthExaminations } from '@/services/healthExaminations';
import {
  healthCardUrl, healthExaminationPath, healthPageSize, type HealthExaminationResult,
} from '../../../../server/healthExaminationContract.js';
import './aidPayments.css';
import './healthExaminations.css';

export function HealthExaminations({ userId }: { userId: string }) {
  const [params] = useSearchParams();
  const raw = params.get('page') ?? '1';
  const page = /^[1-9]\d{0,2}$/.test(raw) && Number(raw) <= 201 ? Number(raw) : 1;
  return <HealthExaminationPage key={userId + ':' + page} userId={userId} page={page} />;
}

function HealthExaminationPage({ userId, page }: { userId: string; page: number }) {
  const [data, setData] = useState<HealthExaminationResult | null>(null);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState(false);
  const download = useRef<AbortController | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    void loadHealthExaminations(userId, page, controller.signal).then(
      result => { if (!controller.signal.aborted) setData(result); },
      () => { if (!controller.signal.aborted) setError(true); },
    );
    return () => controller.abort();
  }, [userId, page, attempt]);
  useEffect(() => () => download.current?.abort(), []);

  async function saveReport(id: string) {
    if (download.current) return;
    const controller = new AbortController();
    download.current = controller;
    setDownloading(id);
    setDownloadError(false);
    try {
      await downloadHealthReport(userId, id, controller.signal);
    } catch {
      if (!controller.signal.aborted) setDownloadError(true);
    } finally {
      download.current = null;
      if (!controller.signal.aborted) setDownloading(null);
    }
  }

  const pageCount = Math.max(1, Math.min(201, Math.ceil((data?.total ?? 0) / healthPageSize)));
  const link = (next: number) => healthExaminationPath + (next > 1 ? '?page=' + next : '');

  return <div className="aid-payment-site health-examination" id="health-examination-top" lang="zh-Hant">
    <div className="aid-payment-shell">
      <header className="aid-payment-brand"><span>學生健康管理系統</span><span lang="en">Shu-Te University</span></header>
      <div className="aid-payment-banner">
        <h1><img src="/stu-reference/pending-fees-banner.svg" alt="" width="40" height="40" />學生健檢紀錄查詢作業</h1>
        <nav aria-label="學生健康管理功能">
          <Link to={healthExaminationPath} aria-current="page">健檢報告查詢作業</Link>
          <a href={healthCardUrl} target="_blank" rel="noreferrer">學生健康資料卡</a>
        </nav>
      </div>
      <main className="aid-payment-main">
        <div className="health-examination-notes">
          <p>申請紙本健檢報告，請學生本人持身分證或學生證至壹軒樓一樓健康促進中心。</p>
          <p>如有疑問，請聯絡健康促進中心（校內分機 2108）。</p>
        </div>
        <div className="aid-payment-table health-examination-table" role="region" aria-label="健檢紀錄" tabIndex={0}>
          <table>
            <caption className="sr-only">學生健檢紀錄</caption>
            <thead>
              <tr>{['健檢編號', '學號', '姓名', '班級', '查詢'].map(column => <th key={column} scope="col">{column}</th>)}</tr>
            </thead>
            <tbody>{data?.rows.map(row => <tr key={row.id}>
              <td>{row.examination_code}</td>
              <td>{row.student_number}</td>
              <td>{row.student_name}</td>
              <td>{row.class_label}</td>
              <td>{row.report_available
                ? <button type="button" disabled={downloading !== null} onClick={() => void saveReport(row.id)}>
                  {downloading === row.id ? '下載中…' : '下載健檢報告'}
                </button>
                : '—'}</td>
            </tr>)}</tbody>
          </table>
          {!data && !error && <p role="status">讀取紀錄中…</p>}
          {error && <p role="alert">無法讀取健檢紀錄。 <button type="button" onClick={() => { setError(false); setAttempt(value => value + 1); }}>重試</button></p>}
          {downloadError && <p role="alert">無法下載健檢報告，請重試。</p>}
          {data && !data.total && <p role="status">此帳戶目前沒有健檢紀錄。</p>}
          {data && page > pageCount && <p>此頁沒有紀錄。 <Link to={link(pageCount)}>最後一頁</Link></p>}
          {data && pageCount > 1 && page <= pageCount && <nav aria-label="紀錄分頁" className="aid-payment-pages">
            {page > 1 && <Link to={link(page - 1)}>上一頁</Link>}
            <span>{page} / {pageCount}</span>
            {page < pageCount && <Link to={link(page + 1)}>下一頁</Link>}
          </nav>}
        </div>
        <div className="aid-payment-top"><a href="#health-examination-top">▴ top</a></div>
      </main>
      <footer><Link to="/">學校首頁</Link> · <Link to="/school-affairs">mySTU</Link></footer>
    </div>
  </div>;
}
