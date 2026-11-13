import assert from 'node:assert/strict';
import {afterEach,test} from 'node:test';
import {createRequire,registerHooks} from 'node:module';
import type {SyllabusSearchFilters,SyllabusSearchProps,SyllabusSearchRow,SyllabusSearchSort} from '../../src/features/public/affairs/SyllabusSearch';

const {JSDOM}=createRequire(import.meta.url)('jsdom') as {JSDOM:new(html:string,options:object)=>{window:Window & typeof globalThis}};
const dom=new JSDOM('<!doctype html><html><body></body></html>',{url:'http://localhost',pretendToBeVisual:true});
for(const name of ['window','document','HTMLElement','HTMLInputElement','HTMLButtonElement','HTMLSelectElement','Node','Event','MouseEvent','MutationObserver','getComputedStyle'])Object.defineProperty(globalThis,name,{value:name==='window'?dom.window:name==='document'?dom.window.document:dom.window[name as keyof Window],configurable:true});
Object.defineProperty(globalThis,'navigator',{value:dom.window.navigator,configurable:true});
const hook=registerHooks({load(url,context,next){return url.endsWith('/syllabusSearch.css')?{format:'module',source:'export {};',shortCircuit:true}:next(url,context);}});
const {SyllabusSearch}=await import('../../src/features/public/affairs/SyllabusSearch');hook.deregister();
const {render,cleanup,fireEvent,within}=await import('@testing-library/react');
afterEach(cleanup);
const row:SyllabusSearchRow={id:'synthetic-one',course_code:'DEMO-001',course_name:'合成課程',academicYearText:'130',semesterText:'0',admission_name:'合成學制',instructor:'合成教師'};
const noop=()=>{};
const props:SyllabusSearchProps={terms:[{value:'term-a',label:'合成第一學期'},{value:'term-b',label:'合成第二學期'}],departments:[{value:'demo',label:'合成系所'}],result:null,busy:false,onSearch:noop,onRetry:noop,onOpenDetail:noop};

test('syllabus search preserves the source controls and unknown results without inventing a term or empty result',()=>{
  const view=render(<SyllabusSearch {...props}/>);
  assert.ok(view.getByRole('heading',{name:'樹德校務資訊系統 ─ 課程大綱查詢'}));
  assert.equal(view.getAllByRole('checkbox').length,26);
  const themeRows=view.container.querySelectorAll('.syllabus-search-themes tbody tr');assert.equal(themeRows.length,13);assert.equal(themeRows[0].children[0].textContent,'1');assert.equal(themeRows[0].children[2].textContent,'2');assert.equal(themeRows[12].children[0].textContent,'25');assert.equal(themeRows[12].children[2].textContent,'26');
  assert.equal((view.getByLabelText('當期課程') as HTMLInputElement).checked,true);
  assert.equal((view.getByLabelText('學年學期') as HTMLSelectElement).value,'');
  assert.equal((view.getByLabelText('系所') as HTMLSelectElement).value,'');
  assert.deepEqual(within(view.getByRole('region',{name:'課綱查詢結果'})).getAllByRole('columnheader').map(element=>element.textContent),['序號','課號','課程名稱','學年','學期','學制','授課老師','內容']);
  assert.ok(view.getByText('請設定條件後查詢。'));assert.equal(view.queryByText('查無資料'),null);assert.equal(view.queryByText(/查詢結果計0筆/),null);
});

test('all query criteria reach the host, checkbox order is stable, and clearing affects only the unsubmitted form',()=>{
  const calls:SyllabusSearchFilters[]=[];
  const view=render(<SyllabusSearch {...props} result={{scope:'current',total:1,rows:[row]}} onSearch={value=>calls.push(value)}/>);
  fireEvent.change(view.getByLabelText('關鍵字'),{target:{value:' literal keyword '}});fireEvent.click(view.getByLabelText('歷年課程'));
  fireEvent.change(view.getByLabelText('學年學期'),{target:{value:'term-b'}});fireEvent.change(view.getByLabelText('系所'),{target:{value:'demo'}});
  fireEvent.click(view.getByLabelText('資訊素養'));fireEvent.click(view.getByLabelText('服務學習'));fireEvent.click(view.getByRole('button',{name:'查詢'}));
  assert.deepEqual(calls,[{keyword:' literal keyword ',scope:'historical',term:'term-b',department:'demo',themes:['1','26']}]);
  assert.ok(view.getByText('當期課綱查詢結果計1筆'),'A pending selection never relabels the previous response.');
  calls[0].themes.push('2');assert.equal((view.getByLabelText('生涯規劃') as HTMLInputElement).checked,false,'Callback receives an independent array.');
  fireEvent.click(view.getByRole('button',{name:'清除'}));assert.equal(calls.length,1);
  assert.equal((view.getByLabelText('關鍵字') as HTMLInputElement).value,'');assert.equal((view.getByLabelText('當期課程') as HTMLInputElement).checked,true);
  assert.equal((view.getByLabelText('學年學期') as HTMLSelectElement).value,'');assert.equal(view.getAllByRole('checkbox').some(input=>(input as HTMLInputElement).checked),false);
  assert.ok(view.getByText('當期課綱查詢結果計1筆'));
});

test('every observed result link opens the injected local detail callback and keeps literal cells',()=>{
  const opened:SyllabusSearchRow[]=[],literal={...row,course_name:'<img src=x onerror=alert(1)>',academicYearText:null};
  const view=render(<SyllabusSearch {...props} result={{scope:'historical',total:1,rows:[literal]}} onOpenDetail={value=>opened.push(value)}/>);
  const results=within(view.getByRole('region',{name:'課綱查詢結果'}));assert.ok(view.getByText('歷史課綱查詢結果計1筆'));
  const buttons=results.getAllByRole('button').filter(button=>button.classList.contains('syllabus-search-detail'));assert.equal(buttons.length,7);for(const button of buttons)fireEvent.click(button);
  assert.deepEqual(opened,Array(7).fill(literal));assert.equal(results.getAllByRole('cell')[3].textContent,'—');assert.equal(results.getAllByRole('cell')[4].textContent,'0');
  assert.equal(view.container.querySelectorAll('a[href],img[onerror]').length,0);assert.equal(literal.academicYearText,null);
});

test('loading prevents duplicate submits and does not display stale results; failure retries without clearing the draft',()=>{
  let searches=0,retries=0;
  const handlers={onSearch:()=>searches++,onRetry:()=>retries++};
  const view=render(<SyllabusSearch {...props} {...handlers}/>);fireEvent.change(view.getByLabelText('關鍵字'),{target:{value:'preserved'}});
  view.rerender(<SyllabusSearch {...props} {...handlers} busy result={{scope:'current',total:1,rows:[row]}}/>);
  fireEvent.submit(view.getByRole('button',{name:'查詢'}).closest('form')!);assert.equal(searches,0);assert.ok(view.getByText('查詢中…'));assert.equal(view.queryByText(row.course_name),null);
  assert.equal((view.getByRole('button',{name:'查詢'}) as HTMLButtonElement).matches(':disabled'),true);
  view.rerender(<SyllabusSearch {...props} {...handlers} error="合成查詢失敗" result={{scope:'current',total:1,rows:[row]}}/>);
  assert.ok(view.getByRole('alert'));assert.equal(view.queryByText(row.course_name),null);fireEvent.click(view.getByRole('button',{name:'重試'}));assert.equal(retries,1);
  assert.equal((view.getByLabelText('關鍵字') as HTMLInputElement).value,'preserved');
});

test('confirmed empty, partial and malformed responses remain distinct',()=>{
  const view=render(<SyllabusSearch {...props} result={{scope:'historical',total:0,rows:[]}}/>);assert.ok(view.getByText('歷史課綱查詢結果計0筆'));assert.equal(view.container.querySelectorAll('.syllabus-search-results tbody tr').length,0);
  view.rerender(<SyllabusSearch {...props} result={{scope:'historical',total:7,rows:[row]}}/>);assert.ok(view.getByText('符合條件共 7 筆，但僅載入 1 筆；結果尚未完整，請縮小查詢條件後重新查詢。'));
  for(const invalid of [{scope:'current' as const,total:0,rows:[row]},{scope:'current' as const,total:2,rows:[row,row]},{scope:'current' as const,total:NaN,rows:[]}]){
    view.rerender(<SyllabusSearch {...props} result={invalid}/>);assert.ok(view.getByRole('alert'));assert.equal(view.queryByText('查無資料'),null);assert.equal(view.queryByText(row.course_name),null);
  }
});

test('source collapse control hides criteria while preserving values and results',()=>{
  const view=render(<SyllabusSearch {...props} result={{scope:'current',total:0,rows:[]}}/>);
  fireEvent.change(view.getByLabelText('關鍵字'),{target:{value:'retain'}});fireEvent.click(view.getByRole('button',{name:'收合查詢條件'}));
  assert.equal(view.getByRole('button',{name:'展開查詢條件'}).getAttribute('aria-expanded'),'false');assert.equal(view.queryByRole('textbox'),null);assert.ok(view.getByText('當期課綱查詢結果計0筆'));
  fireEvent.click(view.getByRole('button',{name:'展開查詢條件'}));assert.equal((view.getByLabelText('關鍵字') as HTMLInputElement).value,'retain');
});

test('sorting toggles only complete results, retains original sequence, and never mutates query rows',()=>{
  const rows=[{...row,id:'first',course_code:'DEMO-20'},{...row,id:'second',course_code:'DEMO-3'}];
  const result={scope:'current' as const,total:2,rows};
  const view=render(<SyllabusSearch {...props} result={result}/>);
  const sequences=()=>[...view.container.querySelectorAll('.syllabus-search-results tbody tr')].map(element=>element.firstElementChild?.textContent);
  fireEvent.click(view.getByRole('button',{name:'課號'}));assert.deepEqual(sequences(),['2','1']);assert.equal(view.getByRole('columnheader',{name:'課號'}).getAttribute('aria-sort'),'ascending');
  fireEvent.click(view.getByRole('button',{name:'課號'}));assert.deepEqual(sequences(),['1','2']);assert.equal(view.getByRole('columnheader',{name:'課號'}).getAttribute('aria-sort'),'descending');
  assert.deepEqual(rows.map(item=>item.id),['first','second']);
  view.rerender(<SyllabusSearch {...props} result={{...result,total:100}}/>);assert.equal((view.getByRole('button',{name:'課號'}) as HTMLButtonElement).disabled,true);assert.equal(view.getByRole('columnheader',{name:'課號'}).getAttribute('aria-sort'),'none');
  assert.ok(view.getByText('符合條件共 100 筆，但僅載入 2 筆；結果尚未完整，請縮小查詢條件後重新查詢。'));
});

test('controlled sorting delegates the whole query and displays only the authoritative returned sort',()=>{
  const calls:SyllabusSearchSort[]=[],rows=[{...row,id:'later',sequence:7},{...row,id:'earlier',course_code:'DEMO-000',sequence:3}];
  const view=render(<SyllabusSearch {...props} result={{scope:'historical',total:2,rows}} onSort={value=>calls.push(value)}/>);
  fireEvent.click(view.getByRole('button',{name:'課號'}));assert.deepEqual(calls,[{key:'course_code',direction:'asc'}]);
  assert.deepEqual([...view.container.querySelectorAll('.syllabus-search-results tbody tr td:first-child')].map(element=>element.textContent),['7','3']);
  assert.equal(view.getByRole('columnheader',{name:'課號'}).getAttribute('aria-sort'),'none');
  view.rerender(<SyllabusSearch {...props} result={{scope:'historical',total:2,rows:[rows[1],rows[0]],sort:{key:'course_code',direction:'asc'}}} onSort={value=>calls.push(value)}/>);
  fireEvent.click(view.getByRole('button',{name:'課號'}));assert.deepEqual(calls[1],{key:'course_code',direction:'desc'});
  assert.equal(view.getByRole('columnheader',{name:'課號'}).getAttribute('aria-sort'),'ascending');
  view.rerender(<SyllabusSearch {...props} result={{scope:'historical',total:500,rows}} onSort={value=>calls.push(value)}/>);
  assert.equal((view.getByRole('button',{name:'課號'}) as HTMLButtonElement).disabled,true);assert.equal(view.container.querySelectorAll('.syllabus-search-detail').length,0);assert.equal(view.queryByText(/歷史課綱查詢結果計/),null);
});
