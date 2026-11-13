import assert from 'node:assert/strict';
import {after,afterEach,test} from 'node:test';
import {createRequire,registerHooks} from 'node:module';
import {emptyDtmGradeCells,type DtmGradeReportRecord,type DtmGradeReportData} from '../../src/services/dtmGradeReport';
const {JSDOM}=createRequire(import.meta.url)('jsdom') as {JSDOM:new(html:string,options:object)=>{window:Window & typeof globalThis}};
const dom=new JSDOM('<!doctype html><html><body></body></html>',{url:'http://localhost'});
for(const key of ['window','document','HTMLElement','Node','Event','MutationObserver','getComputedStyle'] as const)Object.defineProperty(globalThis,key,{value:key==='window'?dom.window:key==='document'?dom.window.document:dom.window[key],configurable:true});
Object.defineProperty(globalThis,'navigator',{value:dom.window.navigator,configurable:true});Object.defineProperty(globalThis,'IS_REACT_ACT_ENVIRONMENT',{value:true,writable:true,configurable:true});
const hook=registerHooks({load(url,context,next){return url.endsWith('/dtmGradeReport.css')?{format:'module',source:'export {};',shortCircuit:true}:next(url,context);}});
const {DtmGradeReport}=await import('../../src/features/public/dtm/DtmGradeReport');hook.deregister();
const {render,cleanup,fireEvent}=await import('@testing-library/react');afterEach(cleanup);after(()=>dom.window.close());
const user='10000000-0000-4000-8000-000000000001',foreign='10000000-0000-4000-8000-000000000002',courseId='20000000-0000-4000-8000-000000000001';
const course={id:courseId,userId:user,title:'Synthetic course'},date='2030-01-01T00:00:00Z';
const report:DtmGradeReportRecord={id:'30000000-0000-4000-8000-000000000001',userId:user,courseId,sourceMode:'local_demo',version:1,createdAt:date,updatedAt:date,items:[
 {...emptyDtmGradeCells(),id:'40000000-0000-4000-8000-000000000002',label:'Second ID first',activityKind:'assignment',score:0,maximum:10,gradeText:null,weightText:'0.00 %',weightNote:'(空白)',rangeText:'',percentageText:'0',feedbackText:'<script>synthetic</script>'},
 {...emptyDtmGradeCells(),id:'40000000-0000-4000-8000-000000000001',label:'First ID second',activityKind:null,gradeText:'P',rangeText:'literal range',percentageText:'withdrawn'},
],total:{...emptyDtmGradeCells(),gradeText:'0',rangeText:'',feedbackText:'Explicit total'}};
const tree=(data:DtmGradeReportData|null={report})=><DtmGradeReport userId={user} course={course} data={data}/>;
test('report preserves source columns, stored order, explicit total and independent literal null/blank/zero',()=>{
 const view=render(tree()),table=view.getByRole('table');assert.equal(table.querySelectorAll('thead th').length,8);
 assert.deepEqual([...table.querySelectorAll('thead th')].map(x=>x.textContent),['評分項目','計算後權量','成績','全距','百分比','排名','回饋','貢獻到課程總分']);
 const items=[...table.querySelectorAll('tr[id^="report-item-"]')];assert.deepEqual(items.map(x=>x.id),report.items.map(x=>'report-item-'+x.id));
 const cells=[...items[0].querySelectorAll('td')].map(x=>x.textContent);assert.deepEqual(cells,['0.00 %(空白)','-','','0','-','<script>synthetic</script>','-']);
 assert.equal(table.querySelector('script'),null);assert.equal(table.querySelectorAll('img[src$="assign.svg"]').length,1);assert.equal(table.querySelector('[id^="grade-"]'),null);
 assert.equal(table.querySelector('.dtm-literal-grade-total td:nth-of-type(2)')?.textContent,'0');assert.equal(table.querySelector('.dtm-literal-grade-total td:nth-of-type(3)')?.textContent,'');
 assert.equal(view.container.querySelector('a,form,input,button'),null);
});
test('empty items and absent total never invent a subtotal or numeric display',()=>{
 const view=render(tree({report:{...report,items:[],total:null}}));assert.equal(view.getByRole('table').querySelectorAll('tbody tr').length,1);assert.equal(view.queryByText('課程總分'),null);
 view.rerender(tree({report:{...report,items:[{...report.items[0],gradeText:null,score:99,maximum:100}],total:null}}));assert.equal(view.container.querySelector('tr[id] td:nth-of-type(2)')?.textContent,'-');assert.doesNotMatch(view.container.textContent!,/99|100/);
});
test('foreign, absent, malformed and duplicate report data stays unavailable rather than showing a fabricated empty table',()=>{
 for(const data of [null,{report:null},{report:{...report,userId:foreign}},{report:{...report,courseId:foreign}},{report:{...report,items:[report.items[0],report.items[0]]}},{report:{...report,extra:true}}]){
  const view=render(tree(data as DtmGradeReportData));assert.equal(view.queryByRole('table'),null);assert.match(view.getByRole('status').textContent!,/無法取得/);view.unmount();
 }
 const view=render(<DtmGradeReport userId={foreign} course={course} data={{report}}/>);assert.equal(view.queryByRole('table'),null);assert.doesNotMatch(view.container.textContent!,/Synthetic course|Second ID/);
});
test('loading/error/retry are honest and caller-supplied translations do not expose implementation labels',()=>{
 let reload=0;const view=render(<DtmGradeReport userId={user} course={course} data={null} busy t={(_zh,en)=>en} onReload={()=>reload++}/>);assert.match(view.getByRole('status').textContent!,/Loading grade report/);assert.equal(view.queryByRole('button'),null);
 view.rerender(<DtmGradeReport userId={user} course={course} data={null} error="Synthetic unavailable" onReload={()=>reload++}/>);assert.match(view.getByRole('alert').textContent!,/Synthetic unavailable/);fireEvent.click(view.getByRole('button'));assert.equal(reload,1);assert.doesNotMatch(view.container.textContent!,/literal|原文/);
});
