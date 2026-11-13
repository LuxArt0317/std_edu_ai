import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {chromium} from 'playwright-core';
import {affairsTestUser,mockAffairsAuth} from './helpers/affairs-auth.mjs';
import {schoolServiceReadFixture} from './helpers/school-service-route-inventory.mjs';

const origin=process.env.PUBLIC_SITE_ORIGIN ?? 'http://127.0.0.1:5184';
const apiOrigin=process.env.PROGRAM_API_ORIGIN ?? origin;
const root='/school-affairs/services/12-6';
const dataPath='/api/affairs-data?scope=interdisciplinary-programs';
const assets='/stu-reference/interdisciplinary/';
const checksums=JSON.parse(await readFile(new URL('../../public'+assets+'checksums.json',import.meta.url),'utf8'));
assert.ok(['https://stu.best','http://127.0.0.1:5184'].includes(origin));
assert.ok(['https://stu.best','http://127.0.0.1:5198'].includes(apiOrigin));
if(origin==='https://stu.best') {
  const revision=process.env.EXPECTED_RELEASE_REVISION;
  assert.match(revision ?? '',/^[a-f0-9]{40}$/);
  const release=await fetch(origin+'/release.json',{signal:AbortSignal.timeout(10000)});
  assert.equal((await release.json()).revision,revision);
}

const directory=await fetch(apiOrigin+dataPath,{signal:AbortSignal.timeout(10000)});
assert.equal(directory.status,200);
const {programs}=await directory.json();
assert.equal(programs.length,35);
assert.equal(new Set(programs.map(program=>program.code)).size,35);
for (const {code,document_sha256} of programs) assert.equal(document_sha256,checksums[code+'.pdf']??null);
const pdfs=Object.keys(checksums).filter(name=>name.endsWith('.pdf'));
assert.equal(pdfs.length,30);
for (let start=0; start<pdfs.length; start+=5) {
  await Promise.all(pdfs.slice(start,start+5).map(async name=>{
    const response=await fetch(origin+assets+name,{redirect:'error',signal:AbortSignal.timeout(15000)});
    assert.equal(response.status,200,name);
    assert.match(response.headers.get('content-type'),/^application\/pdf\b/,name);
    const bytes=Buffer.from(await response.arrayBuffer());
    assert.equal(bytes.subarray(0,5).toString(),'%PDF-',name);
    assert.equal(createHash('sha256').update(bytes).digest('hex'),checksums[name],name);
  }));
}

const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
const failures=[];
async function open(signedIn) {
  const context=await browser.newContext({viewport:{width:1280,height:720},serviceWorkers:'block'});
  context.on('page',page=>page.on('pageerror',error=>failures.push(error.message)));
  await context.route(/^https?:\/\//,async route=>{
    const request=route.request(),url=new URL(request.url());
    if(url.origin===origin && request.method()==='GET') {
      if(!url.pathname.startsWith('/api/') || (apiOrigin===origin && url.pathname+url.search===dataPath))return route.continue();
      if(url.pathname+url.search===dataPath)return route.fulfill({response:await context.request.get(apiOrigin+dataPath)});
      return route.fulfill({json:schoolServiceReadFixture(url.href,'GET',affairsTestUser,origin)});
    }
    failures.push(request.method()+' '+url.origin+url.pathname);
    return route.abort();
  });
  await mockAffairsAuth(context,{signedIn});
  await context.routeWebSocket('**/*',socket=>socket.close());
  return context.newPage();
}
try {
  const page=await open(true);
  await page.goto(origin+'/school-affairs/menu/aca/all');
  const link=page.locator('a[data-program-id="12-6"]');
  assert.equal(await link.getAttribute('href'),root);
  await link.click();
  await page.waitForURL(origin+root);
  const table=page.getByRole('table');
  await table.getByRole('rowheader',{name:'PU002'}).waitFor();
  assert.equal(await table.locator('tbody tr').count(),35);
  assert.equal(await table.locator('tbody a').count(),30);
  const shell=await page.locator('.interdisciplinary-programs > main').boundingBox();
  const matrix=await table.boundingBox();
  assert.deepEqual([shell.x,shell.y,shell.width],[159,12,962]);
  assert.ok(Math.abs(matrix.x-193)<2 && Math.abs(matrix.y-170)<3 && Math.abs(matrix.width-894)<3,JSON.stringify(matrix));
  const sort=table.getByRole('button',{name:'取得學分學程總學分'});
  await sort.click();
  const numericColumn=()=>table.locator('tbody tr > :nth-child(6)').allTextContents();
  const numbers=(await numericColumn()).map(Number);
  assert.deepEqual(numbers,numbers.toSorted((a,b)=>a-b));
  await sort.click();
  assert.deepEqual((await numericColumn()).map(Number),numbers.toReversed());
  assert.equal(await sort.locator('..').getAttribute('aria-sort'),'descending');
  for(const width of [1280,768,390,320]) {
    await page.setViewportSize({width,height:720});
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`Document overflow at ${width}px`);
  }
  const pdf=page.waitForResponse(origin+assets+'PU002.pdf');
  await table.getByRole('link',{name:programs[0].name,exact:true}).click();
  await page.waitForURL(origin+root+'/program/PU002');
  assert.equal((await pdf).status(),200);
  assert.equal(await page.getByRole('link',{name:'下載 PDF'}).getAttribute('download'),'');
  await page.getByRole('link',{name:'返回學分學程清單'}).click();
  await page.waitForURL(origin+root);
  await page.getByRole('link',{name:'個人備註'}).click();
  await page.waitForURL(origin+root+'/notes');
  await page.locator('.student-service').waitFor();
  await page.goto(origin+root+'/program/PU086');
  await page.getByText('找不到此學程的文件。').waitFor();
  const guest=await open(false);
  await guest.goto(origin+root+'/program/PU002');
  await guest.waitForURL(url=>url.pathname==='/school-affairs/login');
  assert.equal(new URL(guest.url()).searchParams.get('next'),root+'/program/PU002');
  assert.deepEqual(failures,[]);
  console.log(JSON.stringify({programs:programs.length,verifiedPdfs:pdfs.length,sortable:true,responsiveWidths:4,notes:true,guestReturn:true,pageErrors:0}));
} finally {
  await browser.close();
}
