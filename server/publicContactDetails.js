import {load} from 'cheerio';

/** Preserve bounded contact blocks that main-article extraction intentionally omits. */
export function publicContactSections(html){
 const $=load(html),seen=new Set(),sections=[];
 $('aside, footer, #footer, [id*="contact"], [class*="contact"], .e-con.e-child').each((_,element)=>{
  if(sections.length>=3)return;
  const block=$(element).clone();block.find('script,style,nav').remove();
  block.find('br').replaceWith('\n');
  const text=block.text().replace(/[\t ]+/gu,' ').replace(/\n\s*\n/gu,'\n').trim().slice(0,500);
  if(!/行政大樓|Administration Building|\bA\d{3,4}\b|\b(?:Phone|Tel)\s*[:：]|地址|電話/iu.test(text)||seen.has(text))return;
  seen.add(text);sections.push({locator:element.attribs?.id?'#'+element.attribs.id:element.tagName,text});
 });
 return sections;
}

/** Capture actual local directory buttons omitted by paragraph extraction. */
export function publicDirectoryEntries(html){
 const $=load(html),entries=[],seen=new Set();
 $('.elementor-widget-button a.elementor-button-link[href]').each((_,element)=>{
  if(entries.length>=50||$(element).closest('header,footer,nav').length)return;
  const label=$(element).text().replace(/\s+/gu,' ').trim().slice(0,100),url=$(element).attr('href')||'';
  if(!label||!/^\/(?!\/)[^\s?#]{1,1000}$/u.test(url)||seen.has(url))return;
  seen.add(url);entries.push({label,url});
 });
 return entries;
}
