/** Local-only, owner-scoped Moodle content store. No credentials or remote writes. */
import {mkdirSync,chmodSync,existsSync,lstatSync} from 'node:fs';
import {dirname,isAbsolute} from 'node:path';
const sourceOrigin='https://dtm.stu.edu.tw';
export function sourceKey(value){
 const u=new URL(value,sourceOrigin);if(u.origin!==sourceOrigin||u.username||u.password||u.hash||[...u.searchParams.keys()].some(k=>!['id','categoryid','page','browse'].includes(k)))throw Error('Unsupported Moodle source address.');
 if(!/^\/$|^\/my\/$|^\/course\/(?:view|index)\.php$|^\/mod\/(?:assign|url|page|resource|folder|quiz|forum|workshop)\/view\.php$|^\/grade\/report\/(?:user|overview)\/index\.php$/.test(u.pathname))throw Error('Unsupported Moodle page.');
 u.searchParams.sort();return u.pathname+u.search;
}
export function libraryEnabled(){return Boolean(process.env.LOCAL_DTM_DATABASE)&&process.env.VERCEL!=='1'&&!['production','preview'].includes(process.env.VERCEL_ENV);}
function principal(account){if(!account?.user?.id||!account?.user?.email)throw Object.assign(Error('Sign in to School Affairs.'),{status:401});return account.user;}
async function open(create=false){
 if(!libraryEnabled())return null;const path=process.env.LOCAL_DTM_DATABASE;
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
 const user=principal(account);if(!libraryEnabled())throw Object.assign(Error('Local Moodle import is disabled.'),{status:404});
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
export async function readLibrary(account,query={}){
 const user=principal(account);if(Object.keys(query).some(k=>!['scope','course_id','page_key','q','view'].includes(k)))throw Object.assign(Error('Invalid Moodle library query.'),{status:400});
 if(query.view!==undefined&&!['coverage','grades'].includes(query.view))throw Object.assign(Error('Invalid Moodle library view.'),{status:400});
 const db=await open();if(!db)return {enabled:libraryEnabled(),courses:[],pages:[],counts:{pages:0,activities:0,gradeRows:0}};
 try{const courses=db.prepare('SELECT id,title,term,code,instructor FROM courses WHERE owner=? ORDER BY term DESC,id').all(user.id);
 for(const course of courses){const rows=db.prepare('SELECT g.cells FROM grade_rows g JOIN pages p ON p.owner=g.owner AND p.key=g.page_key WHERE g.owner=? AND p.course_id=? AND p.key LIKE ? ORDER BY g.row_index').all(user.id,course.id,'/grade/report/user/%');const total=rows.map(r=>JSON.parse(r.cells)).find(r=>r[0]==='課程總分');course.gradeText=total?.[2]??null;course.rangeText=total?.[3]??null;course.percentageText=total?.[4]??null;course.rankText=total?.[5]??null;course.url='/dtm/course/import-'+course.id+'/grades';}
 const pending=query.view==='coverage'?db.prepare('SELECT a.course_id courseId,a.source_key sourceKey,a.title FROM activities a LEFT JOIN pages p ON p.owner=a.owner AND p.key=a.source_key WHERE a.owner=? AND a.source_key IS NOT NULL AND p.key IS NULL ORDER BY a.course_id,a.position').all(user.id):undefined;
 const counts={pages:db.prepare('SELECT COUNT(*) n FROM pages WHERE owner=?').get(user.id).n,activities:db.prepare('SELECT COUNT(*) n FROM activities WHERE owner=?').get(user.id).n,gradeRows:db.prepare('SELECT COUNT(*) n FROM grade_rows WHERE owner=?').get(user.id).n};
 let rows=[];if(query.page_key){const key=sourceKey(query.page_key);rows=db.prepare('SELECT payload,captured_at FROM pages WHERE owner=? AND key=?').all(user.id,key);}
 else if(query.course_id){if(!/^\d{1,12}$/.test(query.course_id))throw Object.assign(Error('Choose an imported course.'),{status:400});rows=db.prepare('SELECT payload,captured_at FROM pages WHERE owner=? AND course_id=? ORDER BY key LIMIT 150').all(user.id,query.course_id);}
 else if(query.q){if(!str(query.q,200))throw Object.assign(Error('Use a short Moodle search.'),{status:400});const terms=query.q.trim().split(/\s+/).filter(Boolean).slice(0,8);if(terms.length)rows=db.prepare('SELECT payload,captured_at FROM pages WHERE owner=? AND ('+terms.map(()=>'(title LIKE ? OR text LIKE ?)').join(' OR ')+') ORDER BY key LIMIT 25').all(user.id,...terms.flatMap(t=>['%'+t.replace(/[\\%_]/g,'')+'%','%'+t.replace(/[\\%_]/g,'')+'%']));}
 return {enabled:true,courses,counts,pending,pages:rows.map(r=>{const p=JSON.parse(r.payload);return {...p,localUrl:p.courseId?'/dtm/course/import-'+p.courseId+'?source='+encodeURIComponent(sourceKey(p.url)):'/dtm',capturedAt:r.captured_at};})};
 }finally{db.close();}
}
