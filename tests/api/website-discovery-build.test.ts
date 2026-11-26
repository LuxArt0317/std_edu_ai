import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';import {createHash} from 'node:crypto';
import {generateWebsiteDiscovery} from '../../server/websiteDiscoveryBuild.js';
test('new captured pages enter the index automatically while private routes and evaluator files stay out',async()=>{
 const root=await mkdtemp(join(tmpdir(),'stu-discovery-'));
 try{
  for(const dir of ['src/features/public/mirror','public/school-pages','server/data','docs/question-answer'])await mkdir(join(root,dir),{recursive:true});
  const html='<html><body><nav>IGNORE NAV</nav><main>NEW SOURCE FACT river observatory opens at nine.</main><script>SECRET SCRIPT</script></body></html>',file='/school-pages/12345678901234567890.html',checksum=createHash('sha256').update(html).digest('hex');
  await writeFile(join(root,'public',file),html);
  await writeFile(join(root,'src/features/public/mirror/pages.json'),JSON.stringify([{title:'A newly captured page',route:'/new-observatory/',source:'https://www.stu.edu.tw/new-observatory/',file,checksum,capturedOn:'2026-11-26'},{title:'Private marker',route:'/school-affairs/private',source:'https://www.stu.edu.tw/private',file,checksum,capturedOn:'2026-11-26'}]));
  await writeFile(join(root,'docs/question-answer/README.md'),'DO NOT INDEX EVALUATOR TARGET');
  await generateWebsiteDiscovery(root);const index=JSON.parse(await readFile(join(root,'server/websiteDiscovery.generated.json'),'utf8'));const value=JSON.stringify(index);
  assert.match(value,/NEW SOURCE FACT/);assert.doesNotMatch(value,/SECRET SCRIPT|IGNORE NAV|Private marker|DO NOT INDEX EVALUATOR TARGET/);
  await writeFile(join(root,'public',file),'tampered');await assert.rejects(()=>generateWebsiteDiscovery(root),/checksum mismatch/);
 }finally{await rm(root,{recursive:true,force:true});}
});
