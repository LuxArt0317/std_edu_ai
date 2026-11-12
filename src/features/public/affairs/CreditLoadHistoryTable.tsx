import {creditLoadCategoryLabels,creditLoadHistoryColumns,type CreditLoadHistoryRecord} from '@/services/creditLoadHistory';

export function CreditLoadHistoryTable({records,userId}:{records:CreditLoadHistoryRecord[];userId:string}) {
  const own=records.filter(record=>record.userId===userId);
  return <div className="credit-load-table-wrap" role="region" aria-label="歷年超減修申請紀錄表" tabIndex={0}>
    <table aria-label={own.length?`stu.best 站內示範紀錄，共 ${own.length} 筆`:'尚無超減修申請紀錄'}>
      <colgroup>{[159.6796875,159.6796875,99.21875,341.0390625,159.6796875,159.703125].map((width,index)=><col key={index} style={{width:width/1079*100+'%'}}/>)}</colgroup>
      <thead><tr>{creditLoadHistoryColumns.map(column=><th scope="col" key={column}>{column}</th>)}</tr></thead>
      {own.length>0 && <tbody>{own.map(record=><tr key={record.id}>
        <td>{record.academicYear}</td><td>{record.semester}</td><td>{creditLoadCategoryLabels[record.category]}</td>
        <td>{record.requestedCredits.toLocaleString('zh-TW',{maximumFractionDigits:2})}</td>
        <td>{record.processText ?? '—'}</td><td>{record.resultText ?? '—'}</td>
      </tr>)}</tbody>}
    </table>
  </div>;
}
