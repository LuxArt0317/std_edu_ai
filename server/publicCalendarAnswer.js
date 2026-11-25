import document from './data/calendarDownloads.json' with {type:'json'};
import {assistantLanguage} from '../src/services/assistantLanguage.js';

/** A download directory establishes editions, not personal or live event dates. */
export function publicCalendarAnswer(question){
 if(typeof question!=='string'||question.length>2000||!/\b(?:academic|school|university)?\s*calendars?\b|行事曆/iu.test(question))return null;
 if(!/\b(?:where|find|open|link|download|access|view|show|see)\b|哪裡|在哪|下載|開啟|連結/iu.test(question))return null;
 if(/\b(?:my|our|today|tomorrow|when|dates?|holidays?|midterm|final exam|assignments?)\b|我的|今天|明天|何時|日期|期中|期末|作業|\b(?:and|also)\b|以及|另外/iu.test(question))return null;
 const requested=question.match(/\b(1\d{2})\b/u)?.[1];
 const span=question.match(/\b(20\d{2})\s*[-–~]\s*(20\d{2})\b/u);
 if(!requested&&!span&&/\b20\d{2}\b/u.test(question))return null;
 const years=document.years.filter(year=>(!requested||year.academicYear===Number(requested))&&(!span||(year.start===Number(span[1])&&year.end===Number(span[2]))));
 const year=years.sort((a,b)=>b.academicYear-a.academicYear)[0];if(!year)return null;
 const edition=/\b(?:staff|faculty|teachers?)\b|教職員|教師/iu.test(question)?'staff':/\benglish\b|英文/iu.test(question)?'english':'student';
 const selected=document.downloads.find(row=>row.academicYear===year.academicYear&&row.edition===edition);
 const english=document.downloads.find(row=>row.academicYear===year.academicYear&&row.edition==='english');
 if(!selected||!english)return null;
 const zh=assistantLanguage(question)==='zh-Hant';
 const title=zh?'教務處行事曆':'Academic Affairs Calendar';
 const selectedTitle=zh?selected.title:`${year.academicYear} ${edition==='staff'?'staff':edition==='english'?'English':'student'} calendar (${year.start}–${year.end})`;
 const links=[{title,url:document.url},{title:selectedTitle,url:selected.url},...(selected.url!==english.url?[{title:`${year.start}–${year.end} English calendar`,url:english.url}]:[])];
 const answer=zh
  ?`開啟[${title}](${document.url})，依需要選擇學年度及學生版或教職員版；頁面也提供英文版下載。已儲存的頁面列有 ${year.academicYear} 學年度（${year.start}–${year.end}）。\n\n${links.slice(1).map(link=>`[${link.title}](${link.url})`).join(' · ')}`
  :`Open the [${title}](${document.url}), then choose the academic year and the student or staff edition. English downloads are available too. The saved page lists **${year.academicYear} (${year.start}–${year.end})**.\n\n${links.slice(1).map(link=>`[${link.title}](${link.url})`).join(' · ')}`;
 return {status:'answered',answer,citations:links.map(link=>({chunkId:'calendar-download:'+link.url,...link,sourceName:document.title,claim:'Published calendar edition and download destination.',locator:null,effectiveAt:null,reviewedAt:null})),suggestedQuestions:[],grounding:{source:'public-page-context',webSearched:false,capturedOn:document.capturedOn},
  activity:[{kind:'calendar-downloads',label:'Checked calendar downloads',detail:'Matched academic-year headings and edition labels in the checksum-verified calendar page; no personal deadlines were read.',status:'complete'}]};
}
