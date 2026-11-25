import {publicPageForRoute} from './publicPageContext.js';
import {assistantLanguage} from '../src/services/assistantLanguage.js';

export function publicMapAnswer(question){
 if(typeof question!=='string'||question.length>2000||!/\b(?:campus|school|university) maps?\b|\bmap of (?:the )?(?:campus|school|university)\b|校園地圖|學校地圖/iu.test(question))return null;
 if(!/\b(?:where|find|open|link|show|view|download)\b|哪裡|在哪|開啟|連結|查看/iu.test(question))return null;
 if(/\b(?:my|our|accessible|wheelchair|directions|distance|walking|and|also)\b|無障礙|輪椅|我的|以及|另外/iu.test(question))return null;
 const page=publicPageForRoute('/school-sites/www.oica.stu.edu.tw/en/school-map/');if(!page)return null;
 const zh=assistantLanguage(question)==='zh-Hant';
 const title=zh?'校園地圖':'School Map';
 const answer=zh?`開啟[${title}](${page.route})。先在地圖找目的地的大樓，再查該單位的聯絡資訊確認樓層與房號。這是靜態校園地圖；實際入口、無障礙通行及現場步行狀況需另外確認。`:
  `Open the [${title}](${page.route}). Find your destination’s building on the map, then check the office or department’s contact details for its floor and room. This is a static campus map; it does not confirm accessible entrances, open doors or real-time walking conditions.`;
 return {status:'answered',answer,citations:[{chunkId:'campus-map-directory',title,url:page.route,sourceName:page.title,claim:'Registered public School Map destination.',locator:null,effectiveAt:null,reviewedAt:null}],suggestedQuestions:[],
  grounding:{source:'directory',webSearched:false,checkedAt:new Date().toISOString()},activity:[{kind:'campus-map-directory',label:'Located the School Map page',detail:'Matched the registered public map destination. Its original published image is restored locally; no live walking route was checked.',status:'complete'}]};
}
