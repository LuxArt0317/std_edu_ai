import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {restoreDocuments,documentKey,sha} from '../../scripts/lib/school-document-bundle.mjs';
async function fixture(run){
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'stu-supplement-test-'));
 try{
 const bundleDirectory=path.join(root,'bundle'),target=path.join(root,'target'),input=path.join(root,'input'),cache=path.join(root,'cache');
 for(const dir of [bundleDirectory,target,input])await fs.mkdir(dir);
 const descriptor=(name,bytes)=>({file:'/school-assets/'+name,bytes:bytes.length,checksum:sha(bytes)});
 const base=descriptor('aaaaaaaaaaaaaaaaaaaa.pdf',Buffer.from('bundled fixture'));
 const extra=descriptor('bbbbbbbbbbbbbbbbbbbb.pdf',Buffer.from('tracked supplement'));
 await fs.writeFile(path.join(input,path.basename(base.file)),'bundled fixture');
 await fs.writeFile(path.join(target,path.basename(extra.file)),'tracked supplement');
 const archive=path.join(root,'fixture.tar.gz');execFileSync('tar',['-czf',archive,'-C',input,path.basename(base.file)]);
 const bytes=await fs.readFile(archive);await fs.writeFile(path.join(bundleDirectory,'part-000.bin'),bytes);
 const manifest={version:1,documents:1,documentKey:documentKey([base]),archiveBytes:bytes.length,archiveChecksum:sha(bytes),parts:[{file:'part-000.bin',bytes:bytes.length,checksum:sha(bytes)}],supplementalDocuments:[extra]};
 const save=()=>fs.writeFile(path.join(bundleDirectory,'manifest.json'),JSON.stringify(manifest));await save();
 await run({root,bundleDirectory,target,cache,base,extra,manifest,save});
 }finally{await fs.rm(root,{recursive:true,force:true});}
}
test('old bundle restores missing base document alongside exact intact tracked supplement',()=>fixture(async f=>{
 assert.equal(await restoreDocuments([f.base,f.extra],[f.base],f.target,f.cache,{bundleDirectory:f.bundleDirectory}),1);
 assert.equal(await fs.readFile(path.join(f.target,path.basename(f.base.file)),'utf8'),'bundled fixture');
}));
for(const mode of ['missing','tampered','metadata','key'])test('supplement boundary fails closed: '+mode,()=>fixture(async f=>{
 if(mode==='missing')await fs.rm(path.join(f.target,path.basename(f.extra.file)));
 if(mode==='tampered')await fs.writeFile(path.join(f.target,path.basename(f.extra.file)),'tampered content!!');
 if(mode==='metadata')f.manifest.supplementalDocuments[0]={...f.extra,bytes:f.extra.bytes+1};
 if(mode==='key')f.manifest.documentKey='0'.repeat(64);
 await f.save();
 await assert.rejects(restoreDocuments([f.base,f.extra],[f.base],f.target,f.cache,{bundleDirectory:f.bundleDirectory}),/supplemental|reviewed asset/i);
 await assert.rejects(fs.stat(path.join(f.target,path.basename(f.base.file))));
}));
