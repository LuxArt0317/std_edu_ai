import {load} from 'cheerio';

export const permanentCourseSource = 'https://infosys.stu.edu.tw/WebStuCourse/ForCourse';
const maxPageBytes = 10_000_000;
const clean = value => value.replace(/\r\n?/g, '\n').trim();
const codePattern = /^[A-Z0-9]{5,24}$/;
const tokenInput = 'input[name="__RequestVerificationToken"]';

async function readSource(path, init, fetchSource) {
  const response = await fetchSource(permanentCourseSource + path, {
    ...init, redirect:'error', signal:AbortSignal.timeout(16_000),
  });
  if (!response.ok || !response.body) throw new Error('Permanent course source is unavailable.');
  if (Number(response.headers.get('content-length')) > maxPageBytes) throw new Error('Course source response is too large.');
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    for (;;) {
      const {done,value} = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxPageBytes) throw new Error('Course source response is too large.');
      chunks.push(value);
    }
    return {text:new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks,size)),headers:response.headers};
  } finally {
    await reader.cancel().catch(()=>{});
  }
}

export function parsePermanentCourseList(html) {
  const $ = load(html);
  if (!$('#dataTable').length || !$(tokenInput).val()) throw new Error('Permanent course list is missing.');
  const rows = $('#dataTable tbody tr').filter((_, row) => $(row).find('a.btnHistory').length > 0).map((_,row)=>{
    const cells = $(row).children('td').map((_,cell)=>clean($(cell).text())).get();
    const sourceKey = $(row).find('a.btnHistory').attr('data-keyid');
    const [sequence,code,title,englishTitle,requirement,credits,kind,department,duration,categoryCode] = cells;
    if (cells.length !== 10 || !/^[1-9]\d*$/.test(sequence) || !codePattern.test(code) || !title ||
        !/^[0-9]+(?:\.[0-9]+)?$/.test(credits) || !/^[A-Z0-9]{2}$/.test(kind) || !/^\d{12,180}$/.test(sourceKey ?? ''))
      throw new Error('Invalid permanent course record.');
    return {sequence:Number(sequence),code,title,englishTitle,requirement,credits:Number(credits),kind,department,duration,categoryCode,sourceKey};
  }).get();
  if (rows.some((row,index)=>row.sequence !== index + 1)) throw new Error('Incomplete permanent course sequence.');
  const options = selector => $(selector + ' option[value]').map((_,element) => {
    const value = $(element).attr('value');
    return value ? {value,label:clean($(element).text())} : null;
  }).get();
  const kinds = options('#CourseKind');
  const divisions = options('#DeptTp');
  if (!kinds.length || divisions.map(option=>option.value).join(',') !== 'U,G,J') throw new Error('Course source options are missing.');
  return {rows,kinds,divisions,token:$(tokenInput).val()};
}

export function parsePermanentCourseDetail(payload, code) {
  if (payload?.success !== true || typeof payload.responseText !== 'string') throw new Error('Permanent course description is unavailable.');
  const sections = payload.responseText.split('_splitmarkhere_');
  if (sections.length !== 2 || !sections[1].startsWith(code)) throw new Error('Course description does not match the requested code.');
  const $ = load('<table><tbody>'+sections[0]+'</tbody></table>');
  const rows = $('tbody > tr').toArray();
  const values = $(rows[0]).children('td').map((_,cell)=>clean($(cell).text())).get();
  if (values.length !== 6 || values[0] !== code || rows.length !== 7) throw new Error('Unexpected course description format.');
  const content = [2,4,6].map(index=>clean($(rows[index]).children('td').text()));
  if (content.some(value=>value.length > 18000)) throw new Error('Course description is too long.');
  return {code,title:values[1],requirement:values[2],credits:values[3],college:values[4],department:values[5],
    englishTitle:content[0],description:content[1],englishDescription:content[2]};
}

export async function openPermanentCourseSource(fetchSource = fetch) {
  const initial = await readSource('', {}, fetchSource);
  const root = parsePermanentCourseList(initial.text);
  const cookies = initial.headers.getSetCookie().map(value=>value.split(';',1)[0]).join('; ');
  const headers = {Cookie:cookies,Referer:permanentCourseSource,'X-Requested-With':'XMLHttpRequest'};
  const send = (path,fields) => readSource(path,{method:'POST',headers,body:new URLSearchParams(fields)},fetchSource);
  return {
    root,
    async search(kind,division,keyword = '') {
      const response = await send('',{CourseKind:kind,DeptTp:division,CourseName:keyword,__RequestVerificationToken:root.token});
      return parsePermanentCourseList(response.text);
    },
    async detail(row,list) {
      const response = await send('/GetModalFormDataJson',{id:row.sourceKey,__RequestVerificationToken:list.token});
      return parsePermanentCourseDetail(JSON.parse(response.text),row.code);
    },
  };
}
