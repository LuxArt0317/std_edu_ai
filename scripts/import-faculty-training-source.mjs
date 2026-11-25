import {readFile,writeFile,rename} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {load} from 'cheerio';
import {publicPageForRoute} from '../server/publicPageContext.js';

export const facultyTrainingRoutes={
 faculty:'/%E6%95%99%E8%81%B7%E5%93%A1%E5%B7%A5/',
 exchange:'/school-sites/www.oica.stu.edu.tw/%E5%B8%AB%E8%B3%87%E5%9F%B9%E8%A8%93/',
 notice:'/latestnews-single/?id=234451',
};
const clean=value=>String(value||'').replace(/\s+/gu,' ').trim();
function document(html){const $=load(html);$('script,style,noscript,template,input,textarea,select').remove();return $;}

/** Recover source-owned card labels, exchange content, and one dated workshop notice. */
export function extractFacultyTrainingSources({facultyHtml,exchangeHtml,noticeHtml}){
 const $faculty=document(facultyHtml);
 const serviceLinks=$faculty('main a.elementor-button-link[href]').map((_,element)=>({
  label:clean($faculty(element).text()),href:$faculty(element).attr('href')||'',
 })).toArray().filter(link=>link.label&&/^\/(?!\/)[^\s?#]{1,1000}$/u.test(link.href));
 if(!serviceLinks.some(link=>link.label==='人力資源網')||!serviceLinks.some(link=>link.label==='教學文件網站'))throw Error('Faculty service cards missing');
 const $exchange=document(exchangeHtml);
 const purposes=$exchange('h3').map((_,element)=>clean($exchange(element).text())).toArray().filter(text=>text.startsWith('為增進兩岸師資交流'));
 const widgets=$exchange('.elementor-widget-text-editor').filter((_,element)=>/課程項目[：:]/u.test($exchange(element).text())&&/申請條件及內容[：:]/u.test($exchange(element).text()));
 if(purposes.length!==1||widgets.length!==1)throw Error('Exchange-training source section missing or ambiguous');
 const widget=widgets.first();
 const courseItems=widget.find('ul').first().children('li').map((_,element)=>clean($exchange(element).text())).toArray();
 const conditions=widget.find('ol').first().children('li').map((_,element)=>clean($exchange(element).text())).toArray();
 const examples=widget.find('table p').map((_,element)=>clean($exchange(element).text())).toArray().filter(Boolean);
 if(!courseItems.length||!conditions.some(text=>/15位以上教師/u.test(text))||!conditions.some(text=>/至少1週/u.test(text))||!examples.length)throw Error('Exchange-training conditions or examples missing');
 const $notice=document(noticeHtml),content=$notice('.latestnews_popup__content').first();
 if(content.length!==1)throw Error('Teacher workshop notice body missing');
 const paragraphs=[...new Set(content.find('p').map((_,element)=>clean($notice(element).text())).toArray().filter(Boolean))];
 const field=prefix=>paragraphs.find(text=>text.startsWith(prefix));
 const topic=field('研習主題：'),date=field('日期：'),time=field('時間：'),location=field('地點：');
 const description=paragraphs.find(text=>text.startsWith('本次研習以'));
 const audienceInvitation=paragraphs.find(text=>text.startsWith('誠摯邀請各位導師'));
 const unit=clean($notice('ol.info .unit').text()),phone=clean($notice('ol.info .phone').text());
 const registrationLinks=$notice('.latestnews_popup__content a[href],.latestnews_popup__link a[href]').map((_,element)=>({
  label:clean($notice(element).text()),href:$notice(element).attr('href')||'',
 })).toArray().filter(link=>/^\/school-sites\/infosys\.stu\.edu\.tw\/CampusAction\/Action\/GetActionDetail\/[A-F0-9]{32,160}$/u.test(link.href));
 if(!topic||!date||!time||!location||!description||!audienceInvitation||!unit||!phone||!registrationLinks.length)throw Error('Teacher workshop notice fields missing');
 return {faculty:{heading:clean($faculty('main h2').first().text()),serviceLinks},
  exchange:{purpose:purposes[0],courseItems,conditions,examples},
  notice:{title:clean($notice('h1').first().text()),topic,description,audienceInvitation,date,time,location,
   publicationLabel:clean($notice('.patitle2').first().text()+' '+$notice('.patitle3').first().text()),organizer:{unit,phone},registrationLinks}};
}

export async function importFacultyTrainingSource(){
 const root=new URL('../',import.meta.url),pages={},inputs={};
 for(const [role,route] of Object.entries(facultyTrainingRoutes)){
  const page=publicPageForRoute(route);if(!page)throw Error('Faculty training source is not registered: '+role);
  const bytes=await readFile(new URL('public'+page.file,root));
  if(createHash('sha256').update(bytes).digest('hex')!==page.checksum)throw Error('Faculty training source checksum mismatch: '+role);
  pages[role]={title:page.title,url:page.route,source:page.source,capturedOn:page.capturedOn,captureFile:page.file,checksum:page.checksum};
  inputs[role+'Html']=bytes.toString('utf8');
 }
 const sections=extractFacultyTrainingSources(inputs);
 const record={version:1,documents:Object.fromEntries(Object.entries(pages).map(([role,page])=>[role,{...page,sections:sections[role]}]))};
 const destination=new URL('server/data/facultyTrainingSource.json',root),temporary=new URL('server/data/facultyTrainingSource.json.tmp',root);
 await writeFile(temporary,JSON.stringify(record,null,2)+'\n');await rename(temporary,destination);
 return record;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const source=await importFacultyTrainingSource();console.log(JSON.stringify({facultyTrainingSource:true,documents:Object.keys(source.documents),externalRequests:0}));
}
