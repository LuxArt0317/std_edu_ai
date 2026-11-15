/** Pure presentation of the already bounded account:charges source.
 * Authorization, selection and reads belong to the caller. This candidate
 * still requires independent evidence verification before being called verified. */
export const selectedChargeAnswerLimits=Object.freeze({sourceBytes:70000,answerCharacters:8000,resultBytes:24000,viewRows:12});
const path='/school-affairs/services/39-1',sourceId='account:charges';
const budgetReason='The selected record metadata does not fit this answer budget. Narrow the question or open the record; this excerpt cannot establish absence.';
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&[Object.prototype,null].includes(Object.getPrototypeOf(value));
const integer=value=>Number.isSafeInteger(value)&&value>=0;
const bytes=value=>new TextEncoder().encode(JSON.stringify(value)).byteLength;
const text=value=>typeof value==='string'&&!/[\0\ud800-\udfff]/u.test(value);
const keys=(value,required,optional=[])=>object(value)&&required.every(key=>Object.hasOwn(value,key))&&Object.keys(value).every(key=>required.includes(key)||optional.includes(key));
const invalid=()=>{throw new TypeError('Use bounded, caller-scoped account:charges evidence.');};
const sameLabel=(left,right)=>left.normalize('NFKC').trim().toLowerCase()===right.normalize('NFKC').trim().toLowerCase();
const instant=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/u.test(value)&&Number.isFinite(Date.parse(value))
  &&Number(value.slice(0,4))>0&&new Date(value).toISOString().slice(0,19)===value.slice(0,19);

// The reader projects PostgreSQL numeric(12,2) to Number. Recover only exact
// two-decimal values in that range; do not clamp, default or round bad records.
function cents(value){
  if(typeof value!=='number'||!Number.isFinite(value)||value<0||value>9999999999.99)invalid();
  const result=Math.round(value*100);
  if(!Number.isSafeInteger(result)||Number((result/100).toFixed(2))!==value)invalid();
  return result;
}
function validate(source){
  if(!keys(source,['id','content','url'],['title','urls'])||source.id!==sourceId||source.url!==path
    ||!text(source.content)||source.content.length>selectedChargeAnswerLimits.sourceBytes||bytes(source)>selectedChargeAnswerLimits.sourceBytes
    ||source.title!==undefined&&!text(source.title)
    ||source.urls!==undefined&&(!Array.isArray(source.urls)||source.urls.length!==1||source.urls[0]!==path))invalid();
  let p;try{p=JSON.parse(source.content);}catch{invalid();}
  if(keys(p,['collection','records','excerpted','unavailableReason'])&&p.collection==='charges'&&p.excerpted===true
    &&Array.isArray(p.records)&&p.records.length===0&&p.unavailableReason===budgetReason)return {p,state:'budget',rows:[]};
  if(!keys(p,['checkedAt','collection','records','selection','excerpted','counts','rules','availableRows','includedRows'],['studentRecordFound','selectionLabel','unavailableReason'])
    ||p.collection!=='charges'||!instant(p.checkedAt)||!Array.isArray(p.records)||!text(p.rules)
    ||!keys(p.selection,['scope','availableRows','matchingRows'])||p.selection.scope!=='ranked_owned_records'
    ||!Array.isArray(p.counts)||p.counts.length!==1||!keys(p.counts[0],['collection','availableRows','matchingRows','includedRows','partial']))invalid();
  const c=p.counts[0];
  if(c.collection!=='records'||![c.availableRows,c.matchingRows,c.includedRows].every(integer)
    ||c.availableRows<c.matchingRows||c.matchingRows<c.includedRows||c.includedRows!==p.records.length
    ||c.partial!==(c.includedRows<c.matchingRows)||p.excerpted!==c.partial||p.availableRows!==c.availableRows||p.includedRows!==c.includedRows
    ||p.selection.availableRows!==c.availableRows||p.selection.matchingRows!==c.matchingRows
    ||p.studentRecordFound!==undefined&&typeof p.studentRecordFound!=='boolean'
    ||p.selectionLabel!==undefined&&(!text(p.selectionLabel)||!p.selectionLabel.trim())
    ||p.unavailableReason!==undefined&&p.unavailableReason!=='read_failed')invalid();
  if(p.studentRecordFound===false&&(c.availableRows!==0||p.records.length)||p.unavailableReason&&(c.availableRows!==0||p.records.length))invalid();
  const ids=new Set();
  const rows=p.records.map(row=>{
    if(!keys(row,['id','label','amountDue','amountPaid','currency','sourceMode'],['dueOn','occurrenceOn','category','contactUnit','contactExtension','paymentUnit'])
      ||typeof row.id!=='string'||!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/iu.test(row.id)||ids.has(row.id)
      ||!text(row.label)||!row.label.trim()||!text(row.currency)||!row.currency.trim()||row.currency.length>32||/[\p{Cc}]/u.test(row.currency)
      ||!['sample','verified'].includes(row.sourceMode)||p.selectionLabel!==undefined&&!sameLabel(row.label,p.selectionLabel)
      ||['dueOn','occurrenceOn','category','contactUnit','contactExtension','paymentUnit'].some(key=>row[key]!=null&&!text(row[key])))invalid();
    ids.add(row.id);const due=cents(row.amountDue),paid=cents(row.amountPaid);if(paid>due)invalid();
    return {label:row.label,currency:row.currency,sourceMode:row.sourceMode,due,paid,remaining:due-paid};
  });
  return {p,c,rows,state:p.unavailableReason?'failed':p.studentRecordFound===false?'unlinked':'records'};
}
function literal(value){
  // Newlines must not terminate a Markdown code span and activate stored links.
  const valueText=String(value).replace(/[\p{Cc}\p{Zl}\p{Zp}]+/gu,' '),runs=valueText.match(/`+/gu)||[];
  const fence='`'.repeat(Math.max(0,...runs.map(run=>run.length))+1);return fence+' '+valueText+' '+fence;
}
const decimal=value=>(value/100).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2,useGrouping:true});
const money=(value,currency)=>(currency==='TWD'?'NT$':currency+' ')+(value/100).toLocaleString('en-US',{maximumFractionDigits:2,useGrouping:true});

export function formatSelectedChargeEvidence(source,options={}){
  if(!keys(options,[],['language','includeAuthorityLimit','exactBalance','separateCurrency'])
    ||options.language!==undefined&&!['en','zh-TW'].includes(options.language)
    ||options.includeAuthorityLimit!==undefined&&typeof options.includeAuthorityLimit!=='boolean'
    ||options.exactBalance!==undefined&&typeof options.exactBalance!=='boolean'
    ||options.separateCurrency!==undefined&&typeof options.separateCurrency!=='boolean')invalid();
  const {p,c,rows,state}=validate(source),zh=options.language==='zh-TW',t=(en,tw)=>zh?tw:en;
  const title=t('Selected local tuition and fee records','選定的站內學費及費用紀錄');
  const citation={chunkId:sourceId,claim:title,title,sourceName:'stu.best account records',url:path,locator:null,effectiveAt:null,reviewedAt:options.exactBalance?p.checkedAt??null:null};
  const authority=options.includeAuthorityLimit?t('I can show saved fee amounts. Official balances and bank transfers require separate verification.',
    '此處可查看已儲存的費用金額，校方正式餘額與銀行匯款需另行確認。'):'';
  const lead=[],selection=p.selectionLabel;
  if(selection!==undefined&&!rows.length)lead.push(selection.length<=600?t('Selected charge: ','選定費用：')+literal(selection):t('One exact charge label was selected; its long text is omitted from this display.','已選定一個精確費用名稱；名稱過長，未在此顯示。'));
  if(state==='failed')lead.push(t('The selected fee records could not be read, so the balance is unknown. This is not a zero balance or a successful empty result.','無法讀取選定費用，因此餘額未知。這不代表餘額為零，也不是成功讀取後沒有紀錄。'));
  else if(state==='budget')lead.push(t('Charge evidence did not fit the answer budget. Narrow the requested charge or open the record page; amounts and absence cannot be established from this excerpt.','費用證據超出回答容量。請縮小選定費用範圍或開啟紀錄頁；此摘要無法確認金額或沒有紀錄。'));
  else if(state==='unlinked')lead.push(t('No linked local student record was returned for this account, so its fee balance is unknown.','此帳號未回傳已連結的站內學生紀錄，因此費用餘額未知。'));
  else{
    if(!rows.length){
      if(c.matchingRows)lead.push(t('Selected charge rows exist but none fit this evidence excerpt. Their amounts and remaining balances are unknown.','選定費用紀錄存在，但沒有任何完整紀錄能放入此證據摘要。其金額與餘額未知。'));
      else if(p.studentRecordFound===true)lead.push(selection!==undefined?t('The successful local read found no saved charge matching that exact label. This does not mean there are no other charges or no debt.','成功的站內讀取未找到符合該精確名稱的費用紀錄。這不代表沒有其他費用或欠費。'):t('The successful local read returned no saved charge rows. This does not establish no university fees or no debt elsewhere.','成功的站內讀取未回傳費用紀錄。這不能證明校方沒有費用或其他地方沒有欠費。'));
      else lead.push(t('This source contains no charge rows, but successful scoped-read metadata is absent. A balance or absence of saved charges cannot be established.','此來源沒有費用紀錄，但缺少成功範圍讀取的中繼資料，無法確認餘額或沒有已儲存費用。'));
    }
  }
  const shown=[],columns=[t('Charge','費用'),t('Currency','幣別'),t('Saved amount due','已儲存應繳金額'),t('Saved amount paid','已儲存已繳金額'),t('Calculated remaining','計算餘額'),t('Source mode','來源標記')];
  function result(){
    const omitted=rows.length-shown.length,complete=state==='records'&&p.studentRecordFound===true&&!p.excerpted&&c.availableRows===c.matchingRows&&!omitted;
    const rowMode=row=>options.exactBalance?(row.sourceMode==='sample'?t('Sample charge: ','範例費用：'):t('Charge with saved verified label: ','儲存來源標記為 verified 的費用：')):'';
    const lines=shown.map(row=>(shown.length>1?'- ':'')+rowMode(row)+literal(row.label)+(options.separateCurrency
      ?t('\n  Remaining: ','\n  待繳金額：')+literal(decimal(row.remaining))+t('\n  Currency: ','\n  幣別：')+literal(row.currency)
      :t('\n  Remaining balance ','\n  待繳金額：')+literal(money(row.remaining,row.currency)))
      +t('\n  Saved amount due ','\n  已儲存應繳金額：')+literal(money(row.due,row.currency))
      +t('\n  Saved amount paid ','\n  已儲存已繳金額：')+literal(money(row.paid,row.currency)));
    const notes=[];
    const counts=state==='records'?t(`Loaded owned rows: ${c.availableRows}; selected rows: ${c.matchingRows}; included in this evidence: ${c.includedRows}; omitted from evidence: ${c.matchingRows-c.includedRows}.`,
      `已載入本人紀錄：${c.availableRows}；選定紀錄：${c.matchingRows}；證據包含：${c.includedRows}；證據省略：${c.matchingRows-c.includedRows}。`):'';
    if(state==='records'&&p.excerpted)notes.push(counts);
    if(omitted)notes.push(t(`Display excerpt: ${shown.length} of ${rows.length} included rows shown; ${omitted} whole rows omitted from this display.`,`顯示摘要：證據中 ${rows.length} 筆顯示 ${shown.length} 筆；另有 ${omitted} 筆完整紀錄未顯示。`));
    if(state==='records'&&rows.length){
      if(complete&&rows.length>1){
        const sums=new Map();for(const row of rows){const key=JSON.stringify([row.currency,row.sourceMode]),sum=sums.get(key)||{currency:row.currency,sourceMode:row.sourceMode,total:0,count:0};sum.total+=row.remaining;sum.count++;sums.set(key,sum);}
        const combined=[...sums.values()].filter(sum=>options.exactBalance||sum.count>1);
        if(combined.length&&combined.every(sum=>Number.isSafeInteger(sum.total))){
          notes.push(t('Remaining totals for the selected local rows only, grouped by exact saved currency and source mode (no currency conversion):','僅限選定站內紀錄的剩餘金額合計，依儲存幣別及來源標記分列（不換匯）：'));
          for(const {currency,sourceMode,total}of combined)notes.push('- '+literal(currency)+' / '+literal(sourceMode)+': '+literal(options.exactBalance?money(total,currency):decimal(total)));
        }else if(combined.length)notes.push(t('Aggregate amounts exceed safe exact arithmetic; no aggregate balance is stated.','合計金額超出安全精確計算範圍，因此不提供合計餘額。'));
      }else if(!complete)notes.push(t('No complete balance total is stated: read-scope metadata or selected/displayed rows are incomplete. Each remaining value shown applies only to its own charge.','讀取範圍資料或選定／顯示紀錄不完整，因此不提供完整餘額合計。每筆顯示餘額僅適用於該費用。'));
    }
    const scopeNote=t('This answer covers only the selected local charge evidence, not every financial obligation.','此回答僅涵蓋選定站內費用證據，並非所有財務義務。');
    const modes=[...new Set(shown.map(row=>row.sourceMode))];
    const provenance=options.exactBalance?'':[modes.includes('sample')?t('Sample fee records.','範例費用紀錄。'):'',
      modes.includes('verified')?t('“Verified” is a saved source label.','verified 是儲存來源標記。'):''].filter(Boolean).join(' ');
    const scope=options.exactBalance&&shown.length?t('From your saved stu.best fee records:','以下是您在 stu.best 已儲存的費用紀錄：'):'';
    const answer=[...lead,scope,...lines,...notes,provenance,authority,`[${t('Open saved fee records','開啟已儲存費用紀錄')}](${path})`].filter(Boolean).join('\n\n');
    const viewNote=[counts,scopeNote].filter(Boolean).join(' ');
    return {status:'answered',answer,citations:[citation],sourceIds:[sourceId],complete,
      views:state==='records'&&rows.length?[{id:'charges',title,url:path,columns,rows:shown.map(row=>[row.label,row.currency,decimal(row.due),decimal(row.paid),decimal(row.remaining),row.sourceMode]),
        total:rows.length,checkedAt:p.checkedAt,note:viewNote}]:[],
      formatting:{limited:omitted>0,omittedItems:omitted,omittedViewRows:omitted,omittedViews:0}};
  }
  const fits=value=>value.answer.length<=selectedChargeAnswerLimits.answerCharacters&&bytes(value)<=selectedChargeAnswerLimits.resultBytes;
  if(!fits(result()))throw new RangeError('Charge answer metadata exceeds the display budget.');
  for(const row of rows){
    if(shown.length===selectedChargeAnswerLimits.viewRows)break;
    shown.push(row);if(!fits(result()))shown.pop();
  }
  return result();
}
