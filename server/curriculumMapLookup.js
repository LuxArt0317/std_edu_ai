import {load} from 'cheerio';
import {curriculumMapEntry,curriculumMapSource} from '../src/features/public/affairs/curriculumMaps.js';

const categories = new Map([['wf-col','department'],['wf-pro','required'],['wf-sec','elective']]);
const text = value => value.replace(/\s+/gu,' ').trim();
const maxBytes = 512_000;

async function readHtml(response) {
  if (!response.ok || response.redirected || !response.body ||
      !/^text\/html\b/i.test(response.headers.get('content-type') ?? '') ||
      Number(response.headers.get('content-length')) > maxBytes) throw Error('Map response unavailable');
  const reader = response.body.getReader();
  try {
    const decoder = new TextDecoder('utf-8',{fatal:true});
    let size=0, html='';
    for (;;) {
      const part=await reader.read();
      if (part.done) break;
      size+=part.value.byteLength;
      if (size>maxBytes) throw Error('Map response too large');
      html+=decoder.decode(part.value,{stream:true});
    }
    return html+decoder.decode();
  } catch (error) {
    await reader.cancel().catch(()=>{});
    throw error;
  } finally {
    reader.releaseLock();
  }
}

function parseMap(html, year, trackLabel) {
  const $=load(html);
  const tables=$('#content table').toArray();
  const flow=tables.find(table=>$(table).children('tbody').children('tr').first().children('td').text().includes('學程課程地圖') &&
    !$(table).find('table').length);
  if (!flow || !$('#cmyear').length) throw Error('Map layout unavailable');
  const rows=$(flow).children('tbody').children('tr').toArray();
  const title=text($(rows[0]).text());
  if (!title.startsWith(Number(year)+'學年度') && !title.startsWith(year+'學年度')) throw Error('Wrong map year');
  if (!title.includes('【'+trackLabel+'】')) throw Error('Wrong map track');
  const columns=$(rows[1]).children('td').toArray();
  const cells=$(rows[2]).children('td').toArray();
  if (columns.length!==cells.length || !columns.length) throw Error('Wrong map columns');
  const semesters=columns.map((column,index)=>({
    label:text($(column).text()),
    courses:$(cells[index]).find('.course').toArray().map(course=>({
      title:text($(course).text()),
      category:($(course).attr('class') ?? '').split(/\s+/).map(name=>categories.get(name)).find(Boolean) ?? 'other',
    })),
  }));
  const summaries=tables.slice(0,tables.indexOf(flow)).filter(table=>!$(table).find('table').length).map(table=>
    $(table).children('tbody,thead').children('tr').toArray().map(row=>$(row).children('td,th').toArray().map(cell=>text($(cell).text()))),
  );
  return {title,tables:summaries,semesters};
}

export async function serveCurriculumMap(request,response,fetchMap=fetch) {
  response.setHeader('Cache-Control','no-store');
  response.setHeader('X-Content-Type-Options','nosniff');
  if (request.method!=='GET') {
    response.setHeader('Allow','GET');
    response.status(405).json({error:'Method not allowed.'});
    return;
  }
  const {scope,program,year,track,...extras}=request.query ?? {};
  const entry=typeof program==='string'?curriculumMapEntry(program):undefined;
  const selected=typeof track==='string'?entry?.tracks.find(option=>option.value===track):undefined;
  if (scope!=='curriculum-map' || Object.keys(extras).length || !entry || typeof year!=='string' ||
      !entry.years.includes(year) || (!selected && (track!=='' || entry.tracks.length))) {
    response.status(400).json({error:'請選擇有效的系所、學年與學程。'});
    return;
  }
  try {
    const source=curriculumMapSource(entry,'seccontent');
    const result=await fetchMap(source,{
      method:'POST',
      body:new URLSearchParams({cmyear:year,cpname:track}),
      redirect:'error',
      signal:AbortSignal.timeout(12000),
    });
    const map=parseMap(await readHtml(result),year,selected?.label ?? '');
    response.setHeader('Cache-Control','public, max-age=300, s-maxage=3600');
    response.status(200).json(map);
  } catch {
    response.status(502).json({error:'課程地圖暫時無法載入，請重試。'});
  }
}
