import {AffairsWorkspaceError,schoolAffairsDatabaseConfiguration} from './affairsWorkspace.js';
import {permanentCoursesPath} from '../src/features/public/affairs/permanentCourseRouting.js';

const codePattern=/^[A-Z0-9]{5,24}$/;
const pageLimit=400;

export function permanentCourseQuery(query) {
  const {scope,kind='',division='',keyword='',page='0',code=''}=query;
  if (scope!=='permanent-courses' || !Object.keys(query).every(key=>['scope','kind','division','keyword','page','code'].includes(key))
    || ![kind,division,keyword,page,code].every(value=>typeof value==='string')
    || keyword.length>120 || [...keyword].some(character=>character.charCodeAt(0)<32)
    || !/^\d{1,3}$/.test(page) || Number(page)>pageLimit
    || (code && (!codePattern.test(code) || kind || division || keyword || Number(page)))
    || (kind && (!/^[A-Z0-9]{2}$/.test(kind) || !['U','G','J'].includes(division)))
    || (!kind && (division || keyword || Number(page)))) throw new AffairsWorkspaceError('請確認課程查詢條件。',400);
  return {p_kind:kind,p_division:division,p_keyword:keyword.trim(),p_page:Number(page),p_code:code};
}

async function database(path,{method='GET',body,writer=false,fetchDatabase=fetch}={}) {
  const {url,key}=schoolAffairsDatabaseConfiguration();
  const apiKey=writer ? process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY : key;
  if (!apiKey) throw new AffairsWorkspaceError('Course description storage is unavailable.');
  const response=await fetchDatabase(url+'/rest/v1/'+path,{
    method,headers:{apikey:apiKey,...(apiKey.startsWith('eyJ')?{Authorization:'Bearer '+apiKey}:{}),
      ...(body?{'Content-Type':'application/json'}:{}),...(writer?{Prefer:'resolution=ignore-duplicates,return=minimal'}:{})},
    ...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(6000),redirect:'error',
  });
  if (!response.ok) throw new AffairsWorkspaceError('Course catalog is temporarily unavailable.',response.status===400&&!writer?400:503);
  return writer?null:response.json();
}

export async function readPermanentCourses(args,dependencies) {
  const result=await database('rpc/affairs_permanent_course_search',{method:'POST',body:args,...dependencies});
  if (!result || !Array.isArray(result.rows) || !Array.isArray(result.kinds) || !Array.isArray(result.divisions) ||
    !Number.isSafeInteger(result.total) || result.total<0 || result.page!==args.p_page || result.pageSize!==50 ||
    typeof result.capturedAt!=='string' || !Number.isFinite(Date.parse(result.capturedAt)))
    throw new AffairsWorkspaceError('Course catalog is temporarily unavailable.');
  return result;
}

async function readStoredDescription(code,dependencies) {
  const query=new URLSearchParams({code:'eq.'+code,select:'*',limit:'1'});
  const rows=await database('affairs_permanent_course_descriptions?'+query,dependencies);
  if (!Array.isArray(rows) || rows.length>1 || (rows.length && rows[0]?.code!==code))
    throw new AffairsWorkspaceError('Course description could not be verified.');
  return rows[0]??null;
}

const pending = new Map();
async function fetchDescription(course,dependencies) {
  const open=dependencies?.openSource ?? (await import('./permanentCourseSource.js')).openPermanentCourseSource;
  const source=await open();
  let list=source.root;
  let row=list.rows.find(entry=>entry.code===course.code);
  if (!row) {
    list=await source.search(course.kind,course.division,course.title);
    row=list.rows.find(entry=>entry.code===course.code);
  }
  if (!row) throw new AffairsWorkspaceError('此課程簡介目前無法取得。',503);
  const result=await source.detail(row,list);
  const data={code:result.code,title:result.title,english_title:result.englishTitle,requirement:result.requirement,
    credits:result.credits,college:result.college,department:result.department,description:result.description,
    english_description:result.englishDescription};
  if (data.code!==course.code) throw new AffairsWorkspaceError('Course description did not match the selected course.');
  await database('affairs_permanent_course_descriptions?on_conflict=code',{...dependencies,method:'POST',body:data,writer:true});
  const saved=await readStoredDescription(course.code,dependencies);
  if (!saved) throw new AffairsWorkspaceError('Course description could not be saved.');
  return saved;
}

export async function readPermanentCourseDescription(course,dependencies) {
  const saved=await readStoredDescription(course.code,dependencies);
  if (saved) return saved;
  if (pending.has(course.code)) return pending.get(course.code);
  if (pending.size>=4) throw new AffairsWorkspaceError('Course descriptions are busy. Try again shortly.',503);
  const request=fetchDescription(course,dependencies).finally(()=>pending.delete(course.code));
  pending.set(course.code,request);
  return request;
}

export async function servePermanentCourses(request,response,dependencies) {
  response.setHeader('Cache-Control','no-store');
  response.setHeader('X-Content-Type-Options','nosniff');
  if (request.method!=='GET') {
    response.setHeader('Allow','GET');
    response.status(405).json({error:'Method not allowed.'});
    return;
  }
  try {
    const args=permanentCourseQuery(request.query??{});
    const result=await readPermanentCourses(args,dependencies);
    if (!args.p_code) return response.status(200).json(result);
    const course=result.rows[0];
    if (!course) return response.status(404).json({error:'找不到課程。'});
    const description=await readPermanentCourseDescription(course,dependencies);
    response.status(200).json({description});
  } catch(error) {
    const status=error instanceof AffairsWorkspaceError?error.status:503;
    response.status(status).json({error:status===400?'請確認課程查詢條件。':'課程資料暫時無法載入，請稍後重試。'});
  }
}

const markdownText=value=>value.replace(/[\\\x60*_[\]<>]/g,'\\$&');
export async function answerPermanentCourse(question,selection,{onRead,...dependencies}={}) {
  const zh=/[\u3400-\u9fff]/u.test(question);
  const name=zh?'永久課程簡介':'Permanent course descriptions';
  const path=permanentCoursesPath;
  let url=path,detail,answer,status='answered';
  if (selection.code) {
    onRead?.();
    try {
      const {rows}=await readPermanentCourses(permanentCourseQuery({scope:'permanent-courses',code:selection.code}),dependencies);
      const course=rows[0];
      if (!course) {
        answer=zh?`目前目錄中找不到 ${selection.code}。`:`The current catalog has no entry for ${selection.code}.`;
        status='handoff';
      } else {
        url=path+'?course='+encodeURIComponent(course.code);
        const title=markdownText((zh?course.title:course.english_title)||course.title);
        answer=zh?`**${course.code} · ${title}**：${course.credits} 學分，開課系所為${markdownText(course.department)}。`:
          `**${course.code} · ${title}** is listed for **${course.credits} credits** by ${markdownText(course.department)}.`;
        if (/\b(?:about|describe|description|summary|tell me)\b|簡介|介紹|內容/iu.test(question)) {
          try { detail=await readPermanentCourseDescription(course,dependencies); } catch { /* The verified catalog row is still available. */ }
          const text=detail&&(zh?detail.description:detail.english_description);
          if (text) answer+='\n\n'+markdownText([...text].slice(0,520).join(''));
          else answer+=zh?'\n\n目前無法取得這門課的簡介。':'\n\nThe course description is currently unavailable.';
        }
      }
    } catch {
      answer=zh?'目前無法讀取永久課程目錄。':'The permanent course catalog is currently unavailable.';
      status='handoff';
    }
  } else {
    answer=zh?'可依課程種類、部別及課名關鍵字查詢，點選永久課號即可開啟課程簡介。':
      'Search by course type, division, and course title. Select a course code to open its description.';
  }
  return {status,answer:`${answer}\n\n[${name}](${url})`,suggestedQuestions:[],
    citations:status==='answered'?[{chunkId:'permanent-courses:'+(selection.code||'directory'),title:name,sourceName:'stu.best School Affairs',
      url,locator:url,effectiveAt:null,reviewedAt:detail?.captured_at??null}]:[],
    grounding:{source:'directory',webSearched:false},
    activity:[{kind:'permanent-courses',label:'Checked permanent course catalog',detail:name,status:status==='answered'?'complete':'unavailable'}]};
}
