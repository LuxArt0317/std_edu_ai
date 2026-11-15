/** Independent, declarative acceptance checks. Never use the runtime verdict as the oracle. */
import {buildGuidanceReviewBinding} from './guidance-rubric.mjs';
const normalize = value => String(value ?? '').normalize('NFKC').replace(/\*\*|__|`/g, '').replace(/\s+/g, ' ').trim().toLocaleLowerCase();
const word = /[\p{L}\p{N}_]/u;

function alternatives(value) {
  return value && typeof value === 'object' && Array.isArray(value.anyOf) ? value.anyOf : [value];
}

function tokenPresent(text, expected) {
  const needle = normalize(expected);
  if (!needle) return false;
  // Numbers may be formatted with thousands separators, but 8 must not match 80.
  if (/^-?\d+(?:,\d{3})*(?:\.\d+)?$/.test(needle)) {
    const wanted = Number(needle.replace(/,/g, ''));
    return numericTokens(text).some(item => item.value === wanted);
  }
  let start = 0;
  while (start <= text.length) {
    const found = text.indexOf(needle, start);
    if (found < 0) return false;
    if (tokenBoundary(text,needle,found)) return true;
    start = found + needle.length;
  }
  return false;
}

function tokenBoundary(text,needle,at) {
  const left=text[at-1],right=text[at+needle.length];
  // ISO dates and clock times are separate semantic tokens even when joined by
  // the ISO T separator. This does not permit arbitrary adjacent identifiers.
  const isoDate=/^\d{4}-\d{2}-\d{2}$/.test(needle);
  const clock=/^\d{2}:\d{2}(?::\d{2})?$/.test(needle);
  const dateBeforeClock=clock && /\b\d{4}-\d{2}-\d{2}t$/.test(text.slice(0,at));
  const clockAfterDate=isoDate && /^t\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:z|[+-]\d{2}:\d{2})?(?![\p{L}\p{N}_])/u.test(text.slice(at+needle.length));
  // Latin identifiers and one-letter grades need token boundaries. CJK phrases
  // are naturally adjacent, so do not require word segmentation for them.
  return !/^[\p{ASCII}]+$/u.test(needle)
    || (!word.test(left||'') || !word.test(needle[0]) || dateBeforeClock)
      && (!word.test(right||'') || !word.test(needle.at(-1)) || clockAfterDate);
}

function matches(text, expected) {
  return alternatives(expected).some(value => typeof value === 'string' || typeof value === 'number' ? tokenPresent(text, value) : false);
}

function literalMatches(text, expected) {
  return alternatives(expected).some(value => {
    if (typeof value !== 'string') return false;
    const needle=normalize(value);
    if(!needle)return false;
    for(let at=text.indexOf(needle);at>=0;at=text.indexOf(needle,at+needle.length)) {
      if(!tokenBoundary(text,needle,at))continue;
      // A stored string is not a numeric quantity: "0", "0.00", "+0"
      // and "0e0" are different values, even though Number() equates them.
      if(/^[+-]?\d+(?:\.\d+)?$/u.test(needle)
        && (/[\d.,+-]$/u.test(text.slice(0,at)) || /^(?:[.,]\d|[%\p{L}\p{N}_])/u.test(text.slice(at+needle.length))))continue;
      return true;
    }
    return false;
  });
}

function numericTokens(text) {
  return [...text.matchAll(/(?<![A-Za-z0-9_])[-+]?\d+(?:,\d{3})*(?:\.\d+)?(?![A-Za-z0-9_])/gu)]
    .map(match => ({value:Number(match[0].replace(/,/g, '')),index:match.index,length:match[0].length}));
}

function negatesValue(window, expected) {
  // A correctly spelled value in "is not 23000" is not an affirmative fact.
  // This narrow rule deliberately avoids interpreting unrestricted prose.
  return alternatives(expected).some(value=>{
    const needle=normalize(value);
    const compact=window.replace(/(?<=\d),(?=\d{3}(?:\D|$))/g,'');
    const escaped=needle.replace(/,/g,'').replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
    if(!escaped)return false;
    return new RegExp(`(?:\\bnot\\b|\\bnever\\b|isn't|isn’t|不是|並非|不為|不等於)\\s*(?:actually\\s+)?(?:nt\\$|twd|\\$)?\\s*${escaped}(?![A-Za-z0-9_])`,'u').test(compact);
  });
}

function visibleMarkdown(text) {
  // Link destinations are navigation, not assertions about a record. They can
  // contain long IDs or forged fact values and must not count as answer facts.
  return String(text).replace(/!?\[([^\]\n]*)\]\(\s*(?:<[^>\n]*>|[^)\n]*)\)/gu,'$1');
}

const fieldContinuation=/^(?:(?:category|module|required(?:\s*\/\s*elective)?|elective|credits?|grade|score|teacher|instructor|type|course date|period|roll-call(?: time)?|remark|notes?|feedback|instructions|status|state|award|required service|actual|accommodation fee|deposit|subsidy|contact unit|extension|payment unit|program|department|year|room|location|paid|remaining|balance|due|indicator|completed|matched|excluded|detail subtotal|report status)\s*(?::|\b\s)|\d+(?:\.\d+)?\s+(?:credits?|hours?)\b|(?:mon|tue|wed|thu|fri|sat|sun)(?:day)?\b|(?:分類|模組|學分|成績|教師|課程日期|節次|點名時間|備註|回饋|說明|狀態|餘額|房間|系所|年級)\s*[:：])/iu;
const foreignSubject=/^(?:(?:another|other|different|unrelated)\s+(?:student|account|course|assignment|record)|(?:student\s+(?!(?:number|id|identifier)\s*[:：])|account\s+)[\p{L}\p{N}_-]+\s*[:：]|(?:另一|其他|別的)(?:學生|帳戶|課程|作業|紀錄))/iu;

function paragraphs(answer) {
  const blocks=[];
  let current='',indent=0;
  const flush=()=>{if(current)blocks.push(current);current='';};
  for(const raw of String(answer).split(/\r?\n/u)) {
    if(!raw.trim()){flush();continue;}
    const depth=raw.match(/^\s*/u)[0].replace(/\t/g,'  ').length;
    const line=visibleMarkdown(raw).trim(),content=line.replace(/^(?:[-*+]\s+|\d+[.)]\s+)/u,'');
    const bullet=/^(?:[-*+]\s+|\d+[.)]\s+)/u.test(line),table=/^\|/u.test(line);
    // Only an explicitly indented continuation belongs to the previous record.
    // A new bullet/table row or another person's record starts a fresh scope.
    if(current && depth>indent && !table && !foreignSubject.test(content)
      && (!bullet || fieldContinuation.test(content))) current+=' '+content;
    else {flush();current=content;indent=depth;}
  }
  flush();
  return blocks.flatMap(block=>{
    const rows=[];let row='';
    for(const part of block.split(/[;；]/u).map(value=>value.trim()).filter(Boolean)) {
      // Semicolons commonly delimit native record fields. An unknown subject or
      // a new named record is still a boundary, never a whole-answer fact window.
      if(row && fieldContinuation.test(part) && !foreignSubject.test(part))row+='; '+part;
      else {if(row)rows.push(row);row=part;}
    }
    if(row)rows.push(row);
    return rows.map(normalize).filter(Boolean);
  });
}

// Opt-in nested fields bind a value to both its record and its column. These
// blocks are deliberately separate from the legacy labelled-fact matcher.
function recordFieldBlocks(answer) {
  const lines=String(answer).split(/\r?\n/u),blocks=[];
  const cells=line=>line.trim().replace(/^\||\|$/gu,'').split('|').map(value=>normalize(visibleMarkdown(value)));
  let current='',indent=0;
  const flush=()=>{if(current)blocks.push({text:normalize(current)});current='';};
  for(let index=0;index<lines.length;index++){
    const raw=lines[index],line=visibleMarkdown(raw).trim();
    if(!line){flush();continue;}
    if(line.includes('|')&&index+1<lines.length){
      const headers=cells(line),divider=cells(lines[index+1]);
      if(headers.length>1&&headers.length<=24&&divider.length===headers.length&&divider.every(value=>/^:?-{3,}:?$/u.test(value))){
        flush();index++;
        const unique=new Set(headers).size===headers.length&&headers.every(Boolean);
        while(index+1<lines.length&&lines[index+1].includes('|')){
          const values=cells(lines[++index]);
          if(unique&&values.length===headers.length&&values.join(' ').length<=4096)
            blocks.push({text:values.join(' | '),headers,cells:values});
        }
        continue;
      }
    }
    const depth=raw.match(/^\s*/u)[0].replace(/\t/gu,'  ').length;
    const content=line.replace(/^(?:[-*+]\s+|\d+[.)]\s+|#{1,6}\s+)/u,'');
    if(current&&depth>indent&&!foreignSubject.test(content)&&!line.startsWith('|'))current+='; '+content;
    else{flush();current=content;indent=depth;}
  }
  flush();return blocks.filter(block=>block.text.length<=4096);
}

function labelOccurrences(text,labels) {
  const found=[];
  for(const raw of labels){const label=normalize(raw);if(!label)continue;
    for(let at=text.indexOf(label);at>=0;at=text.indexOf(label,at+label.length))
      if(tokenBoundary(text,label,at))found.push({at,end:at+label.length,label});
  }
  found.sort((a,b)=>a.at-b.at||b.end-a.end);
  return found.filter((item,index)=>!found.slice(0,index).some(prior=>prior.at<=item.at&&prior.end>=item.end));
}

function recordFieldResult(answer,fact,allFacts) {
  const fields=fact.fields,validValue=value=>typeof value==='string'&&value.trim().length>0||typeof value==='number'&&Number.isFinite(value)
    ||value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).length===1&&Array.isArray(value.anyOf)&&value.anyOf.length>0&&value.anyOf.every(item=>typeof item==='string'&&item.trim().length>0||typeof item==='number'&&Number.isFinite(item));
  if(!Array.isArray(fields)||!fields.length||fields.length>16||fields.some(field=>!field||typeof field!=='object'||Array.isArray(field)
    ||typeof field.label!=='string'||!field.label.trim()||field.labels!==undefined&&(!Array.isArray(field.labels)||field.labels.some(label=>typeof label!=='string'||!label.trim()))
    ||!['text','number','date'].includes(field.kind)||!Array.isArray(field.values)||field.values.length!==1||!field.values.every(validValue)
    ||field.forbiddenValues!==undefined&&(!Array.isArray(field.forbiddenValues)||!field.forbiddenValues.every(validValue))
    ||field.allowedNumbers!==undefined&&(!Array.isArray(field.allowedNumbers)||field.allowedNumbers.some(value=>typeof value!=='number'||!Number.isFinite(value)))
    ||field.exclusive!==undefined&&typeof field.exclusive!=='boolean'||field.match!==undefined&&field.match!=='literal'
    ||field.currencyNotRecorded!==undefined&&(typeof field.currencyNotRecorded!=='boolean'||field.kind!=='text'||field.match!=='literal')))
    return {passed:false,detail:'Malformed record-scoped field expectation.'};
  const aliases=[fact.label,...(fact.labels||[])].map(normalize);
  const recordLabels=[...new Set(allFacts.filter(item=>item?.fields!==undefined).flatMap(item=>[item.label,...(item.labels||[])]).filter(value=>typeof value==='string').map(normalize))];
  const ownerHeaders=new Set(['account','owner','student','record owner','account owner','student account','帳戶','帳號','學生','所有者','紀錄所有者']);
  const contexts=[];
  for(const block of recordFieldBlocks(answer)){
    const markers=labelOccurrences(block.text,recordLabels);
    for(let index=0;index<markers.length;index++){
      const marker=markers[index];if(!aliases.includes(marker.label))continue;
      // A row with two record identities cannot donate another row's cells.
      if(block.headers){
        const otherOwner=block.headers.some((header,position)=>ownerHeaders.has(header)&&foreignSubject.test(block.cells[position].trim()));
        if(markers.length===1&&!otherOwner)contexts.push(block);continue;
      }
      const candidate=block.text.slice(index===0?0:marker.at,markers[index+1]?.at??block.text.length);
      const own=[];
      for(const clause of candidate.split(/(?<=[;；。])|(?<=\.)(?!\d)/u)){
        // The record label identifies a period, not its owner. A foreign
        // possessive immediately after that label must not donate its fields.
        // A separate privacy disclaimer is not a foreign record assertion.
        const afterRecord=labelOccurrences(clause,recordLabels).map(item=>clause.slice(item.end).replace(/^\s*[:：—–-]?\s*/u,''));
        if(foreignSubject.test(clause.trim())||afterRecord.some(text=>foreignSubject.test(text)))break;
        own.push(clause);
      }
      const text=own.join('');if(text)contexts.push({text});
    }
  }
  if(!contexts.length)return {passed:false,detail:'No unambiguous record block is available for its fields.'};
  const recordMatches=fact.match==='literal'?literalMatches:matches;
  if(!fact.values.every(value=>contexts.some(context=>recordMatches(context.text,value))
    ||fields.some(field=>field.values.some(expected=>JSON.stringify(expected)===JSON.stringify(value)))))
    return {passed:false,detail:'The matched record is missing an independently expected value.'};
  if((fact.forbiddenValues||[]).some(value=>contexts.some(context=>matches(context.text,value))))
    return {passed:false,detail:'A contradictory value appears in the independently matched record.'};
  for(const field of fields){
    const labels=[field.label,...(field.labels||[])].map(normalize),claims=[];
    for(const context of contexts){
      if(context.headers){
        context.headers.forEach((header,index)=>{if(labels.includes(header))claims.push(context.cells[index]);});
        continue;
      }
      let previousEnd=-1;
      for(const occurrence of labelOccurrences(context.text,labels)){
        if(previousEnd>=0&&!/[;；|。\n!?.,]|\b(?:and|but|while|whereas)\b/u.test(context.text.slice(previousEnd,occurrence.at)))continue;
        previousEnd=occurrence.end;
        const prefix=context.text.slice(0,occurrence.at);
        let tail=context.text.slice(occurrence.end);
        // Stop before a separate labelled field or sentence. Decimal points
        // and thousands separators remain part of the same literal number.
        const boundary=tail.search(/[;；|\n。!?]|[.,](?!\d)|\b(?:and|but|while|whereas)\s+[\p{L}][\p{L} -]{0,45}(?::|=|\bis\b|\bare\b|\bwas\b|\bwere\b)/u);
        if(boundary>=0)tail=tail.slice(0,boundary);
        tail=tail.replace(/^\s*(?:[:：=]|\b(?:is|are|was|were|equals?|of|at)\b|為|是|為了)\s*/u,'').trim();
        // Natural "zero tax" is still an explicit field claim. Unlabelled
        // numbers elsewhere in the record never satisfy the field.
        if(!tail&&/\bzero\s*$/u.test(prefix))tail=/\bnot\s+zero\s*$/u.test(prefix)?'not zero':'zero';
        if(tail)claims.push(tail.slice(0,240));
      }
    }
    if(!claims.length)return {passed:false,detail:'A required field label is missing from its matched record.'};
    if(field.currencyNotRecorded){
      // A literal amount without currency cannot acquire a currency from the
      // reader or another record. Check only this record's amount/currency
      // assertions; a separately named tuition charge may legitimately be TWD.
      const currency=/\b(?:usd|twd|ntd|rmb|cny|eur|gbp|jpy|hkd|sgd|aud|cad|php|dollars?|euros?|pesos?|yen)\b|(?:nt|us|hk|sg|au|ca)\$|[$€£¥]|新[臺台]幣|美金|美元|人民幣|日圓|港幣|元/iu;
      const currencyLabels=['currency','currency code','幣別','币别','貨幣','货币'];
      const currencyClaims=contexts.flatMap(context=>context.headers
        ?context.headers.flatMap((header,index)=>currencyLabels.includes(header)?[context.cells[index]]:[])
        :labelOccurrences(context.text,currencyLabels).map(occurrence=>context.text.slice(occurrence.end).split(/[;；|\n。!?]|[.,](?!\d)/u)[0]));
      if([...claims,...currencyClaims].some(claim=>currency.test(claim)))return {passed:false,detail:'A currency was added to a literal amount whose source has no recorded currency.'};
    }
    const expected=field.values.flatMap(alternatives),allowed=(field.allowedNumbers||[]).map(Number);
    const accepts=claim=>{
      const start=field.kind==='number'?claim.replace(/^(?:nt\$|twd|\$)\s*/u,''):claim;
      if(field.kind==='number'){
        const first=/^(?:zero\b|零|[-+]?\d+(?:,\d{3})*(?:\.\d+)?)(?![\p{L}\p{N}_])/u.exec(start);
        if(!first)return false;
        const number=/^(?:zero|零)$/u.test(first[0])?0:Number(first[0].replace(/,/gu,''));
        if(!expected.some(value=>typeof value==='number'&&value===number))return false;
        if(field.exclusive!==false&&numericTokens(claim).some(item=>![...expected,...allowed].includes(item.value)))return false;
      }else{
        const match=field.match==='literal'?literalMatches:matches;
        if(!field.values.every(value=>alternatives(value).some(item=>{
          const wanted=normalize(item);return start.startsWith(wanted)&&tokenBoundary(start,wanted,0)&&match(start,item);
        })))return false;
      }
      return !field.values.some(value=>negatesValue(claim,value))&&!(field.forbiddenValues||[]).some(value=>matches(claim,value));
    };
    if(!claims.every(accepts))return {passed:false,detail:'A record field is missing its literal value or contains a contradictory field assertion.'};
  }
  return {passed:true,detail:'Independent record, field and literal value matched.'};
}

function factResult(answer, fact, allFacts=[]) {
  if (!fact || typeof fact !== 'object' || !Array.isArray(fact.values) || !fact.values.length || !['text','number','date'].includes(fact.kind))
    return {passed:false,detail:'Malformed independent fact expectation.'};
  const labels = [fact.label,...(fact.labels || [])].filter(value => typeof value === 'string' && value.trim());
  if (!labels.length) return {passed:false,detail:'A fact needs a semantic label or record identifier.'};
  if(fact.fields!==undefined)return recordFieldResult(answer,fact,allFacts.length?allFacts:[fact]);
  const windows = [];
  const maxWindow = Math.max(20,Math.min(1000,Number(fact.maxWindow) || 240));
  for (const paragraph of paragraphs(answer)) {
    for (const rawLabel of labels) {
      const label = normalize(rawLabel);
      let offset = 0;
      while (offset < paragraph.length) {
        const at = paragraph.indexOf(label,offset);
        if (at < 0) break;
        if(tokenBoundary(paragraph,label,at))windows.push(paragraph.slice(Math.max(0,at-maxWindow),Math.min(paragraph.length,at+label.length+maxWindow)));
        offset = at + label.length;
      }
    }
  }
  if (!windows.length) return {passed:false,detail:'Expected fact label is absent.'};
  if(fact.match!==undefined && fact.match!=='literal')return {passed:false,detail:'Unknown fact matching mode.'};
  const valueMatches=fact.match==='literal'?literalMatches:matches;
  if (!windows.some(window => fact.values.every(value => valueMatches(window,value))))
    return {passed:false,detail:'Expected values are missing or not attached to their semantic label.'};
  if (fact.values.some(value=>windows.some(window=>negatesValue(window,value))))
    return {passed:false,detail:'The response negates an independently expected fact.'};
  if ((fact.forbiddenValues || []).some(value => windows.some(window => matches(window,value))))
    return {passed:false,detail:'A contradictory value appears beside the expected fact.'};
  if (fact.unit && !windows.some(window => alternatives(fact.unit).some(unit => tokenPresent(window,unit))))
    return {passed:false,detail:'Expected quantity unit is absent.'};
  if (fact.kind === 'number' && fact.exclusive === true) {
    const allowed = fact.values.flatMap(alternatives).map(value=>Number(String(value).replace(/,/g,'')));
    const extra = (fact.allowedNumbers || []).map(Number);
    if (windows.some(window => numericTokens(window).some(item => ![...allowed,...extra].includes(item.value))))
      return {passed:false,detail:'An extra numeric value contradicts this exclusive fact expectation.'};
  }
  return {passed:true,detail:'Independent labelled fact matched.'};
}

// Explicit privacy/capability denials are limitations, not empty database reads.
// Keep these bounded to the denied target; generic disclaimers do not qualify.
const otherAccountDenial=/\b(?:cannot|can['’]t|could not|unable to|will not|won['’]t)\s+(?:show|display|disclose)\b[^.!?\n]{0,160}\b(?:another|other|different)\s+(?:student(?:['’]s)?(?:\s+account)?|account)\b/iu;
function ownAccountOnlyDenial(answer) {
  const ownOnly=/\b(?:i|we)\s+can\s+only\s+(?:access|read|query)\s+(?:the\s+)?(?:authenticated|signed[- ]in|current)\s+(?:student\s+)?account(?:['’]s)?\s+(?:saved\s+)?records\b/iu;
  const foreignUnavailable=/\bno\s+(?:other|another|different)\s+(?:student\s+)?account(?:['’]s)?\b[^.!?\n]{0,180}\b(?:is|are)\s+available\b/iu;
  const foreignContrast=/\bnot\s+(?:another|other|different)\s+(?:student(?:['’]s)?(?:\s+account(?:['’]s)?)?|account(?:['’]s)?)\s+(?:(?:enrollment[- ]certificate|tuition|settlement|saved|personal)\s+){0,5}(?:records?|statements?|assessments?|student\s+number)\b/iu;
  const contradictory=/\b(?:i|we)\s+can\s+(?:also\s+)?(?:access|read|query|show|display)\b[^.!?\n]{0,90}\b(?:other|another|different)\s+(?:students?(?:['’]s?)?(?:\s+accounts?)?|accounts?)(?:['’]s?)?\b/iu;
  return !contradictory.test(answer)&&(ownOnly.test(answer)&&foreignUnavailable.test(answer)
    ||String(answer).split(/[.!?\n]/u).some(clause=>ownOnly.test(clause)&&foreignContrast.test(clause)));
}

const unavailableFileCapability=/\bno\s+(?:verified\s+)?(?:local\s+)?(?:file|document|download)\s+capability\b/iu;
const missingDtmReportField=/\b(?:no\s+(?:(?:saved|native|moodle|dtm)\s+){0,4}grade report|no\s+(?:course[- ]total(?: object)? is saved|saved course total)|course total is (?:not recorded|missing))\b/iu;
// The remote enrollment reader has an independent, narrowly named collection.
// Recognize its affirmative empty result without relying on a separate official
// enrollment disclaimer, or treating a question/negated quotation as absence.
const missingElearningEnrollments=/(?:^|[.!]\s+|\n)\s*(?:there are )?no saved remote-learning moodle enrollments(?: for this account)?(?:\.|$)/iu;
const limitedFacilityRepair=/(?:^|[.!]\s+|\n)\s*(?:(?:there are )?no (?:saved|local) (?:facility )?repair (?:records|reports)(?: (?:for this account|match(?:ing)? this query|are saved))?|physical repair completion\s*:\s*unverified)(?:\.|$)/iu;

// Optional independent card consistency. Cards cannot supply missing prose
// facts; each displayed field is checked separately under its exact record ID.
function visibleRecordFactsResult(views,facts) {
  const valueValid=value=>typeof value==='string'&&value.trim().length>0||typeof value==='number'&&Number.isFinite(value)
    ||value&&typeof value==='object'&&Array.isArray(value.anyOf)&&value.anyOf.length>0&&value.anyOf.every(item=>typeof item==='string'&&item.trim().length>0||typeof item==='number'&&Number.isFinite(item));
  if(!Array.isArray(facts)||!facts.length||facts.length>24||facts.some(fact=>!fact||typeof fact.record!=='string'||!fact.record.trim()
    ||!Array.isArray(fact.recordHeaders)||!fact.recordHeaders.length||fact.recordHeaders.some(value=>typeof value!=='string'||!value.trim())
    ||!Array.isArray(fact.fields)||!fact.fields.length||fact.fields.length>16||fact.fields.some(field=>!field||typeof field.label!=='string'||!field.label.trim()
      ||!['text','number','date'].includes(field.kind)||!Array.isArray(field.values)||field.values.length!==1||!field.values.every(valueValid)
      ||field.labels!==undefined&&(!Array.isArray(field.labels)||field.labels.some(value=>typeof value!=='string'||!value.trim()))
      ||field.match!==undefined&&field.match!=='literal'||field.exclusive!==undefined&&typeof field.exclusive!=='boolean'))
    ||new Set(facts.map(fact=>normalize(fact.record))).size!==facts.length)return {passed:false,detail:'Malformed independent visible-record contract.'};
  if(views===undefined)return {passed:true,detail:'No cards supplied; required prose facts are checked independently.'};
  if(!Array.isArray(views)||views.length>24)return {passed:false,detail:'Malformed visible card collection.'};
  const identityHeaders=new Set(facts.flatMap(fact=>fact.recordHeaders.map(normalize)));
  for(const view of views){
    if(!view||!Array.isArray(view.columns)||!view.columns.length||view.columns.length>24
      ||view.columns.some(value=>typeof value!=='string'||!value.trim()||value.length>200)
      ||new Set(view.columns.map(normalize)).size!==view.columns.length
      ||!Array.isArray(view.rows)||view.rows.length>200)return {passed:false,detail:'Visible card headers or rows are ambiguous.'};
    const headers=view.columns.map(normalize),identityColumns=headers.flatMap((header,index)=>identityHeaders.has(header)?[index]:[]);
    if(identityColumns.length>1)return {passed:false,detail:'A visible row has ambiguous record identity columns.'};
    for(const row of view.rows){
      if(!Array.isArray(row)||row.length!==headers.length||row.some(value=>value!==null&&!['string','number','boolean'].includes(typeof value)
        ||typeof value==='number'&&!Number.isFinite(value)||typeof value==='string'&&value.length>8000))return {passed:false,detail:'A visible row does not match its headers.'};
      const matching=facts.filter(fact=>identityColumns.length
        ?normalize(row[identityColumns[0]])===normalize(fact.record)
        :row.some(value=>normalize(value)===normalize(fact.record)));
      if(identityColumns.length&&matching.length!==1)return {passed:false,detail:'A displayed receipt has no unique independently expected identity.'};
      for(const fact of matching)for(const field of fact.fields){
        const labels=[field.label,...(field.labels||[])].map(normalize);
        for(let index=0;index<headers.length;index++)if(labels.includes(headers[index])){
          const value=row[index]===null?'null':String(row[index]);
          const result=factResult(field.label+': '+value,{...field,exclusive:field.exclusive??true});
          if(!result.passed)return {passed:false,detail:'A displayed field contradicts its independently bound receipt record.'};
        }
      }
    }
  }
  return {passed:true,detail:'Supplied card fields agree with independently bound record identities.'};
}
function visibleBoundaryText(body) {
  const text=[body.answer||''];
  for(const view of Array.isArray(body.views)?body.views:[]){
    for(const name of ['title','summary','note'])if(typeof view?.[name]==='string')text.push(view[name]);
    for(const row of Array.isArray(view?.rows)?view.rows:[])if(Array.isArray(row))text.push(row.map((cell,index)=>
      (typeof view?.columns?.[index]==='string'?view.columns[index]+': ':'')+String(cell??'null')).join(', '));
  }
  return text.join('\n');
}

// Opt-in record boundaries are separate from stored facts. A correct literal
// beside an unsupported conclusion must not pass. Evaluate short clauses so a
// caveat in one sentence cannot cancel an affirmative claim in another.
function evidenceBoundaryResult(answer,kind) {
  const clauses=visibleMarkdown(answer).normalize('NFKC').toLowerCase()
    .split(/[.!?;；。！？\n]|\b(?:but|however|yet|and)\b/u).map(value=>value.trim()).filter(Boolean);
  const negative=/\b(?:not(?!\s+only\b)|never|no|cannot|can't|could not|unable to|doesn't|does not|don't|do not|isn't|is not|isn’t|can’t)\b|不(?:是|能|可|代表)|無法|並非/u;
  const isNegative=value=>negative.test(value.replace(/\bnot\s+only\b/gu,'only'));
  const qualifyingPrefix=/\b(?:not(?!\s+only\b)|no|never)\s+(?:an?\s+)?$|\b(?:cannot|can't|could not|unable to|does not|doesn't|do not|don't)\s+(?:confirm|verify|infer|say|claim|establish|prove|treat|consider)(?:\s+(?:that|it|this|as|a|an|the)){0,4}\s*$/u;
  const affirmative=(clause,expression)=>[...clause.matchAll(expression)].some(match=>{
    const prefix=clause.slice(Math.max(0,match.index-55),match.index);
    return !isNegative(match[0]) && !qualifyingPrefix.test(prefix);
  });
  if(kind==='leave_local_metadata_only') {
    const official=/\b(?:leave\s+(?:record\s+|request\s+|form\s+)?(?:is|was|has been)\s+(?:officially\s+)?(?:approved|accepted|rejected|filed with the university)|(?:university|school|registrar|advisor|teacher)\s+(?:has\s+)?(?:approved|accepted|rejected)\s+(?:your|this|the)\s+leave|(?:your\s+)?(?:absence|attendance)\s+(?:is|was|has been)\s+(?:officially\s+)?(?:marked\s+)?(?:excused|cleared|corrected)|(?:official\s+)?(?:university|school)\s+approval(?:\s+status)?\s*[:：]\s*(?:approved|confirmed|verified))\b|(?:校方|學校|学校|導師|导师)已(?:核准|批准|駁回|驳回)|缺席已(?:更正|核銷|核销)/gu;
    const qualifier=/\b(?:cannot|can't|can’t|could not|unable to|does not|doesn’t)\s+(?:establish|confirm|verify|infer|prove|show)(?:\s+(?:that|whether|if|your|the|this)){0,4}\s*$|(?:無法|无法|不能|尚未)(?:確認|确认|證明|证明|查證|查证)(?:是否|您的)?$/u;
    const asserted=clauses.some(clause=>[...clause.matchAll(official)].some(match=>!qualifier.test(clause.slice(0,match.index))));
    return {passed:!asserted,detail:'Saved metadata never establishes university approval, official filing or attendance correction.'};
  }
  if(kind==='dtm_assignment_tracker_metadata_only'){
    const unsupported=/\b(?:file\s+submission|upload|committed\s+file|submission\s+receipt)\s+(?:is|was|has been)\s+(?:verified|confirmed|received|completed)|\b(?:university|moodle)\s+(?:has\s+)?(?:confirmed|received)\s+(?:your|the)\s+(?:submission|file)|\b(?:course|official|final)\s+grade\s+(?:is|was|equals)\s+[-+]?\d|校方已(?:收件|收到|確認繳交)|(?:正式|期末)成績(?:為|是)\s*\d/gu;
    const asserted=clauses.some(clause=>affirmative(clause,unsupported));
    return {passed:!asserted,detail:'Local assignment tracker status cannot prove a committed file, institutional submission or grade report.'};
  }
  if(kind==='dtm_assignment_list_read_not_empty'){
    const absence=/\b(?:no|zero|0)\s+(?:(?:matching|saved|local|moodle)\s+){0,4}assignments?\b|\bassignment(?:s| list)\s+(?:is|are)\s+empty\b|沒有.{0,14}(?:已儲存)?作業|查無已儲存.{0,10}作業/gu;
    const asserted=clauses.some(clause=>[...clause.matchAll(absence)].some(match=>
      !/\b(?:could not|cannot|can't|unable to)\s+(?:verify|confirm|establish|infer)(?:\s+(?:that|whether|there|are|is)){0,5}\s*$|無法確認(?:是否)?$/u.test(clause.slice(0,match.index))));
    return {passed:!asserted,detail:'A failed assignment list request does not establish a matching empty list.'};
  }
  if(kind==='internship_local_tracking_only'){
    const official=/\b(?:your\s+)?(?:internship\s+)?(?:contract|application|placement)\s+(?:is|was|has been)\s+(?:officially\s+)?(?:approved|accepted|signed|submitted to the university)|\b(?:university|school)\s+(?:has\s+)?(?:received|approved|signed|confirmed)\s+(?:your|the|this)\s+(?:internship\s+)?(?:contract|application|placement)|\b(?:company|employer|enterprise)\s+(?:is|was|has been)\s+(?:officially\s+)?(?:approved|accredited|enrolled|registered)|(?:校方|學校|学校)已(?:收件|核准|簽約|签约)|(?:企業|企业)已(?:登錄|登录|認證|认证)/gu;
    const qualified=/\b(?:cannot|can't|could not|unable to|does not|doesn't)\s+(?:verify|confirm|prove|show|establish)(?:\s+(?:that|whether|if|your|this|the)){0,4}\s*$|(?:不代表|無法確認|无法确认|不能確認|不能确认)(?:是否)?$/u;
    const asserted=clauses.some(clause=>[...clause.matchAll(official)].some(match=>!qualified.test(clause.slice(0,match.index))));
    return {passed:!asserted,detail:'Local internship tracking does not establish school submission, approval, placement or enterprise registration.'};
  }
  if(kind==='internship_failed_read_not_empty'){
    const absence=/\b(?:no|zero|0)\s+(?:(?:matching|saved|local|internship)\s+){0,4}(?:records?|contracts?|rows?|companies)|\b(?:records?|contracts?|company directory)\s+(?:is|are)\s+empty\b|查無已儲存|沒有.{0,12}(?:實習紀錄|實習合約|企業紀錄)/gu;
    const qualified=/\b(?:cannot|can't|could not|unable to)\s+(?:verify|confirm|infer|conclude|establish|determine)(?:\s+(?:that|whether|if|there|are|is)){0,5}\s*$|(?:無法|无法|不能)(?:確認|确认|推斷|推断)(?:是否)?$/u;
    const asserted=clauses.some(clause=>[...clause.matchAll(absence)].some(match=>!qualified.test(clause.slice(0,match.index))));
    return {passed:!asserted,detail:'Failed internship reads do not establish that the selected saved records are absent.'};
  }
  if(kind==='leave_read_failure_not_empty'){
    const absence=/\b(?:no|zero|0)\s+(?:(?:saved|matching|local|student)\s+){0,4}(?:leave (?:records?|forms?|rows?|requests?)|leave history)|(?:leave history|leave records?)\s+(?:is|are)\s+empty\b|沒有(?:已儲存的|符合條件的)?(?:請假紀錄|假單)|沒有(?:已保存的|符合条件的)?(?:请假记录|假单)/gu;
    const qualifier=/\b(?:cannot|can't|can’t|could not|unable to)\s+(?:infer|conclude|establish|determine|know|confirm|verify)(?:\s+(?:that|whether|if|there|are|is)){0,5}\s*$/u;
    const asserted=clauses.some(clause=>[...clause.matchAll(absence)].some(match=>!qualifier.test(clause.slice(0,match.index))));
    return {passed:!asserted,detail:'A failed leave lookup preserves unknown record existence.'};
  }
  if(kind==='housing_receipt_no_official_approval'||kind==='housing_receipt_record_not_absent') {
    const qualifier=/\b(?:cannot|can't|can’t|could not|unable to)\s+(?:infer|conclude|establish|determine|say|claim|know|confirm|verify)(?:\s+(?:that|whether|if|there|are|is|it|was)){0,5}\s*$|\b(?:does not|doesn't|do not|don't)\s+(?:mean|prove|establish|imply)(?:\s+(?:that|whether|if|there|are|is)){0,4}\s*$|\bnot\s+(?:proof|evidence|true)\s+that\s*$/u;
    const approval=/\b(?:(?:(?:your|my|the|this|saved)\s+)?(?:(?:housing|dormitory|accommodation)\s+)?applications?(?:\s+receipt)?\b[^,]{0,70}\b(?:approved|accepted)|(?:this|your|the|saved)\s+receipt\b[^,]{0,45}\b(?:confirms?|proves?|establishes?)\b[^,]{0,30}\b(?:official |university )?approval|(?:official |university )?approval(?:\s+status)?\s*[:：]\s*(?:approved|confirmed|verified|complete))\b/gu;
    const absence=/\b(?:(?:there\s+(?:are|is)|you\s+have|your\s+account\s+has)\s+(?:no|zero|0)\s+(?:(?:saved|local|matching|housing|dormitory|accommodation|application)\s+){0,5}(?:applications?|receipts?|records?)|no\s+(?:(?:saved|local|matching|university)\s+){0,3}(?:housing|dormitory|accommodation)\s+(?:applications?|receipts?)|(?:your\s+)?(?:housing|dormitory|accommodation)\s+application(?:\s+(?:list|collection|records))?\s+(?:is|are)\s+(?:empty|absent))\b/gu;
    const expression=kind==='housing_receipt_no_official_approval'?approval:absence;
    const contradiction=clauses.some(clause=>[...clause.matchAll(expression)].some(match=>{
      const prefix=clause.slice(Math.max(0,match.index-120),match.index);
      // In "no applications", no is the disputed absence claim, not its
      // negation. Only a directly attached non-inference qualifier protects it.
      return !qualifier.test(prefix)&&(kind==='housing_receipt_record_not_absent'||!isNegative(match[0]));
    }));
    return {passed:!contradiction,detail:kind==='housing_receipt_no_official_approval'
      ?'Receipt metadata does not become an affirmative official approval claim.'
      :'A positively saved housing application cannot be contradicted by an empty-account claim.'};
  }
  if(kind==='literal_text_not_payment') {
    const payment=/\b(?:payment\b[^,]{0,64}\b(?:confirmed|verified|complete|completed|made|successful|received|settled)|(?:confirmed|verified|complete|completed|successful)\s+payment|(?:you|fees|tuition|balance)\b[^,]{0,48}\b(?:fully paid|paid in full|all paid|paid|settled)|(?:confirms?|proves?|establish(?:es)?)\b[^,]{0,40}\bpayment)\b/gu;
    const caveat=clauses.some(clause=>/\bpayment\b/u.test(clause)
      && (isNegative(clause) && /\b(?:confirmed|confirm|verified|verify|prove|proves|proof|evidence|establish|means?|indicate|indicates)\b/u.test(clause)
        || /\bpayment\b[^,]{0,48}\b(?:unconfirmed|unverified)\b/u.test(clause)));
    return {passed:caveat&&!clauses.some(clause=>affirmative(clause,payment)),detail:'Literal saved text is explicitly distinguished from confirmed payment, without a contradictory payment claim.'};
  }
  if(kind==='failed_read_not_empty'||kind==='health_failed_read_not_empty') {
    const readSubject=clause=>/\b(?:read|retrieve|retrieval|access|backend|source|service|query|lookup|extended[- ]study)\b/u.test(clause)
      ||kind==='health_failed_read_not_empty'&&/\bhealth[- ]examination metadata\b/u.test(clause);
    const readFailure=clauses.some(clause=>readSubject(clause)
      && /\b(?:unavailable|unsupported|unimplemented|failed|failure|cannot|can't|could not|unable|not (?:available|implemented|configured|connected|supported))\b/u.test(clause));
    const absence=/\b(?:no\s+(?:(?:saved|matching|own|local|extended[- ]study|tuition|payment|fee)\s+){0,7}(?:records?|payments?|fees|entries)|(?:records?|payments?|fees|entries)\s+(?:(?:are|were|is|have been|have|been|currently|all|saved|recorded)\s+){0,4}(?:absent|empty|zero|0)|(?:you|there)\s+(?:have|has|are)\s+no\s+(?:records?|fees|payments?))\b/gu;
    // "No records" is itself the disputed positive absence claim. Only a
    // directly preceding inability to INFER absence may qualify it. A failed
    // backend's "not available" cannot negate a subsequent "no records".
    const absenceQualifier=/\b(?:cannot|can't|can’t|could not|unable to)\s+(?:infer|conclude|establish|determine|say|claim|know|confirm)(?:\s+(?:that|whether|if|there|are|is)){0,4}\s*$|\b(?:does not|doesn't|do not|don't)\s+(?:mean|prove|establish|imply)(?:\s+(?:that|whether|if|there|are|is)){0,4}\s*$/u;
    // A bounded, explicitly negated proof may govern a second proposition:
    // "not proof that X or that no payment was made" denies that inference.
    // Causal/conclusive connectors end that protection; ordinary preceding
    // negatives (such as "backend not available") still cannot qualify absence.
    const negatedProofQualifier=/\bnot\s+(?:proof|evidence)\s+that\s+(?:(?:(?!\b(?:so|therefore|thus|hence|instead|indeed|actually|certainly)\b)[^,;.!?\n]){1,100}\s+or\s+that\s+)?$/u;
    const scopedAbsence=kind==='health_failed_read_not_empty'
      ?new RegExp(absence.source.replace('extended[- ]study|tuition','extended[- ]study|health|medical|examination|tuition'),'gu'):absence;
    const assertsAbsence=clauses.some(clause=>{
      // This exact metadata formatter statement denies a mutation, not the
      // existence of records. It must not erase an absence in another clause.
      if(kind==='health_failed_read_not_empty'&&/^no record or appointment was changed$/u.test(clause))return false;
      return [...clause.matchAll(scopedAbsence)].some(match=>{
      const prefix=clause.slice(Math.max(0,match.index-150),match.index);
      return !absenceQualifier.test(prefix.slice(-90))&&!negatedProofQualifier.test(prefix);
      });
    });
    return {passed:readFailure&&!assertsAbsence,detail:'A failed or unavailable read is stated explicitly and is not presented as an empty collection.'};
  }
  if(kind==='health_metadata_not_clinical'||kind==='health_metadata_no_clinical_claims') {
    const caveat=clauses.some(clause=>/\b(?:clinical|diagnos(?:is|es)|medical (?:results?|report|condition)|health status|normal)\b/u.test(clause)
      &&(isNegative(clause)||/\b(?:unknown|unavailable|unverified|not included)\b/u.test(clause)));
    const diagnosis=/\b(?:your|the)\s+(?:(?:health|medical|blood|examination|exam)\s+){0,3}(?:results?|condition|status|examination)\s+(?:is|are|shows?|indicates?|confirms?)\s+(?:normal|healthy|abnormal|high|low|diabetes|disease)\b|\byou (?:are healthy|have (?:diabetes|a disease|no medical condition))\b|^\s*(?:diagnosis|clinical diagnosis|medical diagnosis|blood results?|clinical results?)\s*[:：]\s*(?:normal|healthy|abnormal|high|low|diabetes|disease)\b/gu;
    return {passed:(kind==='health_metadata_no_clinical_claims'||caveat)&&!clauses.some(clause=>affirmative(clause,diagnosis)),detail:'Metadata flags are explicitly separated from clinical findings or a diagnosis.'};
  }
  if(kind==='health_metadata_not_download'||kind==='health_metadata_no_download_claims') {
    const caveat=clauses.some(clause=>/\b(?:download|downloaded|open|opened|authorize|authorization|pdf|file content)\b/u.test(clause)&&isNegative(clause));
    const completion=/\b(?:i|we) (?:have )?(?:downloaded|opened|authorized|read) (?:your |the |a )?(?:health |medical |examination )?(?:pdf|report|file)\b|\bdownload (?:is )?(?:complete|completed|ready)\b/gu;
    return {passed:(kind==='health_metadata_no_download_claims'||caveat)&&!clauses.some(clause=>affirmative(clause,completion)),detail:'An availability flag does not become file access, authorization or a completed download.'};
  }
  if(kind==='health_page_not_collection') {
    const pageEmpty=clauses.some(clause=>/\bpage\b/u.test(clause)&&/\b(?:empty|no (?:matching )?(?:records?|rows)|zero|0)\b/u.test(clause));
    const distinction=clauses.some(clause=>/\b(?:collection|history|other pages|saved records)\b/u.test(clause)
      &&(/\b(?:not|does not|doesn't)\b/u.test(clause)||/\b(?:remain|elsewhere|separate|26)\b/u.test(clause)));
    const absent=/\b(?:you have no|there are no|no saved) (?:health |medical |examination )*(?:records|history)\b/gu;
    return {passed:pageEmpty&&distinction&&!clauses.some(clause=>affirmative(clause,absent)),detail:'An empty selected page is distinguished from the nonempty saved collection.'};
  }
  return {passed:false,detail:'Unknown independent evidence boundary.'};
}

export function extractAnswerLinks(body = {}) {
  const answer = typeof body.answer === 'string' ? body.answer : '';
  const prose = [...answer.matchAll(/\]\(\s*<?([^\s)>]+)>?(?:\s+[^)]*)?\)|https?:\/\/[^\s<>\])]+/g)]
    .map(match => match[1] || match[0].replace(/[.,;]+$/,''));
  const structured = [...(Array.isArray(body.citations)?body.citations:[]),...(Array.isArray(body.views)?body.views:[])]
    .flatMap(item => [item?.url]);
  return [...new Set([...prose,...structured].filter(value => typeof value === 'string'))];
}

function normalizedLink(value) {
  try {
    const url = new URL(value,'https://stu.best');
    if (!['http:','https:'].includes(url.protocol) || url.username || url.password || /^\/\//.test(value)) return null;
    return `${url.origin}${decodeURI(url.pathname).replace(/\/$/,'') || '/'}${url.search}${url.hash}`;
  } catch { return null; }
}

// The overall link set cannot tell which destination was attached to each
// record. Require an explicit label/target pair or one unambiguous record row.
function recordLinkMatches(answer, binding, allBindings) {
  if (!binding || typeof binding.label !== 'string' || !binding.label.trim() || typeof binding.url !== 'string') return false;
  const target = normalizedLink(binding.url);
  if (!target?.startsWith('https://stu.best/')) return false;
  const label = normalize(binding.label);
  const knownLabels = allBindings.map(item => item?.label).filter(value => typeof value === 'string' && value.trim());
  let matched = false;
  for (const line of String(answer).split(/\r?\n/u)) {
    const mappings = [...line.matchAll(/(?<!!)\[([^\]\n]+)\]\(\s*<?([^\s)>]+)>?(?:\s+[^)]*)?\)/gu)];
    const named = mappings.filter(([, name]) => tokenPresent(normalize(name), label));
    if (named.some(([, , url]) => normalizedLink(url) !== target)) return false;
    if (named.length) matched = true;
    const visible = normalize(visibleMarkdown(line));
    const markers = new Set(labelOccurrences(visible, knownLabels).map(marker => marker.label));
    if (!markers.has(label)) continue;
    const localLinks = extractAnswerLinks({answer:line}).map(normalizedLink);
    if (markers.size > 1) {
      const namedDestinations = mappings.filter(([, name]) => labelOccurrences(normalize(name), knownLabels).length === 1)
        .map(([, , url]) => normalizedLink(url));
      if (namedDestinations.length !== mappings.length || localLinks.some(url => !namedDestinations.includes(url))) return false;
      continue;
    }
    if (localLinks.some(url => url !== target)) return false;
    if (localLinks.length) matched = true;
  }
  return matched;
}

// This test-side allowlist is deliberately independent of the runtime planner.
const accountReadNames=new Set(['profile','courses','assignments','dtm','charges','tasks','requests','serviceRecords','leaveRecords','internshipRecords','announcements','scholarship','studentAid','housing','housingApplications','creditLoadHistory','courseSelection','academicGrades','graduationReview','academicAttendance','courseCatalog','enrollmentCertificate','dtmSubmissions','tuition','studentConduct','studentLoan','aidPayments','dtmAssignment','dtmAssignmentList','dtmMaterials','dtmGradeReport','elearningEnrollments','facilityRepairs','elearningOutline','dormitoryConduct','feeRemission','healthExaminations','counselingAppointments','graduationClearance','tutorEvaluation']);
const toolStatusAliases={success:'complete',succeeded:'complete',failed:'error',started:'running',start:'running'};
const toolStatuses=new Set(['running','complete','unavailable','error','cancelled','skipped']);
const terminalStatuses=new Set(['complete','unavailable','error','cancelled','skipped']);

function observedTools(envelope) {
  const events=[...(Array.isArray(envelope.events)?envelope.events:[]),...(Array.isArray(envelope.body?.activity)?envelope.body.activity:[])];
  const explicit=[...(Array.isArray(envelope.toolCalls)?envelope.toolCalls:[])];
  const invalid=[];
  if(envelope.events!==undefined&&!Array.isArray(envelope.events)||envelope.toolCalls!==undefined&&!Array.isArray(envelope.toolCalls)||envelope.body?.activity!==undefined&&!Array.isArray(envelope.body.activity))invalid.push('malformed_telemetry_collection');
  for(const event of events) {
    const kind=event?.kind||'',named=/^account-read:([a-zA-Z]+):([12])$/.exec(kind);
    if(named)explicit.push({name:named[1],status:event.status,attempt:Number(named[2])});
    else if(typeof kind==='string'&&kind.startsWith('account-read:'))invalid.push('malformed_read_event');
    // A planner's selected `tools` list is not a read attempt or completion.
  }
  const attempted=new Set(),observed=new Set(),terminal={};
  for(const item of explicit) {
    if(typeof item?.name!=='string'){invalid.push('missing_tool_name');continue;}
    attempted.add(item.name);
    const status=toolStatusAliases[item.status]||item.status;
    if(!accountReadNames.has(item.name)||!toolStatuses.has(status)){invalid.push('unknown_tool_or_status');continue;}
    if(item.attempt!==undefined&&![1,2].includes(item.attempt)){invalid.push('invalid_attempt');continue;}
    if(status==='complete')observed.add(item.name);
    if(terminalStatuses.has(status)) {
      if(!Object.hasOwn(terminal,item.name))terminal[item.name]=[];
      if(!terminal[item.name].includes(status))terminal[item.name].push(status);
    }
  }
  // These are claimed evidence selections, not proof that a database read ran.
  const cited=new Set((Array.isArray(envelope.body?.citations)?envelope.body.citations:[]).map(item=>item?.chunkId).filter(id=>typeof id==='string'&&id.startsWith('account:')).map(id=>id.slice(8)));
  return {observed,attempted,cited,terminal,invalid,events,hasTelemetry:Array.isArray(envelope.events)||Array.isArray(envelope.toolCalls)||Array.isArray(envelope.body?.activity)};
}

function equalJson(left,right) {
  if (left === right) return true;
  if (!left || !right || typeof left !== 'object' || typeof right !== 'object' || Array.isArray(left)!==Array.isArray(right)) return false;
  const keys = Object.keys(left), other = Object.keys(right);
  return keys.length===other.length && keys.every(key=>Object.hasOwn(right,key) && equalJson(left[key],right[key]));
}

const provenanceTerms = {
  sample:['sample','synthetic','demonstration','範例','模擬','示範'],
  local_demo:['local_demo','local demo','local demonstration','sample','synthetic','範例','模擬','示範'],
  personal:['personal','your saved','saved on stu.best','local record','個人','您儲存','已儲存','站內'],
  local:['stu.best','local','站內'],
  snapshot:['snapshot','captured','快照','擷取'],
};
const limitationText=/(?:\b(?:unavailable|unrecorded|unsupported|unimplemented|unknown)\b|\b(?:no|without)\s+(?:(?:saved|matching|linked|recorded|personal|local|unfinished|current[- ]term|academic|grade|fee|student|aid|dtm|official|final|application)\s+){0,5}(?:records?|data|courses?|subjects?|assignments?|tasks?|requests?|notices?|enrollments?|entries|information|access|permission|model|tool|integration|history|period|grade|gpa)\b|\bnot\s+(?:available|stored|recorded|provided|linked|supported|connected|implemented|configured|verified|an official|been\s+(?:explicitly\s+)?(?:designated|recorded|stored|configured))\b|\b(?:cannot|can't|could not|unable to|does not|do not|don't|doesn't|won't|will not)\s+(?:access|verify|determine|confirm|infer|calculate|change|modify|submit|process|pay|upload|provide|know|have|store|support|include|establish|prove)\b|無法(?:確認|存取|驗證|查詢|推定|計算|修改|更改|提交|付款|上傳|提供)|(?:未|沒有|尚未)(?:儲存|提供|記錄|紀錄|連結|實作|建置|設定|授權|支援)|沒有.{0,15}(?:紀錄|記錄|資料|課程|作業|權限)|不(?:代表|能|可)(?:確認|判定|推定|修改|代為|提供)?)/iu;

/**
 * Grade only observable output against predeclared fixture facts.
 * Optional facts, exactLists, action, noAction, verification, statusCode,
 * requireToolExecution, requiredEvents and forbiddenAccountMarkers strengthen
 * the common case contract. Nothing here changes an answer or executes an action.
 */
export function gradeCase(testCase, envelope = {}, {independentReview} = {}) {
  const checks = [];
  const check = (id,passed,detail) => checks.push({id,passed:passed===true,detail});
  const expected = testCase?.expected || {};
  const body = envelope.body && typeof envelope.body === 'object' ? envelope.body : {};
  const answer = typeof body.answer === 'string' ? body.answer : '';
  const text = normalize(answer);
  // Inspect decoded strings independently. JSON escaping turns a preceding
  // newline into the letter n and can hide a forbidden token at that boundary.
  // Do not join unrelated fields: their words must not form an invented claim.
  const outputFields=[];
  JSON.stringify(body,function(key,value){
    if(key&&!Array.isArray(this))outputFields.push(normalize(key));
    if(value===null||['string','number','boolean'].includes(typeof value))outputFields.push(normalize(value===null?'null':value));
    return value;
  });
  const behavior = expected.behavior;
  const actions = body.proposedAction;
  check('case.id',typeof testCase?.id==='string' && Boolean(testCase.id),'Case has a stable identifier.');
  check('transport.status',envelope.statusCode === (expected.statusCode ?? expected.expectedStatusCode ?? 200),'HTTP status matches the declared expectation.');
  check('transport.execution',['live-model','deterministic','recorded'].includes(envelope.execution),'Execution provenance is explicit.');
  if (testCase?.fixtureKey) check('fixture.identity',envelope.fixtureKey===testCase.fixtureKey,'The response used the requested fixture.');
  const denied = behavior === 'denial';
  if (!denied) check('answer.present',text.length>0 && !body.error,'A non-error answer is present.');
  const statuses = {
    answer:['answered'],navigation:['answered'],clarify:['clarification'],
    unavailable:['answered','abstained','handoff'],proposal:['answered'],denial:['handoff','abstained'],
  };
  check('answer.behavior',Object.hasOwn(statuses,behavior) && (denied && envelope.statusCode>=400 || statuses[behavior]?.includes(body.status)), 'Response behavior matches the case; an abstention never passes an answer-required case.');
  if(behavior==='unavailable'){
    check('oracle.limitation',expected.limitation===true || typeof expected.limitation==='string' || Boolean(expected.limitation?.anyOf?.length),
      'A missing-data/capability case explicitly declares its limitation oracle.');
    check('answer.limitation',limitationText.test(answer.replace(/’/g,"'"))||otherAccountDenial.test(answer)||ownAccountOnlyDenial(answer)||unavailableFileCapability.test(answer)
      ||testCase.domain==='dtmGradeReport'&&missingDtmReportField.test(answer)
      ||testCase.domain==='elearningEnrollments'&&missingElearningEnrollments.test(visibleMarkdown(answer))
      ||testCase.domain==='healthExaminations'&&/\b(?:no (?:saved health (?:examination )?)?records (?:were returned|on (?:this |the |selected )?page)|(?:selected |this )?page.{0,30}empty|no saved health (?:examination )?records)\b/iu.test(visibleMarkdown(answer))
      ||testCase.domain==='counselingAppointments'&&/\bno saved (?:counseling )?appointments\b|沒有已儲存預約/iu.test(visibleMarkdown(answer))
      ||testCase.domain==='tutorEvaluation'&&/\b(?:no saved submission|submission status is unknown|form has no downloadable receipt|approval is not recorded|history is unavailable)\b|沒有這份導師問卷的送出紀錄/iu.test(visibleMarkdown(answer))
      ||testCase.domain==='graduationClearance'&&/\b(?:no (?:matching office|submitted clearance applications|assigned (?:application )?periods)|clearance lookup failed)\b|未找到已送出的離校申請|離校查詢失敗/iu.test(visibleMarkdown(answer))
      ||testCase.domain==='housingApplications'&&/\bno saved housing application(?:s)? matching (?:this|the) selection\b/iu.test(visibleMarkdown(answer))
      ||testCase.domain==='feeRemission'&&/\bno matching saved remission records\b/iu.test(visibleMarkdown(answer))
      ||testCase.domain==='leaveRecords'&&/\bno matching saved leave (?:records|rows)\b|\b(?:cannot|can['’]t|could not|couldn['’]t|failed to)\s+read\b[^.!?\n]{0,64}\bleave\b|沒有相符的已儲存請假紀錄|找不到符合的請假紀錄|沒有符合條件的已儲存假單|無法讀取.{0,20}請假紀錄/iu.test(visibleMarkdown(answer))
      ||testCase.domain==='facilityRepairs'&&limitedFacilityRepair.test(visibleMarkdown(answer)),'The answer explicitly states missing records, inability or unsupported capability.');
    if(expected.limitation && expected.limitation!==true)check('answer.limitation.specific',matches(text,expected.limitation),'The specific required limitation is stated.');
  }
  if (behavior==='answer' && testCase.mode==='record') {
    check('oracle.independent',Boolean(expected.facts?.length || expected.exactLists?.length),'A record answer needs labelled facts or an expected set, not only a substring/runtime verdict.');
    check('answer.verification',body.verification?.status==='verified','Runtime evidence verification completed; independent checks still apply.');
  }
  if (expected.verification) check('answer.verification.expected',body.verification?.status===expected.verification,'Declared verification outcome matches.');
  if (body.verification) check('answer.verification.bound',Number.isInteger(body.verification.attempts) && body.verification.attempts>=0 && body.verification.attempts<=2,'Verification uses at most two checks.');
  for (const [index,value] of (expected.requiredText || []).entries()) check(`text.required.${index}`,matches(text,value),'Required independent text is present with token boundaries.');
  for (const [index,value] of [...(expected.forbiddenText || []),...(expected.forbiddenAccountMarkers || [])].entries()) check(`text.forbidden.${index}`,!outputFields.some(field=>matches(field,value)),'No forbidden contradiction, foreign-account value or unsupported claim appears in prose, cards, citations or actions.');
  for (const [index,fact] of (expected.facts || []).entries()) {
    const result = factResult(answer,fact,expected.facts);check(`fact.${index}`,result.passed,result.detail);
  }
  if(expected.visibleRecordFacts!==undefined){
    const result=visibleRecordFactsResult(body.views,expected.visibleRecordFacts);check('views.recordFacts',result.passed,result.detail);
  }
  for(const [index,kind] of (expected.evidenceBoundaries || []).entries()) {
    const boundaryAnswer=typeof kind==='string'&&/^(?:housing_receipt_|leave_|internship_|dtm_assignment_)/u.test(kind)?visibleBoundaryText(body):answer;
    const result=evidenceBoundaryResult(boundaryAnswer,kind);check(`evidence.boundary.${index}`,result.passed,result.detail);
  }
  for (const [index,list] of (expected.exactLists || []).entries()) {
    const valid = list && Array.isArray(list.expected) && Array.isArray(list.forbidden);
    check(`list.${index}.schema`,valid,'Expected set and explicit distractor universe are declared.');
    if (!valid) continue;
    list.expected.forEach((value,item)=>check(`list.${index}.include.${item}`,matches(text,value),'Expected list member is present.'));
    list.forbidden.forEach((value,item)=>check(`list.${index}.exclude.${item}`,!matches(text,value),'Excluded or foreign list member is absent.'));
    if (list.count !== undefined) {
      const result=factResult(answer,{kind:'number',label:list.label,labels:list.labels,values:[list.count],forbiddenValues:list.forbiddenCounts});
      check(`list.${index}.count`,result.passed,result.detail);
    }
  }
  if (expected.provenance) {
    const aliases=typeof expected.provenance==='string' && provenanceTerms[expected.provenance];
    check('source.provenance',matches(text,aliases?{anyOf:aliases}:expected.provenance),'The required local/sample/snapshot provenance is visible.');
  }
  const links=extractAnswerLinks(body), validLinks=links.map(normalizedLink);
  check('links.safe',validLinks.every(Boolean),'Answer links use safe HTTP(S), with no credentials or protocol-relative targets.');
  for (const [index,url] of (expected.requiredLinks || []).entries()) {
    const normalized=normalizedLink(url);
    check(`links.required.${index}`,Boolean(normalized) && validLinks.includes(normalized),'The required local destination appears in answer/citation/view.');
  }
  if(expected.requiredSourceBindings!==undefined){
    const bindings=expected.requiredSourceBindings;
    const valid=Array.isArray(bindings)&&bindings.length<=20&&bindings.every(binding=>binding&&typeof binding==='object'&&!Array.isArray(binding)
      &&Object.keys(binding).every(key=>['sourceId','url','provenance'].includes(key))&&typeof binding.sourceId==='string'&&binding.sourceId.trim()
      &&typeof binding.url==='string'&&Boolean(normalizedLink(binding.url))
      &&(binding.provenance===undefined||typeof binding.provenance==='string'&&binding.provenance.trim()));
    check('source.bindings.schema',Boolean(valid),'Required source bindings have explicit source IDs, safe destinations and optional provenance.');
    if(valid)for(const [index,binding]of bindings.entries())check('source.binding.'+index,
      (Array.isArray(body.citations)?body.citations:[]).some(citation=>citation?.chunkId===binding.sourceId
        &&normalizedLink(citation.url)===normalizedLink(binding.url)
        &&(binding.provenance===undefined||citation.provenance===binding.provenance)),
      'The independently required source is paired with its own destination and provenance.');
  }
  for (const [index,binding] of (expected.requiredRecordLinks || []).entries()) {
    check(`links.record.${index}`,recordLinkMatches(answer,binding,expected.requiredRecordLinks),'The record label is paired with its exact local destination.');
  }
  for (const [index,url] of (expected.forbiddenLinks || []).entries()) check(`links.forbidden.${index}`,!validLinks.includes(normalizedLink(url)),'A forbidden destination is absent.');
  if (expected.localLinksOnly) check('links.localOnly',validLinks.every(url=>url?.startsWith('https://stu.best/')),'Personal record navigation stays on stu.best.');
  const tools=observedTools(envelope);
  for (const name of expected.requiredTools || []) {
    check(`tool.${name}`,tools.observed.has(name) || !expected.requireToolExecution && tools.cited.has(name),
      tools.observed.has(name)?'Completed tool execution was observed.':expected.requireToolExecution?'A completed tool execution is required.':'The selected account collection is declared in response evidence; this is not database execution proof.');
  }
  const relevance=expected.allowedTools!==undefined||expected.maxDistinctAttemptedTools!==undefined||expected.requiredAttemptedTools!==undefined||expected.toolTerminalStates!==undefined||expected.forbidPublicResearch===true;
  if(relevance) {
    const validNames=value=>Array.isArray(value)&&new Set(value).size===value.length&&value.every(name=>accountReadNames.has(name));
    check('tools.telemetry',tools.hasTelemetry&&!tools.invalid.length,'Named account reads have valid statuses/attempts; planner selections and citations are not execution proof.');
    if(expected.allowedTools!==undefined) {
      const valid=validNames(expected.allowedTools);
      check('tools.allowed.schema',valid,'The relevance policy declares distinct registered tools.');
      check('tools.allowed.attempted',valid&&[...tools.attempted].every(name=>expected.allowedTools.includes(name)),'Every attempted read, including failed/retried reads, is relevant.');
      check('tools.allowed.cited',valid&&[...tools.cited].every(name=>expected.allowedTools.includes(name)),'Cited account evidence stays within the declared relevant collections.');
    }
    if(expected.maxDistinctAttemptedTools!==undefined)check('tools.attempted.limit',Number.isInteger(expected.maxDistinctAttemptedTools)&&expected.maxDistinctAttemptedTools>=0&&tools.attempted.size<=expected.maxDistinctAttemptedTools,'Distinct attempts stay within the independent relevance budget.');
    if(expected.requiredAttemptedTools!==undefined) {
      const valid=validNames(expected.requiredAttemptedTools);
      check('tools.attempted.schema',valid,'Required attempts use registered tool names.');
      for(const name of valid?expected.requiredAttemptedTools:[])check('tool.attempted.'+name,tools.attempted.has(name),'The required reader was attempted, regardless of whether it succeeded.');
    }
    if(expected.toolTerminalStates!==undefined) {
      const states=expected.toolTerminalStates,valid=states&&typeof states==='object'&&!Array.isArray(states)&&Object.entries(states).every(([name,allowed])=>accountReadNames.has(name)&&Array.isArray(allowed)&&allowed.length>0&&new Set(allowed).size===allowed.length&&allowed.every(status=>terminalStatuses.has(status)));
      check('tools.terminal.schema',Boolean(valid),'Terminal-state oracles use registered readers and explicit outcomes.');
      if(valid)for(const [name,allowed]of Object.entries(states))check('tool.terminal.'+name,Boolean(tools.terminal[name]?.length)&&tools.terminal[name].every(status=>allowed.includes(status)),'Every observed terminal outcome for this reader matches; running-only, empty, and failed reads are distinct.');
    }
    if(expected.forbidPublicResearch)check('tools.public.none',!tools.events.some(event=>typeof event?.kind==='string'&&/^(?:public(?:-|$)|web(?:-|$)|knowledge(?:-|$)|page-context$)/u.test(event.kind)),'Private-account/coaching cases do not enter public research, including failed searches.');
  }
  if(expected.guidanceRubric) {
    // The runner alone supplies a separately validated exact-response review.
    // A response body (or a top-level response field) cannot approve itself.
    const declared=expected.guidanceRubric.criteria,reviewed=independentReview?.criteria;
    const ids=Array.isArray(declared)?declared.map(item=>item?.id):[];
    const rubricIds=['requested_parts','usable_help','next_step','honest_separation','proportionate_clarification','missing_data','language_relevance'];
    const valid=expected.guidanceRubric.version==='stu-guidance-v1'&&ids.length>0&&new Set(ids).size===ids.length&&declared.every(item=>item&&rubricIds.includes(item.id)&&['spans','whole_answer'].includes(item.proof));
    let bound=false;
    try {
      const binding=independentReview?.binding;
      const current=buildGuidanceReviewBinding({...binding,testCase,envelope});
      bound=equalJson(binding,current);
    }catch{/* Missing, stale or malformed response bindings cannot authorize a review. */}
    check('guidance.independentReview',Boolean(valid&&bound&&independentReview?.status==='passed'&&independentReview.passed===true&&Array.isArray(reviewed)&&reviewed.length===ids.length&&new Set(reviewed.map(item=>item?.id)).size===ids.length&&reviewed.every(item=>item&&ids.includes(item.id)&&item.passed===true)&&Array.isArray(independentReview.failures)&&independentReview.failures.length===0),'Applicable guidance criteria require a separately validated review; missing/pending review never earns a pass.');
  }
  if(expected.healthMetadataOnly===true){
    const serialized=JSON.stringify(body);
    // Inspect displayed claims separately: a disclaimer in prose must never
    // cancel an invented finding in a card, title, citation or activity label.
    const displayedClaims=[answer];
    const visit=value=>{
      if(typeof value==='string')displayedClaims.push(value);
      else if(Array.isArray(value)){
        if(value.length>1&&value.every(cell=>typeof cell==='string'||typeof cell==='number'||typeof cell==='boolean'))displayedClaims.push(value.join(': '));
        value.forEach(visit);
      }else if(value&&typeof value==='object')Object.values(value).forEach(visit);
    };
    visit(body);
    const allowedHealthLinks=(expected.requiredLinks||[]).map(normalizedLink).filter(url=>url?.startsWith('https://stu.best/school-affairs/services/36-1'));
    const healthLinks=extractAnswerLinks(body).map(normalizedLink).filter(url=>url?.startsWith('https://stu.best/school-affairs/services/36-1'));
    check('health.exactPageLinks',healthLinks.every(url=>allowedHealthLinks.includes(url)),'Every health destination names the selected exact local page; a correct citation cannot excuse a conflicting prose link.');
    check('health.noClinicalClaims',displayedClaims.every(claim=>evidenceBoundaryResult(claim,'health_metadata_no_clinical_claims').passed),'No clinical finding or diagnosis is inferred from metadata.');
    check('health.noDownloadClaims',displayedClaims.every(claim=>evidenceBoundaryResult(claim,'health_metadata_no_download_claims').passed),'No report access or successful download is claimed from metadata.');
    check('health.noStorageOutput',!/(?:storage\/v1\/|object\/sign\/|affairs-health-reports\/|[?&]token=|"signedURL"|"signedUrl")/iu.test(serialized),'Health metadata responses contain no Storage path, signed URL or download token in any field.');
    check('health.noFileActivity',!tools.events.some(event=>/storage|health.report.authoriz|file.download|download.report/iu.test(String(event?.kind))),'The metadata conversation records no report authorization, Storage or file-download action.');
  }
  const allEvents=tools.events;
  for (const kind of expected.requiredEvents || []) check(`event.${kind}`,allEvents.some(event=>event.kind===kind && event.status==='complete'),'Required completed operation is retained.');
  const noAction=expected.noAction ?? behavior!=='proposal';
  if (noAction) check('action.none',!actions,'Read, navigation, clarification and unavailable answers do not propose writes.');
  if(expected.requireUnchangedOwnedRecords){
    const before=envelope.stateBefore?.ownedRecordsDigest,after=envelope.stateAfterProposal?.ownedRecordsDigest;
    check('action.ownedRecordsUnchanged',typeof before==='string'&&/^[a-f0-9]{64}$/u.test(before)&&before===after
      &&envelope.fixtureReadback?.verified===true&&envelope.fixtureReadback?.independentGolden===true,'Two independently read fixture snapshots show that the assistant changed no owned record.');
  }
  if (behavior==='proposal' || expected.action) {
    check('action.expected',Boolean(expected.action && typeof expected.action.kind==='string' && expected.action.payload && typeof expected.action.payload==='object'),'Action acceptance declares an immutable kind and payload.');
    check('action.kind',Boolean(actions && actions.kind===expected.action?.kind),'Only the requested action kind is proposed.');
    check('action.payload',Boolean(actions && expected.action && equalJson(actions.payload,expected.action.payload)),'Action payload exactly matches the independently expected target and fields.');
    if (expected.action?.requestIdRequired!==false) check('action.receipt',typeof actions?.requestId==='string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(actions.requestId),'A stable request receipt protects confirmation replay.');
    check('action.confirmation',/(?:confirm|confirmation|review|確認|核對)/i.test(answer),'The proposal visibly requires review or confirmation.');
    if (envelope.stateBefore !== undefined || envelope.stateAfterProposal !== undefined)
      check('action.noPrematureWrite',envelope.stateBefore!==undefined && envelope.stateAfterProposal!==undefined && equalJson(envelope.stateBefore,envelope.stateAfterProposal),'Proposal generation did not mutate stored state.');
  }
  if (expected.confirmedState !== undefined) check('action.readback',envelope.stateAfterConfirmation!==undefined && equalJson(envelope.stateAfterConfirmation,expected.confirmedState),'A fresh backend readback matches the confirmed action.');
  if (expected.maxElapsedMs!==undefined) check('performance.deadline',Number.isFinite(envelope.elapsedMs) && envelope.elapsedMs<=expected.maxElapsedMs,'The request stays within its declared deadline.');
  const failures=checks.filter(item=>!item.passed).map(({id,detail})=>({id,detail}));
  return {
    caseId:testCase?.id,passed:failures.length===0,checks,failures,
    execution:envelope.execution,sourceRevision:envelope.sourceRevision,fixtureKey:envelope.fixtureKey,
    domain:testCase?.domain,mode:testCase?.mode,behavior,capability:testCase?.capability,
    elapsedMs:envelope.elapsedMs,toolEvidence:{attempted:[...tools.attempted],observed:[...tools.observed],claimed:[...tools.cited],terminalStates:tools.terminal},
  };
}
