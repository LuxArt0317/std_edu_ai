import {useRef} from 'react';
import {Link} from 'react-router';
import {Dialog,DialogTrigger,DialogContent,DialogTitle,DialogDescription,DialogClose} from '@/components/ui/dialog';
import {CourseSelectionSystemShell,CourseSelectionSourceIcon} from './CourseSelectionIndex';
import './creditLoadApplication.css';

const instructions=[
  '申請修習學分數超過學校規定上限，所修學分過多，可能造成課業壓力增大之影響。',
  '申請修習學分數低於學校規定下限，所修學分過少，可能造成延遲畢業之影響。',
  '本次申請超修或減修學分，是因個人修業規劃，若因課業難以負擔致學分達三分之二不及格，或 學分不足而無法準時畢業，由本人自行承擔。',
  '日間學制學生申請減修學分核准後，不得要求降低學雜費收費或退費。',
] as const;

/** The inspected source acknowledged the instructions, then reported a closed period. */
export function CreditLoadApplication() {
  const acknowledge=useRef<HTMLButtonElement>(null);
  return <CourseSelectionSystemShell title="超修減修學分系統" subtitle="首頁" application>
    <div className="credit-load-application">
      <h2 className="course-selection-system-section-title"><strong>線上申請時間：2026/8/3 上午 08:00:00 至 2026/10/2 上午 09:00:00</strong></h2>
      <div className="credit-load-application-instructions"><ol>{instructions.map(text=><li key={text}>{text}</li>)}</ol></div>
      <div className="credit-load-application-actions"><div className="credit-load-application-action-offset">
        <Dialog>
          <DialogTrigger asChild><button ref={acknowledge} type="button" className="credit-load-application-button"><CourseSelectionSourceIcon glyph={'\uf053'}/>{' '}我已了解</button></DialogTrigger>
          <DialogContent className="credit-load-application-dialog" showCloseButton={false} role="alertdialog" onCloseAutoFocus={event=>{event.preventDefault();acknowledge.current?.focus();}}>
            <DialogTitle>目前非超減修申請時間~</DialogTitle>
            <DialogDescription className="course-selection-system-visually-hidden">2026-11-13 擷取的校方未開放訊息；確認後返回相同說明，未送出申請。</DialogDescription>
            <DialogClose asChild><button className="credit-load-application-confirm" type="button">OK</button></DialogClose>
          </DialogContent>
        </Dialog>{' '}
        <Link className="credit-load-application-button credit-load-application-exit" to="/school-affairs/course-selection"><CourseSelectionSourceIcon glyph={'\uf053'}/>{' '}離開</Link>
      </div></div>
      <div className="credit-load-application-info" aria-hidden="true"><CourseSelectionSourceIcon glyph={'\uf129'}/></div>
    </div>
  </CourseSelectionSystemShell>;
}
