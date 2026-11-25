import {constants} from 'node:fs';
import {lstat,mkdir,open,readdir,realpath} from 'node:fs/promises';
import {dirname,isAbsolute,join,resolve} from 'node:path';
import {isDeepStrictEqual} from 'node:util';
import {
  assertLeaveFixture,freezeLeaveFixture,leaveFixtureDigest,leaveFixtureExact,leaveFixtureFamilies,
} from './student-leave-fixture-plan.mjs';

const uuid=value=>typeof value==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u.test(value);
const hashLength=(value,length)=>typeof value==='string'&&new RegExp('^[a-f0-9]{'+length+'}$','u').test(value);
const phases=['transition-intent','mutation-intent','ready','cleanup-intent','cleaned'];
const maxEntries=256;
const maxBytes=12000;

function bindingFor(value){
  assertLeaveFixture(leaveFixtureExact(value,['runId','projectRef','origin','sourceRevision','suiteHash','ownerIds'])
    &&uuid(value.runId)&&value.projectRef==='xiftudmvxphxcjtmfmib'
    &&typeof value.origin==='string'&&/^https:\/\/[a-z0-9](?:[a-z0-9-]*[a-z0-9])?-v1-d286\.vercel\.app$/u.test(value.origin)
    &&hashLength(value.sourceRevision,40)&&hashLength(value.suiteHash,64)
    &&Array.isArray(value.ownerIds)&&value.ownerIds.length===2&&value.ownerIds.every(uuid)
    &&new Set([value.runId,...value.ownerIds]).size===3,'invalid_journal_binding');
  return structuredClone(value);
}
const members=(value,valid,limit)=>Array.isArray(value)&&value.length<=limit&&new Set(value).size===value.length&&value.every(valid);
function checkedState(value,expectedBinding){
  assertLeaveFixture(leaveFixtureExact(value,['version','binding','sequence','previousDigest','phase','previous','next','knownFamilies','reservedRecordIds'])
    &&value.version===1&&Number.isInteger(value.sequence)&&value.sequence>=1&&value.sequence<=maxEntries
    &&(value.sequence===1?value.previousDigest===null:hashLength(value.previousDigest,64))&&phases.includes(value.phase)
    &&isDeepStrictEqual(bindingFor(value.binding),expectedBinding)
    &&members(value.knownFamilies,family=>leaveFixtureFamilies.includes(family),leaveFixtureFamilies.length)&&value.knownFamilies.length
    &&members(value.reservedRecordIds,uuid,150)&&value.reservedRecordIds.length
    &&[value.previous,value.next].filter(family=>family!==null).every(family=>value.knownFamilies.includes(family))
    &&(!['transition-intent','mutation-intent','ready'].includes(value.phase)||value.next!==null)
    &&(value.phase!=='cleaned'||value.previous===null&&value.next===null),'journal_drift');
  return freezeLeaveFixture(structuredClone(value));
}

async function syncDirectory(path){
  let handle;
  try{handle=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW);await handle.sync();}
  finally{await handle?.close();}
}
async function privateDirectory(directory){
  assertLeaveFixture(typeof directory==='string'&&isAbsolute(directory)&&typeof process.getuid==='function','unsafe_journal');
  const path=resolve(directory);
  let created=false;
  try{await mkdir(path,{mode:0o700});created=true;}catch(error){if(error.code!=='EEXIST')throw error;}
  const real=await realpath(path);
  const stat=await lstat(path);
  assertLeaveFixture(stat.isDirectory()&&!stat.isSymbolicLink()&&stat.uid===process.getuid()&&(stat.mode&0o7777)===0o700,'unsafe_journal');
  if(created)await syncDirectory(await realpath(dirname(path)));
  return {path:real,device:stat.dev,inode:stat.ino};
}
async function checkDirectory(folder){
  const stat=await lstat(folder.path);
  assertLeaveFixture(stat.isDirectory()&&!stat.isSymbolicLink()&&stat.uid===process.getuid()
    &&(stat.mode&0o7777)===0o700&&stat.dev===folder.device&&stat.ino===folder.inode,'unsafe_journal');
}
const fileName=(runId,n)=>'student-leave-fixture-'+runId+'-'+String(n).padStart(3,'0')+'.json';
function checkFile(stat){
  assertLeaveFixture(stat.isFile()&&stat.nlink===1&&stat.uid===process.getuid()
    &&(stat.mode&0o7777)===0o600&&stat.size<=maxBytes,'unsafe_journal');
}
async function readFileState(path,binding){
  let handle;
  try{
    handle=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW);
    const before=await handle.stat();
    checkFile(before);
    const buffer=Buffer.alloc(maxBytes+1);
    let size=0;
    for(;;){
      const {bytesRead}=await handle.read(buffer,size,buffer.length-size,size);
      if(!bytesRead)break;
      size+=bytesRead;
      assertLeaveFixture(size<=maxBytes,'unsafe_journal');
    }
    const after=await handle.stat();
    checkFile(after);
    assertLeaveFixture(size===before.size&&size===after.size&&before.mtimeMs===after.mtimeMs&&before.ctimeMs===after.ctimeMs,'journal_drift');
    let parsed;
    try{parsed=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(buffer.subarray(0,size)));}
    catch{assertLeaveFixture(false,'journal_drift');}
    return checkedState(parsed,binding);
  }finally{await handle?.close();}
}

function checkAdvance(current,next){
  const pairMatches=current&&next.previous===current.previous&&next.next===current.next;
  const kindAllowed=current===null?next.phase==='transition-intent'&&next.previous===null
    :current.phase==='transition-intent'?next.phase==='mutation-intent'&&pairMatches
      ||next.phase==='cleanup-intent'&&next.previous===current.previous&&next.next===null
      :current.phase==='mutation-intent'?['ready','cleanup-intent'].includes(next.phase)&&pairMatches
        :current.phase==='ready'?['transition-intent','cleanup-intent'].includes(next.phase)&&next.previous===current.next
          &&(next.phase==='transition-intent'||next.next===null)
          :current.phase==='cleanup-intent'?next.phase==='cleaned'||next.phase==='cleanup-intent'&&pairMatches:false;
  assertLeaveFixture(next.sequence===(current?.sequence??0)+1
    &&next.previousDigest===(current?leaveFixtureDigest(current):null)&&kindAllowed
    &&(!current||current.knownFamilies.every(family=>next.knownFamilies.includes(family))
      &&current.reservedRecordIds.every(id=>next.reservedRecordIds.includes(id))),'journal_drift');
}

/** Append-only owner-local journal. The caller must also hold the existing
 * run lease. Sequence files are opened exclusively, fsynced, and read back.
 * A damaged entry blocks reopening. No cleanup or provider access is implied. */
export async function openStudentLeaveFixtureJournal({directory,binding}={}){
  const folder=await privateDirectory(directory),identity=bindingFor(binding);
  async function read(){
    await checkDirectory(folder);
    const prefix='student-leave-fixture-'+identity.runId+'-';
    const names=(await readdir(folder.path)).filter(name=>name.startsWith(prefix)).sort();
    assertLeaveFixture(names.length<=maxEntries,'journal_drift');
    let previous=null;
    for(const [index,name] of names.entries()){
      assertLeaveFixture(name===fileName(identity.runId,index+1),'journal_drift');
      const entry=await readFileState(join(folder.path,name),identity);
      checkAdvance(previous,entry);
      previous=entry;
    }
    return previous;
  }
  async function compareAndSet(expected,next){
    next=checkedState(next,identity);
    const current=await read();
    assertLeaveFixture(isDeepStrictEqual(current,expected),'journal_drift');
    checkAdvance(current,next);
    const serialized=JSON.stringify(next)+'\n';
    assertLeaveFixture(Buffer.byteLength(serialized)<=maxBytes,'unsafe_journal');
    await checkDirectory(folder);
    let handle;
    try{
      handle=await open(join(folder.path,fileName(identity.runId,next.sequence)),constants.O_CREAT|constants.O_EXCL|constants.O_WRONLY|constants.O_NOFOLLOW,0o600);
      await handle.writeFile(serialized);await handle.sync();
    }finally{await handle?.close();}
    await syncDirectory(folder.path);
    assertLeaveFixture(isDeepStrictEqual(await read(),next),'journal_drift');
    return true;
  }
  return freezeLeaveFixture({read,compareAndSet});
}
