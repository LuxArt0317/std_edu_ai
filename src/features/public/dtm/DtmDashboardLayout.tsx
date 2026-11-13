import {Fragment,useCallback,useEffect,useRef,useState,type ReactNode} from 'react';
import {dtmDashboardLayoutClient,DtmDashboardLayoutError,type DtmDashboardLayoutAction,type DtmDashboardLayoutBlock,type DtmDashboardLayoutClient,type DtmDashboardLayoutSnapshot} from '@/services/dtmDashboardLayout';
import type {DtmTranslate} from './locale';
import './dtm-dashboard-layout.css';

type BlockId=DtmDashboardLayoutBlock['id'];
export type DtmDashboardConfiguration={title:string;canCancel:boolean;onCancel:()=>void};
type Props={userId:string;t:DtmTranslate;renderBlock:(id:BlockId,controls:ReactNode)=>ReactNode;renderHeader?:(configuration:DtmDashboardConfiguration|null)=>ReactNode;client?:DtmDashboardLayoutClient};
const names={important:['重要消息','Important information'],navigation:['導覽','Navigation'],contacts:['聯絡方式','Contacts']} as const;
const weights={important:-1,navigation:0,contacts:1};
const copy=(blocks:DtmDashboardLayoutBlock[])=>blocks.map(block=>({...block}));
export function DtmDashboardLayout(props:Props){return <LayoutSession key={props.userId} {...props}/>;}

function LayoutSession({userId,t,renderBlock,renderHeader,client=dtmDashboardLayoutClient}:Props){
  const [snapshot,setSnapshot]=useState<DtmDashboardLayoutSnapshot|null>(null);
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[conflict,setConflict]=useState(false);
  const [editing,setEditing]=useState(false),[draft,setDraft]=useState<DtmDashboardLayoutBlock|null>(null);
  const [expanded,setExpanded]=useState(['block-settings']);
  const [pending,setPending]=useState<DtmDashboardLayoutAction|null>(null);
  const lifetime=useRef(new AbortController()),running=useRef(false);
  const customize=useRef<HTMLButtonElement>(null);
  const [focusRequest,setFocusRequest]=useState(0);
  useEffect(()=>{if(focusRequest>0)customize.current?.focus();},[focusRequest]);
  const title=(id:BlockId)=>t(names[id][0],names[id][1]);
  const reload=useCallback(async(clearConflict=false)=>{
    if(running.current)return;const controller=lifetime.current;running.current=true;setBusy(true);setError('');
    try{const result=await client.load(userId,controller.signal);if(controller.signal.aborted)return;
      setSnapshot(result);if(clearConflict){setPending(null);setConflict(false);}
    }catch(reason){if(!controller.signal.aborted){
      if(reason instanceof DtmDashboardLayoutError&&[401,403].includes(reason.status)){setSnapshot(null);setDraft(null);setPending(null);setEditing(false);}
      setError(reason instanceof Error?reason.message:'Dashboard settings could not be loaded.');}}
    finally{if(controller===lifetime.current){running.current=false;if(!controller.signal.aborted)setBusy(false);}}
  },[client,userId]);
  useEffect(()=>{const controller=new AbortController();lifetime.current=controller;running.current=false;void reload();return()=>controller.abort();},[reload]);
  function configure(block:DtmDashboardLayoutBlock){setDraft({...block});setExpanded(['block-settings']);if(!conflict)setError('');}
  async function write(action:DtmDashboardLayoutAction){
    if(running.current)return;const controller=lifetime.current;running.current=true;setPending(action);setBusy(true);setError('');
    try{const result=await client.write(userId,action,controller.signal);if(controller.signal.aborted)return;
      setSnapshot(prior=>prior&&prior.version>result.version?prior:result);setPending(null);setConflict(false);setFocusRequest(value=>value+1);setDraft(null);
    }catch(reason){if(controller.signal.aborted)return;
      if(reason instanceof DtmDashboardLayoutError&&[400,401,403,409].includes(reason.status)){setPending(null);if(reason.status===409)setConflict(true);}
      if(reason instanceof DtmDashboardLayoutError&&[401,403].includes(reason.status)){setSnapshot(null);setDraft(null);setEditing(false);}
      setError(reason instanceof Error?reason.message:t('無法確認儲存結果，請重試。','The save could not be confirmed. Please retry.'));
    }finally{if(controller===lifetime.current){running.current=false;if(!controller.signal.aborted)setBusy(false);}}
  }
  function save(block:DtmDashboardLayoutBlock){if(!snapshot||conflict)return;const blocks=copy(snapshot.blocks).map(row=>row.id===block.id?{...block}:row);
    void write(pending||{kind:'save_dtm_dashboard_layout',payload:{request_id:crypto.randomUUID(),expected_version:snapshot.version,blocks}});
  }
  function reset(){if(snapshot&&!conflict)void write(pending||{kind:'reset_dtm_dashboard_layout',payload:{request_id:crypto.randomUUID(),expected_version:snapshot.version}});}
  function cancel(){if(busy||pending)return;setFocusRequest(value=>value+1);setDraft(null);if(!conflict)setError('');}
  const locked=busy||Boolean(pending);
  const status=<>{error&&<div className="dtm-error" role="alert">{error} <button type="button" disabled={busy} onClick={()=>void reload(conflict)}>{t('重新載入','Reload')}</button>
    {pending&&<button type="button" disabled={busy} onClick={()=>void write(pending)}>{t('重試','Retry')}</button>}</div>}
    {!error&&pending&&!busy&&<div role="status" className="dtm-error">{t('先前的儲存結果尚未確認，請重試同一筆操作。','The previous save is unconfirmed. Retry the same operation.')} <button type="button" onClick={()=>void write(pending)}>{t('重試','Retry')}</button></div>}
    {busy&&<p role="status">{t('載入或儲存儀表板設定中…','Loading or saving dashboard settings…')}</p>}</>;
  const header=renderHeader?.(draft?{title:title(draft.id),canCancel:!locked,onCancel:cancel}:null);
  if(!snapshot)return <>{header}<div className="dtm-dashboard-layout">{status}</div></>;
  if(draft){
    const row=(label:string,value:ReactNode,staticValue=false)=><div className={'dtm-block-field'+(staticValue?' is-static':'')}><span className="dtm-block-label">{label}</span><div className="dtm-block-value">{value}</div></div>;
    const section=(id:string,label:string,children:ReactNode)=><section className="dtm-block-form-section"><h3><button type="button" aria-expanded={expanded.includes(id)} aria-controls={'dtm-block-'+id} onClick={()=>setExpanded(current=>current.includes(id)?current.filter(value=>value!==id):[...current,id])}><span aria-hidden="true">{expanded.includes(id)?'▾':'▸'}</span>{label}</button></h3><div id={'dtm-block-'+id} hidden={!expanded.includes(id)}>{children}</div></section>;
    return <>{header}<div className="dtm-dashboard-config">
      <h2>{t('設定'+title(draft.id)+'區塊','Configure '+title(draft.id)+' block')}</h2>{status}
      <form onSubmit={event=>{event.preventDefault();save(draft);}}>
        <div className="dtm-block-expand"><button type="button" onClick={()=>setExpanded(expanded.length===3?[]:['block-settings','where','page'])}>{expanded.length===3?t('全部縮合','Collapse all'):t('展開全部','Expand all')}</button></div>
        {section('block-settings',t('區塊設定','Block settings'),draft.id==='navigation'?<>
          {row(t('允許用戶停靠此區塊','Allow users to dock this block'),t('是','Yes'),true)}
          {row(t('以連結的方式顯示類別','Display categories as links'),t('否','No'),true)}
          {row(t('剪裁模式','Trim mode'),t('從右邊開始剪裁字元','Trim characters from the right'),true)}
          {row(t('剪裁到只剩幾個字元','Trim length'),<input aria-label={t('剪裁到只剩幾個字元','Trim length')} value="50" readOnly/>)}
          {row(t('針對下列生成導覽','Generate navigation for'),t('分類，課程和課程結構','Categories, courses and course structure'),true)}
        </>:<>
          {row(t('區塊標題','Block title'),<input aria-label={t('區塊標題','Block title')} value={title(draft.id)} readOnly/>)}
          {row(t('額外的CSS類別','Additional CSS classes'),<input aria-label={t('額外的CSS類別','Additional CSS classes')} value="" readOnly/>)}
        </>)}
        {section('where',t('此區塊要顯示在哪裡？','Where this block appears'),<>
          {row(t('原初區塊的位置','Original block location'),t('系統','System'),true)}
          {row(t('要顯示在那一類型的頁面','Display on page types'),t('任意頁面','Any page'),true)}
          {row(t('選擇下層頁面','Select subpages'),t('任何符合上面條件的任何頁面','Any page matching the above'),true)}
          {row(t('預設的區域','Default region'),'Left',true)}{row(t('預設的權重','Default weight'),weights[draft.id],true)}
        </>)}
        {section('page',t('在這一頁面','On this page'),<>
          {row(t('可看見的','Visible'),<select className="dtm-block-visible" aria-label={t('可看見的','Visible')} value={String(draft.visible)} disabled={locked} onChange={event=>setDraft({...draft,visible:event.target.value==='true'})}><option value="true">{t('是','Yes')}</option><option value="false">{t('否','No')}</option></select>)}
          {row(t('區域','Region'),<select className="dtm-block-region" aria-label={t('區域','Region')} value={draft.region} disabled={locked} onChange={event=>setDraft({...draft,region:event.target.value as DtmDashboardLayoutBlock['region']})}><option value="side-pre">Left</option><option value="side-post">Right</option><option value="content">content</option></select>)}
          {row(t('權重','Weight'),<select className="dtm-block-weight" aria-label={t('權重','Weight')} value={draft.weight} disabled={locked} onChange={event=>setDraft({...draft,weight:Number(event.target.value)})}>{Array.from({length:21},(_,index)=>index-10).map(weight=><option key={weight} value={weight}>{weight===-10?t('-10（最先）','-10 (first)'):weight===10?t('10（最後）','10 (last)'):weight}</option>)}</select>)}
        </>)}
        <fieldset className="dtm-block-action-fieldset" aria-label={t('動作','Actions')}><div className="dtm-block-form-actions"><div className="dtm-block-action-buttons"><button type="submit" disabled={busy||conflict}>{t('儲存變更','Save changes')}</button>{' '}<button type="button" disabled={locked} onClick={cancel}>{t('取消','Cancel')}</button></div></div></fieldset>
      </form>
    </div></>;
  }
  const shown=snapshot.blocks.filter(block=>editing||block.visible).map((block,index)=>({block,index})).sort((a,b)=>a.block.weight-b.block.weight||a.index-b.index).map(row=>row.block);
  const controls=(block:DtmDashboardLayoutBlock)=><div className="dtm-dashboard-block-actions"><details onKeyDown={event=>{if(event.key==='Escape'){event.currentTarget.open=false;event.currentTarget.querySelector('summary')?.focus();}}}>
    <summary aria-label={t(title(block.id)+'區塊動作',title(block.id)+' block actions')}><i aria-hidden="true">{'\uf013'}</i><span aria-hidden="true">▾</span></summary>
    <div className="dtm-dashboard-block-menu"><button type="button" disabled={locked} onClick={()=>configure(block)}>{t('設定 '+title(block.id)+' 區塊','Configure '+title(block.id)+' block')}</button>
      {block.id!=='navigation'&&block.visible&&<button type="button" disabled={locked||conflict} onClick={()=>save({...block,visible:false})}>{t('隱藏 '+title(block.id)+' 區塊','Hide '+title(block.id)+' block')}</button>}</div>
  </details></div>;
  const region=(name:DtmDashboardLayoutBlock['region'])=>shown.filter(block=>block.region===name).map(block=><Fragment key={block.id}>{renderBlock(block.id,editing?controls(block):null)}</Fragment>);
  const hasRight=shown.some(block=>block.region==='side-post'),hasLeft=shown.some(block=>block.region==='side-pre');
  return <>{header}<div className="dtm-dashboard-layout">
    <div className="dtm-dashboard-customize">{editing&&<button type="button" disabled={locked||conflict} onClick={reset}>{t('將頁面重設為預設狀態','Reset page to default')}</button>}
      <button ref={customize} type="button" disabled={locked} onClick={()=>setEditing(value=>!value)}>{editing?t('停止自訂此頁','Stop customizing this page'):t('自訂此頁','Customize this page')}</button></div>
    {status}
    <div className={'dtm-columns dtm-columns-course dtm-dashboard-regions'+(hasRight?' has-right':'')+(!hasLeft?' no-left':'')}>
      {hasLeft&&<aside className="dtm-left" aria-label={t('數位教材網導覽','DTM navigation')}>{region('side-pre')}</aside>}
      <section className="dtm-center" aria-label={t('教材網內容','Digital teaching materials content')}>{shown.some(block=>block.region==='content')?region('content'):<span className="dtm-dashboard-empty" aria-hidden="true"/>}</section>
      {hasRight&&<aside className="dtm-dashboard-right" aria-label={t('右側區塊','Right blocks')}>{region('side-post')}</aside>}
    </div>
  </div></>;
}
