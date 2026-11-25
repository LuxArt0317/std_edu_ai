import table from './data/accounting115Fees.json' with {type:'json'};
import prospectus from './data/ipiac115.json' with {type:'json'};
import {assistantLanguage} from '../src/services/assistantLanguage.js';
const compact=value=>value.replace(/\s+/gu,'');
const amounts=match=>match?.slice(1).map(value=>Number(value.replaceAll(',','')));

/** Native projection of the publisher's rows, not an evaluation-answer lookup. */
export function publicTuitionFacts(){
  const page=table.pages[0]?.text||'';
  const totals=amounts(page.match(/學雜費合計\s+([\d,]+)\s+([\d,]+)/u));
  const tuition=amounts(page.match(/學費\s+([\d,]+)\s+([\d,]+)/u));
  const miscellaneous=amounts(page.match(/雜費\s+([\d,]+)\s+([\d,]+)/u));
  if(!totals||!tuition||!miscellaneous||totals.some((value,i)=>!Number.isSafeInteger(value)||value!==tuition[i]+miscellaneous[i]))return null;
  const heading=compact(page);
  if(!heading.includes('資訊學院、設計學院、兒家系、資管系')||!heading.includes('管理學院、應用社會學院'))return null;
  const foreignRule=table.pages.some(page=>compact(page.text).includes('本校陸生及外籍生學雜費均依據其就讀學制學系比照本國生學雜費收費標準收取'));
  const costPage=prospectus.pages.find(page=>/Semester\s*1\s+[\d,]+/u.test(page.text));
  const firstSemester=amounts(costPage?.text.match(/Semester\s*1\s+([\d,]+)\s+([\d,]+)\s+([\d,]+)/u));
  const programs=['Information Management','Computer and Communication','Computer Science and Information Engineering'].filter(name=>prospectus.pages[0].text.includes('Department of '+name));
  const performance=prospectus.pages.some(page=>compact(page.text).includes('第二學期起依學業成績及條件核發獎助學金'));
  return{totals,foreignRule,programs,ipiBase:firstSemester?.[0],firstSemesterWaiver:Boolean(firstSemester&&firstSemester[0]===firstSemester[1]&&firstSemester[2]===0),performance};
}

export function publicTuitionAnswer(question){
  if(typeof question!=='string'||question.length>2000)return null;
  if(!/\b(?:how much|tuition (?:rates?|standards?|costs?))\b|學費多少|學雜費多少|學費標準/iu.test(question)||!/\btuition\b|學費|學雜費/iu.test(question))return null;
  if(/\b(?:my|our)\b|\b(?:owe|owing|remaining|paid|payment|outstanding|balance|deduct|masters?|graduate|phd|doctoral|part.time)\b|我的|研究所|碩士|博士|進修|繳費|餘額|欠費/iu.test(question))return null;
  const facts=publicTuitionFacts();if(!facts||!facts.foreignRule)return null;
  const zh=assistantLanguage(question)==='zh-Hant',money=n=>'NT$'+n.toLocaleString('en-US');
  const lines=[zh?'依據 **115 學年度（2026–2027）日間部大學部**收費標準，每學期學雜費如下：':'For **115 academic year (2026–2027), daytime undergraduate tuition and miscellaneous fees per semester** are:',
    zh?'| 收費類別 | 每學期學雜費 |':'| Fee category | Per-semester total |','| --- | ---: |',
    `| ${zh?'資訊學院、設計學院、兒家系、資管系':'Information/Design, Child Care and Family Services, and Information Management'} | ${money(facts.totals[0])} |`,
    `| ${zh?'管理學院、應用社會學院（注意系所例外）':'Management/Applied Social Sciences, subject to department exceptions'} | ${money(facts.totals[1])} |`,
    zh?'外籍生按所就讀學制及學系，比照本國生標準收費。這是學雜費，不含所有住宿與生活費用；其他學制另有標準。':'International students pay the rate for their study level and department, on the same basis as domestic students. These totals are tuition and miscellaneous fees, not an all-inclusive housing/living-cost bill; other study levels have separate rates.'];
  const mentionsIpiac=/\bipi[a]?c\b|新南向|產學合作專班/iu.test(question);
  const citations=[{chunkId:'source-accounting-115',title:table.title,url:table.url,sourceName:'Accounting · '+table.capturedOn,claim:'Published tuition table and foreign-student fee rule.',locator:'Physical pages 1 and 5',effectiveAt:null,reviewedAt:null}];
  if(mentionsIpiac){
    if(facts.programs.length!==3||facts.ipiBase!==facts.totals[0]||!facts.firstSemesterWaiver||!facts.performance)return null;
    lines.push(zh?`**IPIAC：**115 入學簡章草案所列資訊管理、電腦與通訊及資訊工程三系，學雜費基準為 ${money(facts.ipiBase)}。草案列第一學期學雜費減免，第二學期起依學業成績及其他條件核發獎助學金。須以您的入學年度與核定獎助條件為準，不能套用至所有屆別或當作個人繳費帳單。`:`**IPIAC:** The supplied **115-entry draft prospectus** covers ${facts.programs.join(', ')}. Its base is **${money(facts.ipiBase)}**; it describes a **first-semester tuition-and-miscellaneous waiver**, followed by **performance-based awards from semester two**, subject to the award conditions. Those terms are specific to that prospectus—not automatically every entry year or your final bill.`);
    citations.push({chunkId:'source-ipiac-115',title:prospectus.title,url:prospectus.url,sourceName:'IPIAC prospectus · '+prospectus.capturedOn,claim:'Source draft program scope, base fee and scholarship treatment.',locator:'Cover and fee/scholarship tables',effectiveAt:null,reviewedAt:null});
  }
  lines.push(citations.map(citation=>'['+(zh?'查看來源：':'Read ')+citation.title+']('+citation.url+')').join(' · '));
  return{status:'answered',answer:lines.join('\n\n'),citations,suggestedQuestions:[],grounding:{source:'public-page-context',webSearched:false,checkedAt:new Date().toISOString(),retrieverVersion:'published-fee-projection@1'},
    verification:{status:'verified',attempts:0},activity:[{kind:'source-fee-table',label:'Read the published Accounting table',detail:'Checked the study-level headings, tuition/miscellaneous totals and foreign-student rule.',status:'complete'},...(mentionsIpiac?[{kind:'source-prospectus',label:'Checked the IPIAC prospectus',detail:'Matched the cover programs and published first-semester fee/award row; retained entry-year scope.',status:'complete'}]:[])]};
}
