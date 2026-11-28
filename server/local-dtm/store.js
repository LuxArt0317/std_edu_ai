/** Local-only, owner-scoped Moodle content store. No credentials or remote writes. */
import {mkdirSync,chmodSync,existsSync,lstatSync} from 'node:fs';
import {dirname,isAbsolute,join} from 'node:path';
import {mkdtemp,writeFile,unlink,rmdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
const productionLibrary = () => process.env.VERCEL_ENV === 'production' && Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);
const localLibrary = () => Boolean(process.env.LOCAL_DTM_DATABASE) && process.env.VERCEL!=='1' && !['production','preview'].includes(process.env.VERCEL_ENV);
const cloudBucket = 'private-moodle-captures';

async function openProductionLibrary(account, owner) {
 if (!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(owner)) throw Error('Invalid Moodle account.');
 const project = new URL(account.url);
 if (project.protocol !== 'https:' || !/^[a-z0-9]+\.supabase\.co$/.test(project.hostname)) throw Error('Invalid Moodle storage project.');
 const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
 const response = await fetch(project.origin+'/storage/v1/object/authenticated/'+cloudBucket+'/'+owner+'.sqlite',{
   headers:{apikey:key,Authorization:'Bearer '+key},signal:AbortSignal.timeout(8000),redirect:'error',
 });
 if (!response.ok) {
   const body = await response.json().catch(()=>null);
   if (response.status===404 || (response.status===400 && (body?.statusCode==='404'||body?.statusCode===404))) return null;
   throw Error('Private Moodle storage is unavailable.');
 }
 const bytes = Buffer.from(await response.arrayBuffer());
 if (bytes.length>12_000_000 || bytes.subarray(0,16).toString()!=='SQLite format 3\0') throw Error('Invalid Moodle snapshot.');
 const directory = await mkdtemp(join(tmpdir(),'stu-moodle-'));
 const path = join(directory,'capture.sqlite');
 const cleanup = async () => {await unlink(path).catch(()=>{});await rmdir(directory);};
 try {
   await writeFile(path,bytes,{mode:0o600,flag:'wx'});
   const {DatabaseSync} = await import('node:sqlite');
   return {db:new DatabaseSync(path,{readOnly:true}),cleanup};
 } catch(error) {await cleanup();throw error;}
}
const sourceOrigin='https://dtm.stu.edu.tw';
export function sourceKey(value){
 const u=new URL(value,sourceOrigin);if(u.origin!==sourceOrigin||u.username||u.password||u.hash||[...u.searchParams.keys()].some(k=>!['id','categoryid','page','browse'].includes(k)))throw Error('Unsupported Moodle source address.');
 if(!/^\/$|^\/my\/$|^\/course\/(?:view|index)\.php$|^\/mod\/(?:assign|url|page|resource|folder|quiz|forum|workshop)\/view\.php$|^\/grade\/report\/(?:user|overview)\/index\.php$/.test(u.pathname))throw Error('Unsupported Moodle page.');
 u.searchParams.sort();return u.pathname+u.search;
}
export function libraryEnabled(){return localLibrary()||productionLibrary();}
function principal(account){if(!account?.user?.id||!account?.user?.email)throw Object.assign(Error('Sign in to School Affairs.'),{status:401});return account.user;}
async function open(create=false){
 if(!localLibrary())return null;const path=process.env.LOCAL_DTM_DATABASE;
 if(!isAbsolute(path))throw Error('LOCAL_DTM_DATABASE must be absolute.');
 if(!existsSync(path)&&!create)return null;
 if(existsSync(path)&&lstatSync(path).isSymbolicLink())throw Error('Database symlinks are not permitted.');
 mkdirSync(dirname(path),{recursive:true,mode:0o700});
 const {DatabaseSync}=await import('node:sqlite');const db=new DatabaseSync(path);chmodSync(path,0o600);
 db.exec(`PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
 CREATE TABLE IF NOT EXISTS imports(id INTEGER PRIMARY KEY,owner TEXT NOT NULL,source TEXT NOT NULL,captured_at TEXT NOT NULL,created_at TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS courses(owner TEXT NOT NULL,id TEXT NOT NULL,title TEXT NOT NULL,term TEXT NOT NULL,code TEXT NOT NULL,instructor TEXT NOT NULL,PRIMARY KEY(owner,id));
 CREATE TABLE IF NOT EXISTS pages(owner TEXT NOT NULL,key TEXT NOT NULL,course_id TEXT,title TEXT NOT NULL,text TEXT NOT NULL,payload TEXT NOT NULL,captured_at TEXT NOT NULL,PRIMARY KEY(owner,key));
 CREATE TABLE IF NOT EXISTS activities(owner TEXT NOT NULL,id TEXT NOT NULL,course_id TEXT NOT NULL,section TEXT NOT NULL,position INTEGER NOT NULL,title TEXT NOT NULL,kind TEXT NOT NULL,description TEXT NOT NULL,availability TEXT NOT NULL,source_key TEXT,PRIMARY KEY(owner,course_id,id),FOREIGN KEY(owner,course_id) REFERENCES courses(owner,id));
 CREATE TABLE IF NOT EXISTS grade_rows(owner TEXT NOT NULL,page_key TEXT NOT NULL,table_index INTEGER NOT NULL,row_index INTEGER NOT NULL,cells TEXT NOT NULL,PRIMARY KEY(owner,page_key,table_index,row_index),FOREIGN KEY(owner,page_key) REFERENCES pages(owner,key));`);return db;
}
const str=(v,max=200000)=>typeof v==='string'&&v.length<=max&&!v.includes('\0');
export function validateImport(input){
 if(!input||!Array.isArray(input.courses)||!Array.isArray(input.pages)||input.courses.length>500||input.pages.length>5000||JSON.stringify(input).length>12_000_000)throw Error('Invalid or oversized Moodle import.');
 const ids=new Set();for(const c of input.courses){if(!/^\d{1,12}$/.test(c.id)||ids.has(c.id)||!['title','term','code','instructor'].every(k=>str(c[k],1000)))throw Error('Invalid course metadata.');ids.add(c.id);}
 const keys=new Set();for(const p of input.pages){const key=sourceKey(p.url);if(keys.has(key)||!str(p.title,2000)||!str(p.text)||!Array.isArray(p.tables)||!Array.isArray(p.links)||!Array.isArray(p.activities)||p.courseId&&!ids.has(p.courseId))throw Error('Invalid source page.');keys.add(key);
 if(p.links.length>2000||p.activities.length>1000||p.tables.length>50)throw Error('Page exceeds import limits.');
 for(const l of p.links){if(!str(l.title,4000)||!str(l.url,10000))throw Error('Invalid source link.');const u=new URL(l.url);if(!['http:','https:'].includes(u.protocol)||u.username||u.password||/sesskey|token|password|authkey/i.test(u.search))throw Error('Credential-bearing links are not imported.');}
 for(const a of p.activities){if(!/^module-\d{1,12}$/.test(a.id)||!['title','section','kind','description','availability'].every(k=>str(a[k],10000))||a.url!==null&&sourceKey(a.url).length>1000)throw Error('Invalid source activity.');}
 for(const t of p.tables){if(!Array.isArray(t)||t.length>2000||t.some(r=>!Array.isArray(r)||r.length>40||r.some(c=>!str(c,20000))))throw Error('Invalid literal grade table.');}
 }return input;
}
export async function importLibrary(account,input){
 const user=principal(account);if(!localLibrary())throw Object.assign(Error('Local Moodle import is disabled.'),{status:404});
 if(!process.env.LOCAL_DTM_IMPORT_EMAIL||user.email.toLowerCase()!==process.env.LOCAL_DTM_IMPORT_EMAIL.toLowerCase())throw Object.assign(Error('This account cannot import Moodle content.'),{status:403});
 validateImport(input);const db=await open(true),stamp=new Date().toISOString();
 try{db.exec('BEGIN IMMEDIATE');
 for(const c of input.courses)db.prepare('INSERT INTO courses VALUES(?,?,?,?,?,?) ON CONFLICT(owner,id) DO UPDATE SET title=excluded.title,term=excluded.term,code=excluded.code,instructor=excluded.instructor').run(user.id,c.id,c.title,c.term,c.code,c.instructor);
 for(const p of input.pages){const key=sourceKey(p.url);db.prepare('INSERT INTO pages VALUES(?,?,?,?,?,?,?) ON CONFLICT(owner,key) DO UPDATE SET course_id=excluded.course_id,title=excluded.title,text=excluded.text,payload=excluded.payload,captured_at=excluded.captured_at').run(user.id,key,p.courseId||null,p.title,p.text,JSON.stringify(p),stamp);
 db.prepare('DELETE FROM grade_rows WHERE owner=? AND page_key=?').run(user.id,key);p.tables.forEach((t,ti)=>t.forEach((r,ri)=>db.prepare('INSERT INTO grade_rows VALUES(?,?,?,?,?)').run(user.id,key,ti,ri,JSON.stringify(r))));
 if(p.courseId&&key.startsWith('/course/view.php')){db.prepare('DELETE FROM activities WHERE owner=? AND course_id=?').run(user.id,p.courseId);p.activities.forEach((a,i)=>db.prepare('INSERT INTO activities VALUES(?,?,?,?,?,?,?,?,?,?)').run(user.id,a.id,p.courseId,a.section,i,a.title,a.kind,a.description,a.availability,a.url?sourceKey(a.url):null));}
 }db.prepare('INSERT INTO imports(owner,source,captured_at,created_at) VALUES(?,?,?,?)').run(user.id,sourceOrigin,stamp,stamp);db.exec('COMMIT');return {courses:input.courses.length,pages:input.pages.length,importedAt:stamp};
 }catch(e){db.exec('ROLLBACK');throw e;}finally{db.close();}
}
function assignmentStatus(payload) {
 const rows = payload ? JSON.parse(payload).tables.flat() : [];
 const find = labels => rows.find(row => labels.includes(row[0]?.trim().toLowerCase()))?.[1]?.trim() || null;
 const statusText = find(['submission status', '繳交狀態', '提交狀態']);
 const dueText = find(['due date', '規定繳交時間', '截止日期']);
 let status = 'unknown';
 if (/^(?:submitted for grading|submitted|已繳交(?:，等待評分中)?|已提交)$/iu.test(statusText || '')) status = 'submitted';
 if (/^(?:no submissions? (?:have been made yet|made)|not submitted|沒有繳交作業|未繳交|未提交)$/iu.test(statusText || '')) status = 'not_submitted';
 if (/^(?:draft(?: \(not submitted\))?|草稿(?:（未繳交）)?)$/iu.test(statusText || '')) status = 'draft';
 return {status,statusText,dueText};
}

function assignmentView(db, owner, courses, offset, query) {
 const selected = new Map(courses.map(course => [course.id, course]));
 const rows = db.prepare(`
   SELECT a.course_id courseId, a.title, a.source_key sourceKey, p.payload, p.captured_at capturedAt
   FROM activities a LEFT JOIN pages p
     ON p.owner=a.owner AND p.course_id=a.course_id AND p.key=a.source_key
   WHERE a.owner=? AND a.source_key LIKE '/mod/assign/view.php?%'
   ORDER BY a.course_id, a.position
 `).all(owner).filter(row => selected.has(row.courseId) &&
   (!query || row.title.toLocaleLowerCase().includes(query.toLocaleLowerCase())));
 const assignments = rows.map(({payload,sourceKey,courseId,title,capturedAt}) => ({
   courseId, courseTitle:selected.get(courseId).title, term:selected.get(courseId).term,
   title, capturedAt, ...assignmentStatus(payload),
   url:payload ? '/dtm/course/import-'+courseId+'?source='+encodeURIComponent(sourceKey) : null,
   sourceUrl:sourceOrigin+sourceKey,
 }));
 const byStatus = {submitted:0,not_submitted:0,draft:0,unknown:0};
 for (const assignment of assignments) byStatus[assignment.status]++;
 const statusOrder = {not_submitted:0,draft:0,submitted:1,unknown:2};
 assignments.sort((a,b) => statusOrder[a.status]-statusOrder[b.status]);
 const limit = 25;
 return {enabled:true, courses:[], pages:[], counts:{pages:0,activities:assignments.length,gradeRows:0},
   assignmentCoverage:{coursesChecked:courses.length,total:assignments.length,byStatus,scope:'Imported course snapshots; missing submission pages are unknown.'},
   assignments:assignments.slice(offset,offset+limit),
   assignmentPage:{offset,limit,nextOffset:offset+limit<assignments.length?offset+limit:null}};
}

function quizView(db, owner, courses, offset, query) {
 const selected = new Map(courses.map(course => [course.id, course]));
 const rows = db.prepare(`
   SELECT a.course_id courseId, a.title, a.availability, a.source_key sourceKey, p.payload, p.captured_at capturedAt
   FROM activities a LEFT JOIN pages p
     ON p.owner=a.owner AND p.course_id=a.course_id AND p.key=a.source_key
   WHERE a.owner=? AND (a.kind='quiz' OR a.source_key LIKE '/mod/quiz/view.php?%')
   ORDER BY a.course_id, a.position
 `).all(owner).filter(row => selected.has(row.courseId) &&
   (!query || row.title.toLocaleLowerCase().includes(query.toLocaleLowerCase())));
 const quizzes = rows.map(({payload,sourceKey,courseId,title,capturedAt,availability}) => {
   const page = payload ? JSON.parse(payload) : null;
   const tables = page?.tables ?? [];
   const setting = labels => tables.flat().find(row => row.length === 2 &&
     labels.includes(row[0]?.trim().toLowerCase()))?.[1]?.trim() || null;
   // Preserve explicit labels. Never infer an attempt from a listing or grade.
   return {
     courseId, courseTitle:selected.get(courseId).title, term:selected.get(courseId).term,
     title, availability, capturedAt, detailAvailable:Boolean(page),
     opensText:setting(['opens','open time','開始時間','開放時間']),
     closesText:setting(['closes','close time','結束時間','關閉時間']),
     attemptsAllowedText:setting(['attempts allowed','允許作答次數','允許作答的次數']),
     attemptsRemainingText:setting(['attempts remaining','剩餘作答次數']),
     attemptStatusText:setting(['attempt status','作答狀態','嘗試狀態']),
     releasedScoreText:setting(['final grade','highest grade','最高成績','最終成績']),
     url:page ? '/dtm/course/import-'+courseId+'?source='+encodeURIComponent(sourceKey) : null,
     sourceUrl:sourceKey ? sourceOrigin+sourceKey : null,
   };
 });
 const limit = 25;
 return {enabled:true,courses:[],pages:[],counts:{pages:0,activities:quizzes.length,gradeRows:0},
   quizCoverage:{coursesChecked:courses.length,total:quizzes.length,detailCaptured:quizzes.filter(quiz=>quiz.detailAvailable).length},
   quizzes:quizzes.slice(offset,offset+limit),
   quizPage:{offset,limit,nextOffset:offset+limit<quizzes.length?offset+limit:null}};
}

export async function readLibrary(account,query={}){
 const user=principal(account);if(Object.keys(query).some(k=>!['scope','course_id','page_key','q','view','term','offset','kind'].includes(k)))throw Object.assign(Error('Invalid Moodle library query.'),{status:400});
 if(query.view!==undefined&&!['coverage','grades','courses','activities','assignments','quizzes'].includes(query.view))throw Object.assign(Error('Invalid Moodle library view.'),{status:400});
 for(const key of ['course_id','page_key','q','term'])if(query[key]!==undefined&&(typeof query[key]!=='string'||!query[key].trim()||query[key].length>(key==='page_key'?1000:200)))throw Object.assign(Error('Invalid Moodle selector.'),{status:400});
 if(query.course_id!==undefined&&!/^\d{1,12}$/.test(query.course_id))throw Object.assign(Error('Choose an imported course.'),{status:400});
 if(query.kind!==undefined&&(query.view!=='activities'||!['assign','forum','page','quiz','url','workshop','resource','folder'].includes(query.kind)))throw Object.assign(Error('Choose a supported Moodle activity type.'),{status:400});
 const offset=query.offset===undefined?0:Number(query.offset);if(!Number.isSafeInteger(offset)||offset<0||offset>100000||query.offset!==undefined&&!/^\d+$/.test(String(query.offset)))throw Object.assign(Error('Invalid activity offset.'),{status:400});
 const hosted=productionLibrary()?await openProductionLibrary(account,user.id):null;
 const db=hosted?.db??await open();if(!db)return {enabled:libraryEnabled(),courses:[],pages:[],counts:{pages:0,activities:0,gradeRows:0}};
 try{let courses=db.prepare('SELECT id,title,term,code,instructor FROM courses WHERE owner=? ORDER BY term DESC,id').all(user.id);
 if(query.course_id)courses=courses.filter(c=>c.id===query.course_id);
 if(query.term)courses=courses.filter(c=>c.term===query.term);
 if(query.view==='courses'&&query.q){const words=query.q.toLocaleLowerCase().trim().split(/\s+/);courses=courses.filter(c=>words.every(w=>[c.title,c.code,c.instructor,c.term].some(v=>v.toLocaleLowerCase().includes(w))));}
 if(query.view==='assignments')return assignmentView(db,user.id,courses,offset,query.q);
 if(query.view==='quizzes')return quizView(db,user.id,courses,offset,query.q);
 const selectedIds=new Set(courses.map(c=>c.id));
 for(const course of courses){const rows=db.prepare('SELECT g.cells FROM grade_rows g JOIN pages p ON p.owner=g.owner AND p.key=g.page_key WHERE g.owner=? AND p.course_id=? AND p.key LIKE ? ORDER BY g.row_index').all(user.id,course.id,'/grade/report/user/%');const total=rows.map(r=>JSON.parse(r.cells)).find(r=>r[0]==='課程總分');course.gradeText=total?.[2]??null;course.rangeText=total?.[3]??null;course.percentageText=total?.[4]??null;course.rankText=total?.[5]??null;course.url='/dtm/course/import-'+course.id+'/grades';course.courseUrl='/dtm/course/import-'+course.id;course.gradeReportAvailable=Boolean(db.prepare('SELECT 1 FROM pages WHERE owner=? AND course_id=? AND key LIKE ? LIMIT 1').get(user.id,course.id,'/grade/report/user/%'));}
 const pending=query.view==='coverage'?db.prepare('SELECT a.course_id courseId,a.source_key sourceKey,a.title FROM activities a LEFT JOIN pages p ON p.owner=a.owner AND p.key=a.source_key WHERE a.owner=? AND a.source_key IS NOT NULL AND p.key IS NULL ORDER BY a.course_id,a.position').all(user.id):undefined;
 const counts={pages:db.prepare('SELECT COUNT(*) n FROM pages WHERE owner=?').get(user.id).n,activities:db.prepare('SELECT COUNT(*) n FROM activities WHERE owner=?').get(user.id).n,gradeRows:db.prepare('SELECT COUNT(*) n FROM grade_rows WHERE owner=?').get(user.id).n};
 let rows=[];if(query.view==='courses'||query.view==='activities'){/* Structured projections do not load unrelated full source pages. */}
 else if(query.page_key){const key=sourceKey(query.page_key);rows=db.prepare('SELECT payload,captured_at FROM pages WHERE owner=? AND key=?').all(user.id,key);}
 else if(query.course_id){if(!/^\d{1,12}$/.test(query.course_id))throw Object.assign(Error('Choose an imported course.'),{status:400});rows=db.prepare('SELECT payload,captured_at FROM pages WHERE owner=? AND course_id=? ORDER BY key LIMIT 150').all(user.id,query.course_id);}
 else if(query.q){if(!str(query.q,200))throw Object.assign(Error('Use a short Moodle search.'),{status:400});const terms=query.q.trim().split(/\s+/).filter(Boolean).slice(0,8);if(terms.length)rows=db.prepare('SELECT payload,captured_at FROM pages WHERE owner=? AND ('+terms.map(()=>'(title LIKE ? OR text LIKE ?)').join(' OR ')+') ORDER BY key LIMIT 25').all(user.id,...terms.flatMap(t=>['%'+t.replace(/[\\%_]/g,'')+'%','%'+t.replace(/[\\%_]/g,'')+'%']));}
 rows=rows.filter(r=>{const p=JSON.parse(r.payload);return ((!query.course_id&&!query.term)||selectedIds.has(p.courseId))&&(query.view!=='grades'||p.url.includes('/grade/report/user/'));});
 const activities=query.view==='activities'?db.prepare('SELECT a.id,a.course_id courseId,a.section,a.position,a.title,a.kind,a.description,a.availability,a.source_key sourceKey,p.key capturedKey,p.captured_at capturedAt FROM activities a LEFT JOIN pages p ON p.owner=a.owner AND p.course_id=a.course_id AND p.key=a.source_key WHERE a.owner=? ORDER BY a.course_id,a.position').all(user.id).filter(a=>selectedIds.has(a.courseId)&&(!query.kind||a.kind===query.kind)).filter(a=>!query.q||[a.title,a.section,a.description].some(v=>v.toLocaleLowerCase().includes(query.q.toLocaleLowerCase()))).map(({sourceKey,capturedKey,...a})=>({...a,detailAvailable:Boolean(capturedKey),availabilityState:a.availability.trim()?'captured_text':'unknown',completionStatus:'unknown',sourceUrl:sourceKey?sourceOrigin+sourceKey:null,url:sourceKey?'/dtm/course/import-'+a.courseId+'?source='+encodeURIComponent(sourceKey):'/dtm/course/import-'+a.courseId})):undefined;
 return {enabled:true,courses,counts,pending,...(activities?{activities:activities.slice(offset,offset+50),activityCoverage:{coursesChecked:courses.length,detailCaptured:activities.filter(activity=>activity.detailAvailable).length,completionKnown:0},activityPage:{total:activities.length,offset,limit:50,nextOffset:offset+50<activities.length?offset+50:null}}:{}),pages:rows.map(r=>{const p=JSON.parse(r.payload);return {...p,localUrl:p.courseId?'/dtm/course/import-'+p.courseId+(/^\/grade\/report\/user\//.test(sourceKey(p.url))?'/grades':'?source='+encodeURIComponent(sourceKey(p.url))):'/dtm',capturedAt:r.captured_at};})};
 }finally{db.close();await hosted?.cleanup();}
}
