import {createHash} from 'node:crypto';
import {mkdtemp,readFile,unlink,rmdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DatabaseSync,backup} from 'node:sqlite';

const bucket = 'private-moodle-captures';
const source = process.argv[2];
const configuredUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const expectedProject = process.env.MOODLE_CAPTURE_PROJECT_REF;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!source || !/^[a-z0-9]+$/.test(expectedProject ?? '') || !key || !configuredUrl ||
    new URL(configuredUrl).origin !== `https://${expectedProject}.supabase.co`) {
  throw Error('Supply a snapshot path and server credentials for the explicitly selected Supabase project.');
}
const base = new URL(configuredUrl).origin + '/storage/v1';
const headers = {apikey:key,Authorization:`Bearer ${key}`};
const request = (path, options = {}) => fetch(base + path, {
  ...options, redirect:'error', signal:AbortSignal.timeout(20000),
  headers:{...headers,...options.headers},
});
function requireOk(response, operation) {
  if (!response.ok) throw Error(`${operation} failed (HTTP ${response.status}).`);
}
const directory = await mkdtemp(join(tmpdir(),'stu-publish-moodle-'));
const snapshot = join(directory,'capture.sqlite');
try {
  const db = new DatabaseSync(source,{readOnly:true});
  try { await backup(db,snapshot); } finally { db.close(); }
  const copy = new DatabaseSync(snapshot,{readOnly:true});
  let owner, courses, pages;
  try {
    if (copy.prepare('PRAGMA quick_check').get().quick_check !== 'ok') throw Error('Snapshot integrity check failed.');
    const owners = copy.prepare(`
      SELECT owner FROM courses UNION SELECT owner FROM pages UNION SELECT owner FROM activities
      UNION SELECT owner FROM grade_rows UNION SELECT owner FROM imports
    `).all();
    if (owners.length !== 1 || !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(owners[0].owner)) {
      throw Error('Cloud captures must belong to a single verified account ID.');
    }
    owner = owners[0].owner;
    courses = copy.prepare('SELECT count(*) total FROM courses').get().total;
    pages = copy.prepare('SELECT count(*) total FROM pages').get().total;
  } finally { copy.close(); }
  const account = await fetch(new URL(configuredUrl).origin+'/auth/v1/admin/users/'+owner,{headers,signal:AbortSignal.timeout(10000),redirect:'error'});
  requireOk(account,'Production owner check');
  if ((await account.json()).id !== owner) throw Error('Snapshot owner does not match a production account.');
  const bytes = await readFile(snapshot);
  if (bytes.length > 12_000_000) throw Error('Snapshot exceeds the cloud size limit.');
  const listing = await request('/bucket');
  requireOk(listing,'Bucket lookup');
  const existing = (await listing.json()).find(item => item.id === bucket);
  if (existing && existing.public !== false) throw Error('Refusing to publish to a public bucket.');
  if (!existing) {
    const created = await request('/bucket',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({id:bucket,name:bucket,public:false,file_size_limit:12_000_000,allowed_mime_types:['application/octet-stream']})});
    requireOk(created,'Private bucket creation');
  }
  const path = '/' + bucket + '/' + owner + '.sqlite';
  const digest = data => createHash('sha256').update(data).digest('hex');
  const uploaded = await request('/object'+path,{method:'POST',headers:{'Content-Type':'application/octet-stream','x-upsert':'false'},body:bytes});
  if (![400,409].includes(uploaded.status)) requireOk(uploaded,'Snapshot upload');
  const check = await request('/object/authenticated'+path);
  requireOk(check,'Snapshot readback');
  if (digest(Buffer.from(await check.arrayBuffer())) !== digest(bytes)) throw Error('Cloud snapshot differs; existing owners are not overwritten.');
  const anonymous = await fetch(base+'/object/public'+path,{signal:AbortSignal.timeout(10000),redirect:'error'});
  if (anonymous.ok) throw Error('The snapshot was unexpectedly accessible through the public endpoint.');
  console.log(JSON.stringify({courses,pages,verifiedPrivateReadback:true,publicReadDenied:true}));
} finally {
  await unlink(snapshot).catch(()=>{});
  await rmdir(directory);
}
