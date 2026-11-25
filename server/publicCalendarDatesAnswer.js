import source from './data/calendarText.json' with {type:'json'};
import {publicCalendarContext,isPublicCalendarDateQuestion} from './publicCalendarEvidence.js';
import {assistantLanguage} from '../src/services/assistantLanguage.js';
import {publicPageForRoute} from './publicPageContext.js';

/** A literal source-row fallback for dense date tables, not an authored FAQ answer. */
export function publicCalendarDatesAnswer(question){
 if(!isPublicCalendarDateQuestion(question)||!/\bsemester\b|學期/iu.test(question)||!/\b(?:dates?|periods?)\b|日期|期間/iu.test(question)||!/\b(?:holidays?|exams?)\b|假日|考試|期中|期末/iu.test(question))return null;
 const context=publicCalendarContext(question);if(!context)return null;
 const document=source.documents.find(row=>row.url===context.evidence.url);if(!document)return null;
 const events=JSON.parse(context.evidence.content).events;
 const main=events.filter(row=>!/holiday/iu.test(row.event));
 const holidays=events.filter(row=>/holiday/iu.test(row.event));
 const zh=assistantLanguage(question)==='zh-Hant';
 const table=rows=>`| ${zh?'日期':'Date'} | ${zh?'行事曆項目（原文）':'Published event / period'} |\n| --- | --- |\n`+rows.map(row=>`| ${row.date} | ${row.event.replaceAll('|','\\|')} |`).join('\n');
 const answer=(zh?`以下是 **${document.academicYear}學年度**[英文行事曆](${document.url})所列的日期。行政學期起訖與實際開課日不同；畢業班期末考另列。`:
  `Here are the dates in the **${document.academicYear} academic-year [calendar](${document.url})**. Administrative semester dates differ from the first day of classes; graduating-class finals are listed separately.`)
  +'\n\n'+table(main)+'\n\n'+(zh?'假日與補假：':'Published holidays and compensatory days:')+'\n\n'+table(holidays)
  +'\n\n'+(zh?`請以[完整行事曆](${source.directoryUrl})與教務處後續公告確認修訂。天災停課依高雄市政府公告；此靜態行事曆不能預測緊急停課。`:
   `Use the [calendar downloads](${source.directoryUrl}) and later Academic Affairs announcements for amendments. Natural-disaster suspensions follow Kaohsiung City Government announcements; this static calendar cannot predict emergency closures.`);
 return {status:'answered',answer,citations:[{chunkId:'calendar-source-rows:'+document.checksum.slice(0,16),title:document.title,url:document.url,sourceName:document.title,claim:'Dates and event labels projected from checksum-verified PDF event lines.',locator:document.events[0]?.locator??null,effectiveAt:null,reviewedAt:null}],suggestedQuestions:[],
  grounding:{source:'public-page-context',webSearched:false,capturedOn:document.capturedOn},activity:[{kind:'calendar-source-rows',label:'Read published calendar dates',detail:'Projected selected event rows from the registered PDF. No personal schedule or live closure was inferred.',status:'complete'}]};
}

export function publicCalendarEventsAnswer(question){
 if(!isPublicCalendarDateQuestion(question)||!/\bevents?\b|校園活動|有哪些活動/iu.test(question))return null;
 const context=publicCalendarContext(question);if(!context)return null;
 const document=source.documents.find(row=>row.url===context.evidence.url);if(!document)return null;
 const club=publicPageForRoute('/school-sites/activity.sao.stu.edu.tw/%E6%B4%BB%E5%8A%9B%E7%A4%BE%E5%9C%98%E4%BB%8B%E7%B4%B9/');
 const rows=JSON.parse(context.evidence.content).events;
 const zh=assistantLanguage(question)==='zh-Hant';
 const answer=(zh?`以下是 **${document.academicYear}學年度（${document.academicYear+1911}–${document.academicYear+1912}）**[行事曆](${document.url})列出的活動範例，包含已過與預定日期，並非即時或完整的校園活動清單：`:
  `Here are examples listed in the **${document.academicYear} academic-year (${document.academicYear+1911}–${document.academicYear+1912}) [calendar](${document.url})**. These include past and scheduled dates; they are not a complete live campus-event list:`)
  +'\n\n'+rows.map(row=>`- **${row.date}** — ${row.event}`).join('\n')
  +'\n\n'+(zh?`另請查看[校園最新消息](/latestnews)${club?`、[社團介紹](${club.route})`:''}及課程或所屬學生團體的公告。參加前確認各活動公告中的報名方式、地點、時間與異動；行事曆上的日期不代表報名仍開放。`:
   `Also check [Campus News](/latestnews)${club?`, [club introductions](${club.route})`:''}, and announcements for your course or student group. Before attending, check each event notice for registration, location, timing and changes; a calendar date does not establish that registration is open.`);
 const links=[{title:document.title,url:document.url},{title:'Campus News',url:'/latestnews'},...(club?[{title:club.title,url:club.route}]:[])];
 return {status:'answered',answer,citations:links.map((link,index)=>({chunkId:'calendar-event-guide:'+index,...link,sourceName:link.title,claim:index===0?'Event lines projected from the checksum-verified calendar.':'Existing public navigation destination; no live event content inferred.',locator:null,effectiveAt:null,reviewedAt:null})),suggestedQuestions:[],grounding:{source:'public-page-context',webSearched:false,capturedOn:document.capturedOn},activity:[{kind:'calendar-event-guide',label:'Read published calendar event examples',detail:'Used registered PDF rows and existing announcement destinations. No live registration or complete event inventory was inferred.',status:'complete'}]};
}
