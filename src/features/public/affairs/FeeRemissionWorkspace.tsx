import {useEffect, useState} from 'react';
import {feeRemissionFields, type FeeRemissionHistory} from '../../../../server/feeRemissionContract.js';
import {loadFeeRemissionHistory} from '@/services/feeRemission';
import {referenceHref} from '../site/reference';
import './feeRemission.css';

export function FeeRemissionWorkspace({userId}: {userId: string}) {
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{attempt: number; history: FeeRemissionHistory | null}>();
  useEffect(() => {
    const controller = new AbortController();
    void loadFeeRemissionHistory(userId, controller.signal).then(history => {
      if (!controller.signal.aborted) setResult({attempt, history});
    }).catch(() => {
      if (!controller.signal.aborted) setResult({attempt, history: null});
    });
    return () => controller.abort();
  }, [userId, attempt]);
  const current = result?.attempt === attempt ? result : undefined;

  return <main className="fee-remission" lang="zh-Hant" data-observed-on="2026-11-13">
    <section className="fee-remission-notice" aria-labelledby="fee-remission-instructions">
      <h1 id="fee-remission-instructions">注意事項</h1>
      <ol>
        <li>已享有就學費用減免者，因故於學期中轉學、休學、退學或開除學籍，之後重讀、復學或再入學就讀同一學期、年級（同一教育階段），不得重複辦理減免，且應依其實際離校日期，按比率計算應減免之學雜費。 計算標準依本校每學年公告之<a href={referenceHref('https://www.acc.stu.edu.tw/')} target="_blank" rel="noopener noreferrer">休退學退費標準表</a>計算。</li>
        <li>同時享有政府各部會子女教育補助費或弱勢助學金等就學優待資格者，不得重複申請。</li>
        <li>系統關閉期間，因故須調整減免類別或有其他減免問題者，請電洽生輔組分機2140。</li>
        <li>未能於當學期規定期限內完成申辦者，請把握第二階段開放期限完成補辦。</li>
        <li>新生如有申請學雜費減免或就學貸款，請勿前往銀行繳費， <strong>審核通過後不會再產生新的繳費單</strong>，請自行到學校出納組或進修部告知學號後繳交減免後之餘額。</li>
      </ol>
    </section>
    <p className="fee-remission-period">本梯次系統開放時間為 2026/8/1 上午 08:00:00 至 2026/11/4 下午 05:00:00 止</p>
    <p className="fee-remission-closed">目前非系統開放時間！</p>
    <div className="fee-remission-results" aria-busy={!current}>
      <table>
        <caption>申辦教育部學雜費優待減免結果</caption>
        <colgroup>{[8, 5, 12, 25, 10, 15, 25].map((width, index) => <col key={index} style={{width: `${width}%`}} />)}</colgroup>
        <thead><tr>{feeRemissionFields.map(([key, label]) => <th key={key} scope="col">{label}</th>)}</tr></thead>
        <tbody>
          {!current && <tr><td colSpan={7}><span role="status">載入中…</span></td></tr>}
          {current && !current.history && <tr><td colSpan={7}>
            <span role="alert">暫時無法確認申請紀錄。</span>{' '}
            <button type="button" onClick={() => setAttempt(value => value + 1)}>重試</button>
          </td></tr>}
          {current?.history?.records.length === 0 && <tr><td colSpan={7}>目前尚無申請紀錄</td></tr>}
          {current?.history?.records.map(row => <tr key={row.id}>
            {feeRemissionFields.map(([key]) => <td key={key}>{row[key]}</td>)}
          </tr>)}
        </tbody>
      </table>
    </div>
  </main>;
}
