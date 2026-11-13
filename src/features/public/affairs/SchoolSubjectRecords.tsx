import {ArrowLeft, BookOpen} from 'lucide-react';
import {Link} from 'react-router';
import {Button} from '@/components/ui/button';
import {studyCalendar} from '../../../../server/affairsSchedule.js';
import type {AffairsSnapshot} from '@/services/schoolAffairsWorkspace';
import {StudentRecordQuery} from './StudentRecordQuery';
import './student-services.css';

type Props = {snapshot:AffairsSnapshot|undefined;loading:boolean;error?:string;reload:()=>void};

export function SchoolSubjectRecords({snapshot,loading,error,reload}:Props) {
  const checkedAt = snapshot?.checkedAt;
  const calendar = snapshot && checkedAt && Number.isFinite(Date.parse(checkedAt))
    ? studyCalendar(snapshot.courses,checkedAt)
    : null;
  const next = calendar?.next;
  return <main className="student-service school-subject-records" lang="zh-Hant" aria-busy={loading}>
    <Link className="student-service-back" to="/school-affairs/menu/aca/all"><ArrowLeft size={16} aria-hidden="true" /> 教務系統</Link>
    <header className="student-service-title">
      <BookOpen aria-hidden="true" /><h1>我的修課紀錄</h1>
    </header>
    <div className="student-service-body">
      {loading && <p role="status">載入紀錄中…</p>}
      {error && <p role="alert" className="student-service-error">{error} <Button type="button" size="sm" variant="outline" disabled={loading} onClick={reload}>重新載入</Button></p>}
      {!error && !loading && snapshot && <>
        {calendar && <dl className="school-subject-times">
          <div><dt>今天的課程</dt><dd>{calendar.today.length ? <ul>{calendar.today.map(course=>
            <li key={course.enrollmentId}>{course.startsAt.slice(0,5)} · {course.title}{course.room ? ' · '+course.room : ''}</li>)}</ul> : '已儲存課程在今天無上課時段。'}</dd></div>
          <div><dt>下一堂課</dt><dd>{next ? `${next.day} ${next.course.startsAt.slice(0,5)} · ${next.course.title}${next.course.room ? ' · '+next.course.room : ''}` : '目前沒有可確認的上課時段。'}</dd></div>
        </dl>}
        <StudentRecordQuery kind="enrollments" snapshot={snapshot} title="我的修課紀錄" />
      </>}
    </div>
  </main>;
}
