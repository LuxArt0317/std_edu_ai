import assert from 'node:assert/strict';
import {mkdir,readFile,unlink,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright-core';
import AxeBuilder from '@axe-core/playwright';

// Isolated synthetic UI only. The private source screenshot is never read.
process.umask(0o077);
const origin=process.env.PUBLIC_SITE_ORIGIN||'http://127.0.0.1:5184';
assert.ok(['127.0.0.1','localhost'].includes(new URL(origin).hostname),'Use the isolated local component server.');
const directory='artifacts/enrollment-certificate-ui',owner='certificate-qa-owner',other='certificate-qa-other',stamp='2030-01-05T08:07:06Z';
const assessment={id:'local-assessment',userId:owner,sourceMode:'local_demo',version:2,createdAt:stamp,updatedAt:stamp,
  academicYear:130,semester:1,hasPendingFees:'Y',status:'blocked',resultText:'合成站內條件尚未完成',assessedAt:stamp,
  identity:{studentNumber:'LOCAL-QA-01',studentName:'合成測試生',departmentName:'測試學系',yearText:'四',classLabel:'測試班'}};
const foreign={...assessment,id:'foreign-assessment',userId:other,identity:{...assessment.identity,studentName:'OTHER ACCOUNT PRIVATE',studentNumber:'OTHER PRIVATE ID'}};
const snapshot={checkedAt:stamp,profile:{userId:owner},enrollmentCertificate:{assessments:[foreign,assessment],documents:[]}};
const source=JSON.parse(await readFile('artifacts/visual-parity/certificate/geometry.json','utf8'));
const sourceStyles=JSON.parse(await readFile('artifacts/visual-parity/certificate/computed-styles.json','utf8'));
const hash=JSON.parse(await readFile('node_modules/.vite/deps/_metadata.json','utf8')).browserHash;
const html=`<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Synthetic certificate verification</title></head><body><div id="root"></div><script type="module">
import RefreshRuntime from '/@react-refresh';RefreshRuntime.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>type=>type;window.__vite_plugin_react_preamble_installed__=true;await import('/@vite/client');
const {default:React}=await import('/node_modules/.vite/deps/react.js?v=${hash}');const {createRoot}=(await import('/node_modules/.vite/deps/react-dom_client.js?v=${hash}')).default;const {MemoryRouter,useLocation}=await import('/node_modules/.vite/deps/react-router.js?v=${hash}');
await import('/src/index.css');await import('/src/features/public/affairs/portal.css');await import('/src/features/public/site/reference.css');const {EnrollmentCertificate}=await import('/src/features/public/affairs/EnrollmentCertificate.tsx');
function Fixture(){const [state,setState]=React.useState(window.certificateInitial),location=useLocation();window.certificateUpdate=patch=>setState(prior=>({...prior,...patch}));window.certificateLocation=location.pathname;return React.createElement(EnrollmentCertificate,{...state,onReload:()=>{window.certificateReloads=(window.certificateReloads||0)+1;setState(prior=>({...prior,busy:true,error:''}));},onLogout:()=>{window.certificateLogouts=(window.certificateLogouts||0)+1;},onOpenLocalDocument:()=>{window.certificateOpens=(window.certificateOpens||0)+1;}});}
createRoot(document.getElementById('root')).render(React.createElement(MemoryRouter,{initialEntries:['/school-affairs/services/17-1']},React.createElement(Fixture)));
</script></body></html>`;
const mountHtml=`<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Synthetic mounted certificate verification</title></head><body><div id="root"></div><script type="module">
import RefreshRuntime from '/@react-refresh';RefreshRuntime.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>type=>type;window.__vite_plugin_react_preamble_installed__=true;await import('/@vite/client');
const {default:React}=await import('/node_modules/.vite/deps/react.js?v=${hash}');const {createRoot}=(await import('/node_modules/.vite/deps/react-dom_client.js?v=${hash}')).default;const {MemoryRouter}=await import('/node_modules/.vite/deps/react-router.js?v=${hash}');
await import('/src/index.css');await import('/src/features/public/site/reference.css');const {default:SchoolAffairsPortal}=await import('/src/features/public/affairs/SchoolAffairsPortal.tsx');
function Mounted(){const [revision,setRevision]=React.useState(0);window.certificateRemount=()=>setRevision(value=>value+1);return React.createElement(SchoolAffairsPortal,{key:revision,user:window.certificateSyntheticSession.user});}
createRoot(document.getElementById('root')).render(React.createElement(MemoryRouter,{initialEntries:['/school-affairs/menu/aca/query']},React.createElement(Mounted)));
</script></body></html>`;
const mountOwner='10000000-0000-4000-8000-000000000001',mountOther='10000000-0000-4000-8000-000000000002';
const mountUser={id:mountOwner,aud:'authenticated',role:'authenticated',email:'certificate-ui@example.invalid',app_metadata:{provider:'google',providers:['google']},user_metadata:{},created_at:stamp,identities:[{provider:'google'}]};
const fakeToken=[Buffer.from('{"alg":"HS256","typ":"JWT"}').toString('base64url'),Buffer.from(JSON.stringify({sub:mountOwner,aud:'authenticated',role:'authenticated',exp:4102444800})).toString('base64url'),'synthetic-not-a-valid-signature'].join('.');
const syntheticSession={access_token:fakeToken,refresh_token:'synthetic-refresh',expires_in:3600,expires_at:4102444800,token_type:'bearer',user:mountUser};
const mountAssessment={...assessment,id:'20000000-0000-4000-8000-000000000001',userId:mountOwner};
const errors=[],unexpectedRequests=[],geometry={},sourceContrast=[],mountedRequests=[];let browser,page,mounted=false,mountMode='error';
const near=(actual,expected,label,tolerance=.65)=>assert.ok(Math.abs(actual-expected)<tolerance,`${label}: ${actual} vs source ${expected}`);
async function update(patch){await page.evaluate(value=>window.certificateUpdate(value),patch);await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));}
async function noDownload(){assert.equal(await page.locator('.enrollment-certificate-local-document').count(),0);assert.equal(await page.getByRole('button',{name:/產出|下載|開啟 stu.best/}).count(),0);assert.equal(await page.evaluate(()=>window.certificateOpens||0),0);}
async function measure(){
  const selectors=[['.enrollment-certificate-nav',source.find(row=>row.class==='navbar navbar-default')],['.enrollment-certificate-main',source.find(row=>row.class==='page-content')],
    ['.enrollment-certificate-heading',source.find(row=>row.class==='page-header')],['.enrollment-certificate-heading h1',source.find(row=>row.tag==='H4'&&!row.class)],
    ['.enrollment-certificate-profile-heading',source.find(row=>row.tag==='H5')],['.enrollment-certificate-profile',source.find(row=>row.id==='qrydata')],
    ['.enrollment-certificate-table',source.find(row=>row.tag==='TABLE')],['.enrollment-certificate-notes h2',source.find(row=>row.class==='header blue lighter smaller')],
    ['.enrollment-certificate-notes ol',source.find(row=>row.tag==='OL')]];
  for(const [selector,expected] of selectors){
    assert.ok(expected,selector+' captured reference');
    const actual=await page.locator(selector).evaluate(node=>{const s=getComputedStyle(node);return {rect:node.getBoundingClientRect().toJSON(),fontFamily:s.fontFamily,fontSize:s.fontSize,fontWeight:s.fontWeight,lineHeight:s.lineHeight,padding:s.padding,background:s.backgroundColor,color:s.color};});
    geometry[selector]=actual;
    for(const key of ['x','y','width','height'])near(actual.rect[key],expected[key],selector+' '+key);
    if(!selector.endsWith('-nav'))for(const [actualKey,sourceKey] of [['fontFamily','font'],['fontSize','size'],['fontWeight','weight'],['lineHeight','line']])assert.equal(actual[actualKey],expected[sourceKey],selector+' '+actualKey);
  }
  const expected=source.filter(row=>row.tag==='TH'),headers=await page.locator('thead th').evaluateAll(nodes=>nodes.map(node=>{const s=getComputedStyle(node);return {rect:node.getBoundingClientRect().toJSON(),fontFamily:s.fontFamily,fontSize:s.fontSize,fontWeight:s.fontWeight,lineHeight:s.lineHeight,padding:s.padding,background:s.backgroundColor,color:s.color,border:s.border};}));
  assert.equal(headers.length,4);geometry.headers=headers;
  for(let i=0;i<headers.length;i++){
    for(const key of ['x','y','width','height'])near(headers[i].rect[key],expected[i][key],'header '+i+' '+key);
    for(const [a,b]of[['fontFamily','font'],['fontSize','size'],['fontWeight','weight'],['lineHeight','line'],['padding','padding'],['background','background'],['color','color'],['border','border']])assert.equal(headers[i][a],expected[i][b],'header '+i+' '+a);
  }
  assert.equal(await page.locator('.enrollment-certificate-nav').evaluate(node=>getComputedStyle(node).backgroundColor),'rgb(67, 142, 185)');
  assert.equal(await page.locator('.enrollment-certificate-profile').evaluate(node=>getComputedStyle(node).backgroundColor),'rgb(217, 237, 247)');
  assert.equal(await page.locator('tbody td').first().evaluate(node=>getComputedStyle(node).backgroundColor),'rgb(249, 249, 249)');
  geometry.computedStyles={};
  for(const [selector,sourceSelector] of [['.enrollment-certificate-brand','.banner-stu'],['.enrollment-certificate-brand>a','.banner-stu span.first, .banner-stu span.second'],
    ['.enrollment-certificate-menu:first-child','.dropdown-toggle'],['.enrollment-certificate-breadcrumb a:first-of-type','.breadcrumb a'],
    ['.enrollment-certificate-heading h1','.page-header h4'],['.enrollment-certificate-heading small','.page-header h4 small.hidden-xs'],
    ['.enrollment-certificate-profile-heading','h5'],['.enrollment-certificate-blocked','blocked td'],['.enrollment-certificate-notes h2','notes h4']]){
    const expected=sourceStyles.styles.find(item=>item.sourceSelector===sourceSelector);assert.ok(expected,sourceSelector);
    const keys=Object.keys(expected).filter(key=>key!=='sourceSelector');
    const actual=await page.locator(selector).first().evaluate((node,keys)=>Object.fromEntries(keys.map(key=>[key,getComputedStyle(node)[key]])),keys);
    for(const key of keys)assert.equal(actual[key],expected[key],selector+' '+key);geometry.computedStyles[selector]=actual;
  }
}
async function accessibility(label){
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),label+' body containment');
  const result=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze(),unexpected=[];
  for(const violation of result.violations.filter(item=>['serious','critical'].includes(item.impact)))for(const node of violation.nodes){
    const inherited=violation.id==='color-contrast'&&node.target.length===1&&await page.locator(node.target[0]).evaluate(element=>{
      const style=getComputedStyle(element),color=style.color;
      return element.matches('.enrollment-certificate-menu')&&color==='rgb(255, 255, 255)'&&getComputedStyle(element.closest('nav')).backgroundColor==='rgb(67, 142, 185)'
        ||element.matches('.enrollment-certificate-heading small')&&color==='rgb(153, 153, 153)'
        ||element.matches('.enrollment-certificate-notes h2')&&color==='rgb(71, 143, 202)'
        ||element.matches('.enrollment-certificate-breadcrumb a')&&color==='rgb(76, 143, 189)'
        ||element.closest('.enrollment-certificate-brand')&&color==='rgb(255, 255, 255)'&&getComputedStyle(element.closest('.enrollment-certificate-brand')).backgroundColor==='rgb(124, 124, 124)';
    });
    (inherited?sourceContrast:unexpected).push({label,id:violation.id,target:node.target,summary:node.failureSummary});
  }
  assert.deepEqual(unexpected,[],label+' new serious/critical accessibility defects');
}
try{
  await mkdir(directory,{recursive:true,mode:0o700});
  browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
  const context=await browser.newContext({viewport:{width:1533,height:850},locale:'zh-TW',timezoneId:'Asia/Taipei',reducedMotion:'reduce'});
  await context.addInitScript(value=>{window.certificateInitial=value;},{snapshot,busy:false,error:''});
  await context.route('**/*',route=>{
    const url=new URL(route.request().url());
    if(mounted&&url.origin===new URL(origin).origin&&url.pathname==='/api/affairs-data'&&url.search==='?scope=enrollment-certificate'){
      const request=route.request();assert.equal(request.method(),'GET');assert.equal(request.headers().authorization,'Bearer '+fakeToken);assert.equal(request.postData(),null);
      mountedRequests.push({path:url.pathname+url.search,method:request.method(),mode:mountMode});
      return route.fulfill({status:mountMode==='error'?503:200,contentType:'application/json',body:JSON.stringify(mountMode==='error'?{error:'PRIVATE provider detail'}:
        {assessments:[mountMode==='foreign'?{...mountAssessment,userId:mountOther,identity:{...mountAssessment.identity,studentName:'FOREIGN RESPONSE PRIVATE'}}:mountAssessment],documents:[]})});
    }
    if(url.origin!==new URL(origin).origin||url.pathname.startsWith('/api/')){unexpectedRequests.push(url.origin+url.pathname);return route.abort();}
    if(url.pathname==='/__certificate-qa')return route.fulfill({contentType:'text/html',body:html});
    if(url.pathname==='/__certificate-mount-qa')return route.fulfill({contentType:'text/html',body:mountHtml});
    return route.continue();
  });
  page=await context.newPage();page.setDefaultTimeout(10000);page.on('pageerror',error=>errors.push(error.message));
  await page.goto(origin+'/__certificate-qa');await page.locator('.enrollment-certificate-table').waitFor();await page.evaluate(()=>document.fonts.ready);
  await page.mouse.move(0,0);await measure();
  assert.deepEqual(await page.locator('thead th').allTextContents(),['目前學年度','目前學期','是否有待繳費用','在學證明']);
  assert.deepEqual(await page.locator('tbody td').allTextContents(),['130','1','Y','合成站內條件尚未完成']);
  assert.equal(await page.getByText(/OTHER ACCOUNT PRIVATE|OTHER PRIVATE ID/).count(),0);await noDownload();
  assert.equal(await page.locator('.enrollment-certificate-main input,.enrollment-certificate-main select,.enrollment-certificate-main textarea').count(),0);
  assert.equal(await page.locator('.enrollment-certificate-brand img').evaluate(img=>img.complete&&img.naturalWidth>0),true,'Actual local logo asset loads.');
  await accessibility('blocked1533');await page.screenshot({path:directory+'/blocked-1533.png',fullPage:true});
  for(const width of [390,320]){
    await page.setViewportSize({width,height:844});await accessibility('blocked'+width);await noDownload();
    const scroll=page.locator('.enrollment-certificate-scroll');await scroll.focus();await page.keyboard.press('ArrowRight');
    await page.waitForFunction(()=>document.querySelector('.enrollment-certificate-scroll').scrollLeft>0);
    assert.equal(await scroll.evaluate(node=>node.matches(':focus-visible')),true);await page.keyboard.press('Tab');assert.equal(await scroll.evaluate(node=>node===document.activeElement),false);
    await scroll.evaluate(node=>new Promise(resolve=>{let prior=node.scrollLeft,stable=0;function settle(){const next=node.scrollLeft;stable=next===prior?stable+1:0;prior=next;if(stable===5){node.scrollLeft=0;resolve();}else requestAnimationFrame(settle);}requestAnimationFrame(settle);}));
    assert.equal(await scroll.evaluate(node=>node.scrollLeft),0);await page.mouse.move(0,0);
    if(width===390)await page.screenshot({path:directory+'/blocked-390.png',fullPage:true});
  }
  await page.getByRole('button',{name:'資料維護',exact:true}).focus();await page.keyboard.press('Enter');await page.getByRole('menuitem',{name:'----',exact:true}).waitFor();
  assert.equal(await page.getByRole('menuitem').count(),1);assert.equal(await page.getByRole('menuitem').getAttribute('aria-disabled'),'true');await accessibility('maintenance320');await page.keyboard.press('Escape');
  await page.getByRole('menu').waitFor({state:'hidden'});await page.waitForFunction(()=>document.activeElement?.textContent==='資料維護');
  assert.equal(await page.getByRole('button',{name:'資料維護',exact:true}).evaluate(node=>node===document.activeElement),true);
  await page.getByRole('button',{name:'查詢',exact:true}).click();assert.deepEqual(await page.getByRole('menuitem').allTextContents(),['查詢在學證明']);
  const submenuStyle=await page.getByRole('menuitem',{name:'查詢在學證明',exact:true}).evaluate(node=>{const style=getComputedStyle(node);return {color:style.color,fontSize:style.fontSize,lineHeight:style.lineHeight};});
  const {sourceSelector:_,...expectedSubmenu}=sourceStyles.styles.find(item=>item.sourceSelector==='submenu a');assert.deepEqual(submenuStyle,expectedSubmenu);
  await page.getByRole('menuitem',{name:'查詢在學證明',exact:true}).click();assert.equal(await page.evaluate(()=>window.certificateLocation),'/school-affairs/services/17-1');
  await page.getByRole('button',{name:'Index',exact:true}).click();assert.deepEqual(await page.getByRole('menuitem').allTextContents(),['Index','Logout']);
  assert.equal(await page.getByRole('menuitem',{name:'Index',exact:true}).getAttribute('href'),'/school-affairs');await accessibility('index320');
  await page.getByRole('menuitem',{name:'Logout',exact:true}).click();assert.equal(await page.evaluate(()=>window.certificateLogouts),1);
  await update({snapshot:null,busy:true,error:''});await page.getByRole('status').filter({hasText:'載入在學證明'}).waitFor();assert.equal(await page.locator('tbody tr').count(),0);await noDownload();await accessibility('loading320');
  await update({busy:false,error:'Synthetic certificate reload failure'});await page.getByRole('alert').waitFor();await page.getByRole('button',{name:'重新載入',exact:true}).click();
  await page.getByRole('status').filter({hasText:'載入在學證明'}).waitFor();assert.equal(await page.evaluate(()=>window.certificateReloads),1);
  await update({snapshot,busy:false,error:''});await update({snapshot:{...snapshot,profile:{userId:other}}});
  assert.equal(await page.getByText(/合成測試生/).count(),0);assert.equal(await page.getByText(/OTHER ACCOUNT PRIVATE/).count(),1);await noDownload();
  await update({snapshot:{...snapshot,enrollmentCertificate:{assessments:[foreign],documents:[]}}});assert.equal(await page.getByText(/OTHER ACCOUNT PRIVATE/).count(),0);await page.getByRole('status').filter({hasText:'目前沒有站內'}).waitFor();await noDownload();
  await update({snapshot:{...snapshot,enrollmentCertificate:{assessments:[assessment,{...assessment,id:'duplicate'}],documents:[]}}});await page.getByRole('status').filter({hasText:'多筆站內條件紀錄'}).waitFor();assert.equal(await page.locator('tbody tr').count(),0);
  const unknown={...assessment,academicYear:null,semester:null,hasPendingFees:null,status:'unknown',resultText:null,identity:{...assessment.identity,studentName:''}};
  await update({snapshot:{...snapshot,enrollmentCertificate:{assessments:[unknown],documents:[]}}});assert.deepEqual(await page.locator('tbody td').allTextContents(),['—','—','—','尚未完成站內條件確認']);await noDownload();
  const localEligible={...assessment,hasPendingFees:'N',status:'local_eligible',resultText:null};
  const metadata={id:'local-reference',userId:owner,assessmentId:assessment.id,assessmentVersion:2,issuer:'stu.best',purpose:'local_enrollment_reference',status:'metadata_only',verifiedAt:null,expiresAt:null};
  await update({snapshot:{...snapshot,enrollmentCertificate:{assessments:[localEligible],documents:[metadata]}}});await noDownload();
  await update({snapshot:{...snapshot,enrollmentCertificate:{assessments:[localEligible],documents:[{...metadata,status:'available',verifiedAt:null}]}}});await noDownload();
  await update({snapshot:{...snapshot,enrollmentCertificate:{assessments:[{...assessment,resultText:'<img src=x onerror="window.certificateInjected=true">'}],documents:[]}}});
  assert.equal(await page.locator('tbody img,tbody script').count(),0);assert.equal(await page.evaluate(()=>window.certificateInjected),undefined);await noDownload();await accessibility('literal320');
  assert.deepEqual(errors,[]);assert.deepEqual(unexpectedRequests,[]);
  // Exercise the actual portal branch and default caller-token transport using
  // a fresh synthetic auth cache and intercepted local API, never real auth/DB.
  mounted=true;
  await context.addInitScript(value=>{window.certificateSyntheticSession=value;localStorage.setItem('stu-school-affairs-auth',JSON.stringify(value));},syntheticSession);
  await page.goto(origin+'/__certificate-mount-qa');
  const catalogLink=page.getByRole('link',{name:'在學證明',exact:true});await catalogLink.waitFor();assert.equal(await catalogLink.getAttribute('href'),'/school-affairs/services/17-1');
  await catalogLink.click();await page.locator('.enrollment-certificate').waitFor();await page.getByRole('alert').waitFor();
  assert.doesNotMatch(await page.locator('body').textContent(),/PRIVATE provider detail/);assert.equal(mountedRequests.length,1);
  assert.equal(await page.locator('.student-service-workspace').count(),0);assert.equal(await page.locator('tbody tr').count(),0);
  mountMode='success';await page.getByRole('button',{name:'重新載入',exact:true}).click();await page.locator('tbody td').first().waitFor();
  assert.deepEqual(await page.locator('tbody td').allTextContents(),['130','1','Y','合成站內條件尚未完成']);assert.equal(mountedRequests.length,2);await noDownload();await accessibility('mounted320');
  mountMode='foreign';await page.evaluate(()=>window.certificateRemount());await page.getByRole('alert').waitFor();
  assert.equal(await page.getByText(/FOREIGN RESPONSE PRIVATE/).count(),0);assert.equal(await page.locator('tbody tr').count(),0);assert.equal(mountedRequests.length,3);await noDownload();
  mountMode='success';await page.getByRole('button',{name:'重新載入',exact:true}).click();await page.locator('tbody td').first().waitFor();assert.equal(mountedRequests.length,4);
  assert.deepEqual(errors,[]);assert.deepEqual(unexpectedRequests,[]);
  await Promise.all(['failure.json','failure.png'].map(name=>unlink(directory+'/'+name).catch(error=>{if(error.code!=='ENOENT')throw error;})));
  await writeFile(directory+'/result.json',JSON.stringify({status:'passed',syntheticOnly:true,sourcePrivateScreenshotRead:false,geometry,sourceInheritedContrast:sourceContrast,unexpectedSeriousCriticalAccessibilityIssues:0,mountedRequests,
    accessibilityAcceptance:'Preserved captured source contrast; zero additional serious or critical issues.',sourceColorEvidence:'artifacts/visual-parity/certificate/computed-styles.json',
    checks:['1533 source frame, headings, profile, four table columns and note geometry','390/320 containment and keyboard table scrolling','exact captured menus and logout','blocked/unknown/empty/loading/error/retry','strict owner and duplicate-record isolation','no document action from eligibility or unverified metadata','literal text and zero external requests','actual portal17-1 mount uses only intercepted personal scope with caller token, retries and rejects foreign response'],
    limitations:['Synthetic intercepted API only; no live backend or document-content verification.','Source screenshot/private values are excluded; synthetic data changes text content.','Footer is the independent local convention; dropdown microgeometry was not captured.']},null,2)+'\n',{mode:0o600});
  console.log('Certificate UI passed: source1533 geometry, 390/320 containment, exact menus, own/unknown/blocked/loading/error states and no fake document action.');
}catch(error){
  const diagnostics=page?await page.locator('.enrollment-certificate-shell,.enrollment-certificate-main,.enrollment-certificate-heading,.enrollment-certificate-profile-heading,.enrollment-certificate-profile,.enrollment-certificate-table,.enrollment-certificate-datetime,.enrollment-certificate-notes h2,.enrollment-certificate-notes ol').evaluateAll(nodes=>nodes.map(node=>({class:node.className,rect:node.getBoundingClientRect().toJSON(),font:getComputedStyle(node).font,padding:getComputedStyle(node).padding,margin:getComputedStyle(node).margin}))).catch(()=>[]):[];
  await writeFile(directory+'/failure.json',JSON.stringify({error:String(error),errors,geometry,sourceContrast,diagnostics},null,2)+'\n',{mode:0o600}).catch(()=>{});await page?.screenshot({path:directory+'/failure.png',fullPage:true}).catch(()=>{});throw error;
}finally{await browser?.close();}
