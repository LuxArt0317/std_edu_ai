import {schoolAffairsDatabaseConfiguration} from './affairsWorkspace.js';
import {readFeeRemissionJson as readBoundedJson} from './feeRemissionContract.js';
import {
  firstSelectionDate, firstSelectionFeesPath, firstSelectionPath, firstSelectionPhases, firstSelectionScope,
} from '../src/features/public/affairs/firstSelection.js';

const windowsRelation = 'affairs_first_selection_windows';
const date = /^\d{4}-\d{2}-\d{2}$/u;
const isoTime = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/u;
const text = (value, limit) => typeof value === 'string' && value.length <= limit && Boolean(value.trim()) &&
  !/[\u0000-\u001f\u007f]/u.test(value);
const paragraphs = value => Array.isArray(value) && value.length >= 1 && value.length <= 10 && value.every(item => text(item, 2000));
const time = value => typeof value === 'string' && isoTime.test(value) && Number.isFinite(Date.parse(value));

export function parseFirstSelectionNotice(rows) {
  const row = rows?.[0];
  if (!Array.isArray(rows) || rows.length !== 1 || !row || !Number.isInteger(row.academic_year) ||
      row.academic_year < 100 || row.academic_year > 999 || ![1,2].includes(row.semester) ||
      typeof row.observed_on !== 'string' || !date.test(row.observed_on) || !Number.isFinite(Date.parse(row.observed_on)) ||
      ![row.notices,row.reminders,row.fee_notes,row.fee_notes_en].every(paragraphs) ||
      row.fee_notes.length !== row.fee_notes_en.length) throw new Error('Invalid first selection notice.');
  const windows = row[windowsRelation];
  if (!Array.isArray(windows) || windows.length !== firstSelectionPhases.length) throw new Error('Incomplete first selection schedule.');
  const ordered = windows.slice().sort((a,b) => a?.phase - b?.phase);
  if (!ordered.every((window,index) => window?.phase === index + 1 && time(window.opens_at) && time(window.closes_at) &&
      Date.parse(window.opens_at) < Date.parse(window.closes_at) &&
      (index === 0 || Date.parse(ordered[index - 1].closes_at) <= Date.parse(window.opens_at)) &&
      text(window.audience,200) && text(window.audience_en,200) && text(window.details,600))) throw new Error('Invalid first selection window.');
  return {
    academicYear: row.academic_year, semester: row.semester, observedOn: row.observed_on,
    notices: row.notices, reminders: row.reminders, feeNotes: row.fee_notes, feeNotesEn: row.fee_notes_en,
    windows: ordered.map(window => ({
      phase:window.phase, opensAt:window.opens_at, closesAt:window.closes_at,
      audience:window.audience, audienceEn:window.audience_en, details:window.details,
    })),
  };
}

export async function loadFirstSelectionNotice({fetchNotice = fetch} = {}) {
  const {url,key} = schoolAffairsDatabaseConfiguration();
  const target = new URL(url + '/rest/v1/affairs_first_selection_notices');
  target.search = new URLSearchParams({
    select:'academic_year,semester,observed_on,notices,reminders,fee_notes,fee_notes_en,' + windowsRelation + '(phase,opens_at,closes_at,audience,audience_en,details)',
    order:'academic_year.desc,semester.desc', limit:'1',
  }).toString();
  const response = await fetchNotice(target, {headers:{apikey:key}, signal:AbortSignal.timeout(5000), redirect:'error'});
  if (!response.ok) throw new Error('First selection notice unavailable.');
  return parseFirstSelectionNotice(await readBoundedJson(response));
}

export async function serveFirstSelectionNotice(request,response) {
  response.setHeader('Cache-Control','no-store');
  response.setHeader('X-Content-Type-Options','nosniff');
  if (request.method !== 'GET') {
    response.setHeader('Allow','GET');
    response.status(405).json({error:'Method not allowed.'});
    return;
  }
  const {scope,...extra} = request.query ?? {};
  if (scope !== firstSelectionScope || Object.keys(extra).length) {
    response.status(400).json({error:'Choose only the first selection notice scope.'});
    return;
  }
  try {
    response.status(200).json(await loadFirstSelectionNotice());
  } catch {
    response.status(503).json({error:'初選公告暫時無法載入。'});
  }
}

const markdownText = value => value.replace(/[\\`*_{}\[\]<>()#+!|]/gu,'\\$&');
export async function answerFirstSelectionNotice(view, question, readNotice = loadFirstSelectionNotice) {
  const zh = /[\u3400-\u9fff]/u.test(question);
  const fees = view === 'fees';
  const url = fees ? firstSelectionFeesPath : firstSelectionPath;
  const title = fees ? (zh ? '初選收費說明' : 'Initial selection fee notice') : (zh ? '初選時程' : 'Initial course selection schedule');
  const kind = 'first-selection';
  try {
    const notice = await readNotice();
    const statedYears = Array.from(question.matchAll(/\b(1\d{2}|20\d{2})(?=\s*(?:學年|年|[-–]\s*[12]\b))|\bacademic year\s+(1\d{2}|20\d{2})\b/giu),
      match => Number(match[1] ?? match[2]));
    const statedTerm = question.match(/\bsemester\s*([12])\b|第([一二12])學期|\b1\d{2}[-–]\s*([12])\b/iu);
    const term = statedTerm?.[1] ?? statedTerm?.[2] ?? statedTerm?.[3];
    const semester = {一:1,二:2}[term] ?? Number(term);
    if (statedYears.some(year => year !== notice.academicYear && year !== notice.academicYear + 1911) ||
        (semester && semester !== notice.semester)) {
      const detail = zh ? '沒有找到所詢問學期的初選公告。' : 'There is no saved first-selection notice for the requested term.';
      return {
        status:'handoff',answer:detail + ` [${title}](${url})`,citations:[],suggestedQuestions:[],
        grounding:{source:'assistant-help',webSearched:false},
        activity:[{kind,label:title,detail,status:'unavailable'}],
      };
    }
    const dateFormat = value => firstSelectionDate(new Date(value), zh ? 'zh-Hant-TW' : 'en-GB');
    const label = zh
      ? `學年 ${notice.academicYear} · 第 ${notice.semester} 學期 · 台北時間 · 公告擷取於 ${notice.observedOn}`
      : `Academic year ${notice.academicYear}, semester ${notice.semester} · Taipei time · notice captured ${notice.observedOn}`;
    const rows = fees
      ? (zh ? notice.feeNotes : notice.feeNotesEn).map(markdownText)
      : notice.windows.map(window => {
        const audience = markdownText(zh ? window.audience : window.audienceEn);
        return `${firstSelectionPhases[window.phase - 1]} · ${dateFormat(window.opensAt)}–${dateFormat(window.closesAt)} · ${audience}`;
      });
    const claim = zh ? '已擷取的初選公告。' : 'Published first-selection notice saved in School Affairs.';
    const ended = notice.windows.every(window => Date.parse(window.closesAt) <= Date.now());
    const scope = ended
      ? (zh ? '此公告的三個時段均已結束。尚無後續時程可供此公告確認。' : 'All three windows in this notice have ended. The notice gives no dates for the next term.')
      : (zh ? '此公告適用於上述學期。個人資格須另外確認。' : 'These dates apply to the listed term. Personal eligibility requires separate records.');
    return {
      status:'answered',
      answer:label + '\n\n' + rows.map(row => '- ' + row).join('\n') + '\n\n' + (fees ? '' : scope + '\n\n') + `[${title}](${url})`,
      citations:[{chunkId:kind + ':' + view,claim,title,sourceName:'stu.best School Affairs',url,locator:null,effectiveAt:null,reviewedAt:notice.observedOn}],
      suggestedQuestions:[], grounding:{source:'directory',webSearched:false},
      activity:[{kind,label:title,detail:claim,status:'complete'}],
    };
  } catch {
    const detail = zh ? '初選公告暫時無法載入。' : 'The published first-selection notice is temporarily unavailable.';
    return {
      status:'handoff', answer:detail + ` [${title}](${url})`, citations:[], suggestedQuestions:[],
      grounding:{source:'assistant-help',webSearched:false},
      activity:[{kind,label:title,detail,status:'unavailable'}],
    };
  }
}
