import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {sha,documentKey,restoreDocuments} from '../../scripts/lib/school-document-bundle.mjs';
const temp=await fs.mkdtemp(path.join(os.tmpdir(),'stu-document-bundle-'));
try{
 const bundleDirectory=path.join(temp,'bundle'),target=path.join(temp,'target'),input=path.join(temp,'input'),cache=path.join(temp,'cache');
 for(const directory of [bundleDirectory,target,input])await fs.mkdir(directory);
 const descriptor=(name,content)=>({file:'/school-assets/'+name,bytes:Buffer.byteLength(content),checksum:sha(Buffer.from(content))});
 const base=descriptor('aaaaaaaaaaaaaaaaaaaa.pdf','reviewed bundled document'),extra=descriptor('bbbbbbbbbbbbbbbbbbbb.pdf','tracked supplemental document');
 await fs.writeFile(path.join(input,path.basename(base.file)),'reviewed bundled document');
 await fs.writeFile(path.join(target,path.basename(extra.file)),'tracked supplemental document');
 const archive=path.join(temp,'fixture.tar.gz');execFileSync('tar',['-czf',archive,'-C',input,path.basename(base.file)]);
 const bytes=await fs.readFile(archive),part=path.join(bundleDirectory,'part-000.bin');await fs.writeFile(part,bytes);
 const manifest={version:1,documents:1,documentKey:documentKey([base]),archiveBytes:bytes.length,archiveChecksum:sha(bytes),parts:[{file:'part-000.bin',bytes:bytes.length,checksum:sha(bytes)}],supplementalDocuments:[extra]};
 const save=()=>fs.writeFile(path.join(bundleDirectory,'manifest.json'),JSON.stringify(manifest));await save();
 const run=()=>restoreDocuments([base,extra],[base],target,cache,{bundleDirectory});
 assert.equal(await run(),1);assert.equal(sha(await fs.readFile(path.join(target,path.basename(base.file)))),base.checksum);
 await fs.rm(path.join(target,path.basename(base.file)));
 const damaged=Buffer.from(bytes);damaged[0]^=1;await fs.writeFile(part,damaged);
 await assert.rejects(run(),/integrity failure/u);
 manifest.parts[0].file='../unexpected.bin';await save();await assert.rejects(run(),/Invalid document bundle part/u);
 manifest.parts[0].file='part-000.bin';await fs.writeFile(part,bytes);await save();
 await fs.writeFile(path.join(target,path.basename(extra.file)),'corrupt supplemental document');await assert.rejects(run(),/corrupt supplemental/u);
 console.log(JSON.stringify({status:'passed',fixtureDocuments:2,networkDownloads:0,corruptPartRejected:true,pathTraversalRejected:true,corruptSupplementRejected:true}));
}finally{await fs.rm(temp,{recursive:true,force:true});}
