import {useEffect,useState,type FormEvent} from 'react';
import {loadCertificateCatalog} from '@/services/certificateAwards';
import type {CertificateCatalogRow} from '../../../../server/certificateAwardsContract.js';

const fields=[['code','證照編號'],['name','證照名稱'],['level','證照級數'],['issuer','發照單位']] as const;
const empty={code:'',name:'',level:'',issuer:''};
type Filters=typeof empty;

export function CertificateCatalogForm({userId,select,compact=false}:{userId:string;select?:(row:CertificateCatalogRow)=>void;compact?:boolean}){
  const [draft,setDraft]=useState(empty);
  const [request,setRequest]=useState<{filters:Filters;page:number}>({filters:empty,page:0});
  const [result,setResult]=useState<Awaited<ReturnType<typeof loadCertificateCatalog>>|'error'|null>(null);
  useEffect(()=>{
    const controller=new AbortController();
    void loadCertificateCatalog(userId,controller.signal,{...request.filters,page:String(request.page)}).then(value=>{
      if(!controller.signal.aborted)setResult(value);
    },()=>{if(!controller.signal.aborted)setResult('error');});
    return ()=>controller.abort();
  },[userId,request]);
  function search(filters:Filters,page=0){setResult(null);setRequest({filters,page});}
  function submit(event:FormEvent){event.preventDefault();search(draft);}
  return <section className="certificate-catalog" aria-label="證照名稱查詢">
    <form onSubmit={submit} className="certificate-catalog-form">
      {fields.map(([key,label])=><label key={key}>{label}<input value={draft[key]}
        maxLength={key==='code'?12:160} inputMode={key==='code'?'numeric':undefined} pattern={key==='code'?'[0-9]*':undefined}
        onChange={event=>setDraft(current=>({...current,[key]:event.target.value}))}/></label>)}
      <div className="certificate-buttons">
        <button type="submit" className="certificate-query">查詢</button>
        <button type="button" onClick={()=>{setDraft(empty);search(empty);}}>取消</button>
      </div>
    </form>
    {!compact&&<div className="certificate-notes"><h2>操作說明</h2><p>可使用證照編號、名稱、級數或發照單位查詢。</p></div>}
    {!result&&<p role="status">查詢證照中…</p>}
    {result==='error'&&<p role="alert">證照查詢暫時無法使用。 <button type="button" onClick={()=>search(request.filters,request.page)}>重試</button></p>}
    {result&&result!=='error'&&<>
      <div className="certificate-scroll" role="region" aria-label="證照查詢結果" tabIndex={0}>
        <table className="certificate-table"><thead><tr>{fields.map(([key,label])=><th key={key} scope="col">{label}</th>)}
          {select&&<th scope="col">選擇</th>}</tr></thead>
          <tbody>{result.rows.map(row=><tr key={row.code}><td>{row.code}</td><td>{row.name}</td><td>{row.level}</td><td>{row.issuer}</td>
            {select&&<td><button type="button" onClick={()=>select(row)}>選擇 {row.code}</button></td>}</tr>)}
            {!result.rows.length&&<tr><td colSpan={select?5:4}>查無證照資料。</td></tr>}</tbody></table>
      </div>
      {result.total>30&&<div className="certificate-buttons">
        <button type="button" disabled={request.page===0} onClick={()=>search(request.filters,request.page-1)}>上一頁</button>
        <span>{request.page+1} / {Math.ceil(result.total/30)}</span>
        <button type="button" disabled={(request.page+1)*30>=result.total} onClick={()=>search(request.filters,request.page+1)}>下一頁</button>
      </div>}
    </>}
  </section>;
}
