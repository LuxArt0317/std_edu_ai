import {isOfficialLibraryHoursLead,libraryAnswerLanguage} from './publicLibrarySources.js';

const readingArea = '各樓層閱覽區';
const tableTitle = '開館時間';
const weekdayHeader = ['區域', '週一至週四 Mon. - Thu.', '週五 Fri.'];
const weekdayEnglish = /^what are the (?:regular )?weekday (?:opening )?hours (?:for|of) (?:the )?(?:stu|shu[- ]te university) library reading areas$/iu;
const weekdayChinese = /^(?:樹德科技大學|樹德科大|樹德)圖書館(?:的)?各樓層閱覽區(?:週一(?:至|到)週四(?:與|和|及)週五|平日)(?:的)?(?:開館|開放)時間(?:是幾點|是什麼|為何)?$/u;

export function asksForLibraryWeekdayHours(question) {
  const text = question.normalize('NFKC').trim().replace(/[?。.!！]+$/u, '').trim();
  return weekdayEnglish.test(text) || weekdayChinese.test(text);
}

function parseTimeRange(value) {
  if (typeof value !== 'string') return null;
  const match = /^([01]\d|2[0-3]):([0-5]\d)\s*[~-]\s*([01]\d|2[0-3]):([0-5]\d)$/u.exec(value.normalize('NFKC').replace(/[–—]/gu,'-'));
  if (!match) return null;
  const [, openHour, openMinute, closeHour, closeMinute] = match;
  const open = openHour + ':' + openMinute, close = closeHour + ':' + closeMinute;
  return open < close ? open + '–' + close : null;
}

const plainText = value => value.replace(/\s+/gu,' ').trim();
const regularCell = (cell,tag) => cell.tag===tag && [undefined,'1'].includes(cell.colSpan) && [undefined,'1'].includes(cell.rowSpan);

/** Use a unique visible schedule table with an unambiguous reading-area row. */
export function readLibraryWeekdayTable($, root) {
  const visible = root.clone();
  const hiddenStyle = /(?:^|;)\s*(?:display\s*:\s*none|visibility\s*:\s*hidden)(?:\s*[!;]|\s*$)/iu;
  if (hiddenStyle.test(visible.attr('style')||'')) return null;
  visible.find('[style]').filter((_,node)=>hiddenStyle.test($(node).attr('style')||'')).remove();
  if (plainText(visible.find('h1').first().text()) !== tableTitle) return null;
  const tableRows = visible.find('table').toArray().map(table=>$(table).find('tr').toArray()
    .filter(row=>$(row).closest('table')[0]===table)
    .map(row=>$(row).children('th,td').toArray().map(node=>{
      const cell=$(node);
      return {value:plainText(cell.text()),tag:node.tagName,colSpan:cell.attr('colspan'),rowSpan:cell.attr('rowspan')};
    })));
  const schedules = tableRows.filter(rows=>rows.some(row=>row[0]?.value===readingArea));
  if (schedules.length !== 1) return null;
  const [title,header,...dataRows] = schedules[0];
  if (title?.length !== 1 || title[0].tag !== 'th' || title[0].value !== tableTitle
    || ![undefined,'3'].includes(title[0].colSpan) || ![undefined,'1'].includes(title[0].rowSpan)
    || header?.length !== weekdayHeader.length || header.some((cell,index)=>!regularCell(cell,'th')||cell.value!==weekdayHeader[index])) return null;
  const matches = dataRows.filter(row=>row[0]?.value===readingArea);
  if (matches.length !== 1 || matches[0].length !== weekdayHeader.length || !matches[0].every(cell=>regularCell(cell,'td'))) return null;
  const mondayThroughThursday = parseTimeRange(matches[0][1].value);
  const friday = parseTimeRange(matches[0][2].value);
  return mondayThroughThursday && friday ? {mondayThroughThursday,friday} : null;
}

export function answerLibraryWeekdayHours(question,evidence) {
  const exactSources=evidence.filter(source=>source.id==='library:opening-hours'&&isOfficialLibraryHoursLead(source.url));
  if (exactSources.length!==1) return null;
  const [source]=exactSources, table=source.libraryWeekdayHours;
  const mondayThroughThursday=parseTimeRange(table?.mondayThroughThursday),friday=parseTimeRange(table?.friday);
  if (!mondayThroughThursday || !friday) return null;
  const capturedOn=source.capturedOn;
  if (capturedOn!==undefined && (typeof capturedOn!=='string' || !/^\d{4}-\d{2}-\d{2}$/u.test(capturedOn)
    || Number.isNaN(Date.parse(capturedOn)) || new Date(capturedOn).toISOString().slice(0,10)!==capturedOn)) return null;
  const chinese=libraryAnswerLanguage(question)==='zh-Hant';
  const lines=chinese
    ? ['圖書館各樓層閱覽區的平日開館時間：','- 週一至週四：'+mondayThroughThursday,'- 週五：'+friday]
    : ['Regular weekday hours for the library reading areas on each floor:','- Monday–Thursday: '+mondayThroughThursday,'- Friday: '+friday];
  const title=chinese?'樹德科技大學圖書館開館時間':'STU Library opening hours';
  const step={kind:'library-weekday-hours-check',label:chinese?'已核對閱覽區平日開館時間':'Checked the reading-area weekday schedule',
    detail:chinese?'從圖書館公告表格核對週一至週四與週五的時間。':'Matched both weekday columns in the published library schedule.',status:'complete'};
  return {
    status:'answered',
    answer:[lines.join('\n'),`[${title}](${source.url})`,...(capturedOn?[chinese?'擷取日期：'+capturedOn:'Source snapshot: '+capturedOn]:[])].join('\n\n'),
    citations:[{chunkId:source.id,url:source.url,title,claim:lines.slice(1).join(' '),
      sourceName:capturedOn?'Public page snapshot · '+capturedOn:'STU Library',
      locator:capturedOn?'Captured '+capturedOn:null,effectiveAt:null,reviewedAt:null}],
    grounding:{source:'web',webSearched:false,officialOnly:true,checkedAt:new Date().toISOString()},
    verification:{status:'verified',attempts:1},suggestedQuestions:[],activity:[step],
  };
}
