import {load} from 'cheerio';
import {schoolAffairsDatabaseConfiguration} from './affairsWorkspace.js';
import {readFeeRemissionJson as readBoundedJson} from './feeRemissionContract.js';
import {readSchoolHtml} from './readSchoolHtml.js';
import {
  courseSubstitutionPath, substitutionSource, substitutionYears, substitutionTracks,
  substitutionTrack, substitutionDepartmentCode, substitutionCourseCode,
} from '../src/features/public/affairs/courseSubstitution.js';

const departmentSource = new URL('ajax/ajaxGetSectionData.asp',substitutionSource).href;
const clean = value => value.replace(/\s+/gu,' ').trim();
const credit = value => typeof value==='string' && /^\d{1,3}(?:\.\d{1,2})?$/.test(value);
const boundedText = (value,limit,allowBlank=false) => typeof value==='string' && value.length<=limit &&
  (allowBlank || value.length>0) && !/[\u0000-\u001f\u007f]/u.test(value);
const departmentTerm = value => typeof value==='string' && /^[\p{Script=Han}a-zA-Z0-9 ()&-]{1,32}$/u.test(value) && Boolean(value.trim());
const isCourse = course => !!course && substitutionCourseCode(course.code) && boundedText(course.name,200) && credit(course.credits);
const validDetails = entry => Array.isArray(entry.groups) && entry.groups.length<=100 && (
  entry.detailStatus==='listed'
    ? entry.groups.length>0 && entry.groups.every(group=>group && boundedText(group.label,32) &&
      Array.isArray(group.courses) && group.courses.length>0 && group.courses.length<=100 &&
      group.courses.every(item=>isCourse(item) && boundedText(item.required,30,true) && boundedText(item.notes,1000,true)))
    : ['none','unlisted'].includes(entry.detailStatus) && entry.groups.length===0
);
function validateCourses(rows) {
  if (!Array.isArray(rows) || rows.length>300 || !rows.every(row=>isCourse(row)&&validDetails(row)) ||
      new Set(rows.map(row=>row.code)).size!==rows.length) throw new Error('Invalid course substitution records.');
  return rows;
}

async function readForm(fetchSource,signal) {
  const form = load(await readSchoolHtml(await fetchSource(substitutionSource,{redirect:'error',signal})));
  const token = selector => {
    const value = form(selector).val();
    if (typeof value!=='string' || !/^[A-Za-z0-9+/=]{2,120}$/.test(value)) throw new Error('The university form changed.');
    return value;
  };
  const options = new Map(form('#NDIDName option').toArray().flatMap(el=>{
    const label=clean(form(el).text()),value=form(el).val();
    return label && typeof value==='string' && /^[A-Za-z0-9+/=]{2,120}$/.test(value) ? [[label,value]] : [];
  }));
  if (!options.size || !form('#crsYear option').length) throw new Error('The university form changed.');
  return {form,options,ajaxType:token('#ajaxType'),actionType:token('#actionType')};
}

async function readDepartments(term,ajaxType,fetchSource,signal) {
  const response = await fetchSource(departmentSource,{
    method:'POST',body:new URLSearchParams({ajaxType,term}),headers:{referer:substitutionSource},
    redirect:'error',signal,
  });
  if (!response.ok || response.redirected) throw new Error('The university department lookup is unavailable.');
  const list = await readBoundedJson(response);
  if (!Array.isArray(list) || list.length>500) throw new Error('Invalid university department data.');
  const result = new Map();
  for(const row of list) {
    const name=typeof row?.value==='string' ? clean(row.value) : '';
    if (substitutionDepartmentCode(row?.idcode) && boundedText(name,120)) {
      if(result.has(row.idcode) && result.get(row.idcode).name!==name) throw new Error('Conflicting department records.');
      result.set(row.idcode,{code:row.idcode,name});
    }
  }
  if (list.length && !result.size) throw new Error('Invalid university department data.');
  return [...result.values()];
}

export function parseSubstitutionResults(html,{year,track,department}) {
  const $=load(html);
  const table=$('#vdata > table.master');
  const title=clean(table.children('caption').first().text());
  if (table.length!==1 || title!==`屆別：${year} 學制：${track} 開課單位：${department.name}`)
    throw new Error('The university returned a different substitution selection.');
  const rows=table.children('tbody').children('tr').toArray();
  if (rows.length===1 && $(rows[0]).children('td,th').length===1 && clean($(rows[0]).text()).startsWith('查無資料')) return [];
  if (!rows.length || rows.length%2!==0 || rows.length>600) throw new Error('Invalid university substitution table.');
  const courses=[];
  for(let i=0;i<rows.length;i+=2) {
    const original=$(rows[i]).children('td');
    const detail=$(rows[i+1]).children('td').children('table');
    if (original.length!==4 || detail.length!==1) throw new Error('Missing university substitution details.');
    const [code,name,credits]=original.slice(0,3).toArray().map(cell=>clean($(cell).text()));
    const nested=detail.children('tbody').children('tr').toArray();
    const groups=[];
    let group=null, remaining=0, explicitNone=false;
    for(const row of nested) {
      const cells=$(row).children('td');
      const values=cells.toArray().map(cell=>clean($(cell).text()));
      // Some revisions place the nested headers in tbody.
      if (!cells.length || (values.length===6 && values[0]==='替代組合' && values[1]==='課程代碼')) continue;
      if (values.length===1 && values[0].startsWith('無替代科目資料')) {
        explicitNone=true;
        continue;
      }
      if (values.length===6 && remaining===0) {
        remaining=Number(cells.first().attr('rowspan') ?? 1);
        if (!Number.isInteger(remaining) || remaining<1 || remaining>100) throw new Error('Invalid substitution group span.');
        group={label:values.shift(),courses:[]};
        groups.push(group);
      }
      if (values.length!==5 || !group || remaining<1) throw new Error('Invalid substitution detail row.');
      const [replacement,name,credits,required,notes]=values;
      group.courses.push({code:replacement,name,credits,required,notes});
      remaining--;
    }
    if (remaining || (explicitNone && groups.length)) throw new Error('Incomplete university substitution group.');
    courses.push({code,name,credits,groups,detailStatus:groups.length?'listed':explicitNone?'none':'unlisted'});
  }
  return validateCourses(courses);
}

async function readSnapshot({year,trackKey,departmentCode}) {
  const {url,key}=schoolAffairsDatabaseConfiguration();
  const endpoint=new URL(url+'/rest/v1/affairs_course_substitution_snapshots');
  endpoint.search=new URLSearchParams({select:'department_name,courses,observed_on',
    cohort:'eq.'+year,track_key:'eq.'+trackKey,department_code:'eq.'+departmentCode,limit:'2'}).toString();
  const result=await fetch(endpoint,{headers:{apikey:key},redirect:'error',signal:AbortSignal.timeout(3500)});
  if (!result.ok) throw new Error('Verified snapshot is unavailable.');
  const rows=await readBoundedJson(result);
  const row=rows?.[0];
  if (!Array.isArray(rows) || rows.length!==1 || !row || !boundedText(row.department_name,120) || !/^\d{4}-\d{2}-\d{2}$/.test(row.observed_on))
    throw new Error('No verified snapshot for this selection.');
  return {year,track:substitutionTrack(trackKey),department:{code:departmentCode,name:row.department_name},
    source:'snapshot',checkedOn:row.observed_on,courses:validateCourses(row.courses)};
}

export async function lookupCourseSubstitution(selection,{fetchSource=fetch,readSaved=readSnapshot}={}) {
  const {year,trackKey,departmentCode}=selection;
  const track=substitutionTrack(trackKey);
  if (!substitutionYears.includes(year) || !track || !substitutionDepartmentCode(departmentCode)) throw new Error('Invalid substitution selection.');
  const signal=AbortSignal.timeout(10500);
  try {
    const {form,options,ajaxType,actionType}=await readForm(fetchSource,signal);
    if (!options.has(track) || !form('#crsYear option').toArray().some(option=>form(option).val()===year))
      throw new Error('The selected cohort or track is unavailable.');
    const department=(await readDepartments(departmentCode,ajaxType,fetchSource,signal)).find(item=>item.code===departmentCode);
    if (!department) throw new Error('The selected department is unavailable.');
    const data=new URLSearchParams({crsYear:year,NDIDName:options.get(track),Sname:department.name,
      Secno:department.code,ajaxType,actionType,btnSubmit:'查詢'});
    const response=await fetchSource(substitutionSource,{method:'POST',body:data,
      headers:{referer:substitutionSource},redirect:'error',signal});
    const courses=parseSubstitutionResults(await readSchoolHtml(response),{year,track,department});
    return {year,track,department,courses,source:'live',
      checkedOn:new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())};
  } catch {
    return readSaved(selection);
  }
}

export async function serveCourseSubstitution(request,response) {
  response.setHeader('Cache-Control','no-store');
  response.setHeader('X-Content-Type-Options','nosniff');
  if (request.method!=='GET') {
    response.setHeader('Allow','GET');
    response.status(405).json({error:'Method not allowed.'});
    return;
  }
  const {scope,year,track,department,term,...extras}=request.query??{};
  const suggestions=scope==='course-substitution-departments';
  const valid=suggestions
    ? departmentTerm(term) && year===undefined && track===undefined && department===undefined
    : scope==='course-substitution' && substitutionYears.includes(year) && substitutionTrack(track) &&
      substitutionDepartmentCode(department) && term===undefined;
  if (!valid || Object.keys(extras).length) {
    response.status(400).json({error:'請檢查屆別、學制或開課單位。'});
    return;
  }
  try {
    if (suggestions) {
      const signal=AbortSignal.timeout(8500);
      const {ajaxType}=await readForm(fetch,signal);
      const matches=await readDepartments(term.trim(),ajaxType,fetch,signal);
      response.status(200).json({departments:matches.slice(0,40)});
    } else {
      response.status(200).json(await lookupCourseSubstitution({year,trackKey:track,departmentCode:department}));
    }
  } catch {
    response.status(502).json({error:'替代科目資料暫時無法載入。'});
  }
}


const markdownText = value => value.replace(/[\\`*_{}\[\]<>()#+!|]/g,'\\$&');

export async function answerCourseSubstitution(selection,question,lookup=lookupCourseSubstitution) {
  const zh=/[\u3400-\u9fff]/u.test(question);
  const {code,year,trackKey,departmentCode}=selection;
  const title=zh?'替代科目查詢':'Course substitution search';
  const url=`${courseSubstitutionPath}/results/${year}/${trackKey}/${departmentCode}#course-${code}`;
  try {
    const result=await lookup({year,trackKey,departmentCode});
    const row=result.courses.find(item=>item.code===code);
    const sourceLabel=result.source==='live'
      ? (zh?'校方即時查詢':'Live university lookup')
      : (zh?'校方查詢存檔':'Saved university result');
    const lines=[`${sourceLabel} · ${result.checkedOn} · ${year} · ${markdownText(result.track)} · ${markdownText(result.department.name)} (${departmentCode})`];
    if (!row) lines.push(zh?`此查詢範圍未列出 ${code}。`:`This selection does not list ${code}.`);
    else {
      lines.push(`**${row.code} · ${markdownText(row.name)}** · ${row.credits} ${zh?'學分':'credits'}`);
      if (row.detailStatus!=='listed') lines.push(row.detailStatus==='none'
        ? (zh?'校方明細顯示無替代科目資料。':'The university detail shows no replacement data.')
        : (zh?'校方明細未列出替代科目。':'The university detail did not list any replacements.'));
      else {
        lines.push(zh?'每組為一個選項，所選組合內的科目都須修習。':'Each group is an alternative. All courses within the chosen group must be taken.');
        const groups=row.groups.slice(0,5);
        for (const group of groups) {
          const courses=group.courses.slice(0,6);
          lines.push(`${zh?'組合':'Group'} ${markdownText(group.label)}\n`+courses.map(course=>
            `- **${course.code} · ${markdownText(course.name)}** · ${course.credits} ${zh?'學分':'credits'}`).join('\n'));
        }
        if (row.groups.length>groups.length || groups.some(group=>group.courses.length>6))
          lines.push(zh?'完整替代組合請見查詢頁面。':'Open the result for all replacement groups.');
      }
    }
    const answer=lines.concat(`[${title}](${url})`).join('\n\n');
    return {status:'answered',answer,citations:[{chunkId:`substitution:${year}:${trackKey}:${departmentCode}:${code}`,
      claim:lines[0],title,sourceName:sourceLabel,url,locator:substitutionSource,effectiveAt:null,reviewedAt:null}],
      suggestedQuestions:[],grounding:{source:result.source==='live'?'web':'directory',webSearched:result.source==='live',checkedAt:new Date().toISOString()},
      activity:[{kind:'course-substitution',label:'Checked the course substitution records',detail:sourceLabel,status:'complete'}]};
  } catch {
    return {status:'handoff',answer:(zh?'暫時無法載入此範圍的替代科目。':'The substitutions for this selection are temporarily unavailable.')+`\n\n[${title}](${url})`,
      citations:[],suggestedQuestions:[],grounding:{source:'directory',webSearched:false},
      activity:[{kind:'course-substitution',label:'Checked the course substitution records',detail:'Result unavailable',status:'unavailable'}]};
  }
}
