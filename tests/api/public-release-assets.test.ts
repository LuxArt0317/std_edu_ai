import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {copyPublicAssets} from '../../scripts/lib/copy-public-assets.mjs';

test('public release includes pinned assets only, rejects traversal and preserves built hardlinks on atomic refresh',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'stu-pinned-release-'));
 try {
  fs.mkdirSync(path.join(root,'src/features/public/mirror'),{recursive:true});
  fs.mkdirSync(path.join(root,'public/school-assets'),{recursive:true});
  fs.mkdirSync(path.join(root,'public/school-pages'),{recursive:true});
  const owned='/school-assets/0123456789abcdef0123.pdf';
  const source=path.join(root,'public',owned.slice(1));
  fs.writeFileSync(source,'reviewed');
  fs.writeFileSync(path.join(root,'public/school-assets/unreleased.mp4'),'unreleased archive');
  fs.writeFileSync(path.join(root,'public/school-pages/search.json'),'[]');
  fs.writeFileSync(path.join(root,'public/favicon.svg'),'<svg/>');
  const manifest=path.join(root,'src/features/public/mirror/assets.json');
  fs.writeFileSync(manifest,JSON.stringify([{file:owned}]));
  const home='/school-pages/aaaaaaaaaaaaaaaaaaaa.html';
  fs.writeFileSync(path.join(root,'public',home.slice(1)),'<!doctype html><html><head></head><body>School</body></html>');
  fs.writeFileSync(path.join(root,'src/features/public/mirror/pages.json'),JSON.stringify([{route:'/',file:home}]));
  const output=path.join(root,'dist');fs.mkdirSync(output);fs.writeFileSync(path.join(output,'index.html'),'<html>App shell</html>');assert.equal(copyPublicAssets(root,output),3);
  assert.match(fs.readFileSync(path.join(output,'index.html'),'utf8'),/校園網站介面預覽/);
  assert.match(fs.readFileSync(path.join(output,'app-shell.html'),'utf8'),/App shell/);
  assert.equal(fs.existsSync(path.join(output,'school-assets/unreleased.mp4')),false);
  assert.equal(fs.readFileSync(path.join(output,'favicon.svg'),'utf8'),'<svg/>');
  assert.equal(fs.statSync(source).ino,fs.statSync(path.join(output,owned.slice(1))).ino);
  fs.writeFileSync(source+'.tmp','updated');fs.renameSync(source+'.tmp',source);
  assert.equal(fs.readFileSync(path.join(output,owned.slice(1)),'utf8'),'reviewed');
  fs.writeFileSync(manifest,JSON.stringify([{file:'/school-assets/../../private.txt'}]));
  assert.throws(()=>copyPublicAssets(root,path.join(root,'invalid')),/Invalid release asset path/);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
