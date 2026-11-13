/** Independent, declarative acceptance checks. Never use the runtime verdict as the oracle. */
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
const foreignSubject=/^(?:(?:another|other|different|unrelated)\s+(?:student|account|course|assignment|record)|(?:student|account)\s+[\p{L}\p{N}_-]+\s*[:：]|(?:另一|其他|別的)(?:學生|帳戶|課程|作業|紀錄))/iu;

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

function factResult(answer, fact) {
  if (!fact || typeof fact !== 'object' || !Array.isArray(fact.values) || !fact.values.length || !['text','number','date'].includes(fact.kind))
    return {passed:false,detail:'Malformed independent fact expectation.'};
  const labels = [fact.label,...(fact.labels || [])].filter(value => typeof value === 'string' && value.trim());
  if (!labels.length) return {passed:false,detail:'A fact needs a semantic label or record identifier.'};
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
  if (!windows.some(window => fact.values.every(value => matches(window,value))))
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

function observedTools(envelope) {
  const explicit = [...(envelope.toolCalls || []),...(envelope.events || []).flatMap(event=>{
    const named=/^account-read:([a-zA-Z]+):[12]$/.exec(event?.kind||'');
    return [...(Array.isArray(event?.tools)?event.tools.map(name=>({name,status:event.status})):[]),...(named?[{name:named[1],status:event.status}]:[])];
  })];
  const observed = new Set(explicit.filter(item=>typeof item?.name==='string' && ['complete','success','succeeded'].includes(item.status)).map(item=>item.name));
  // These are claimed evidence selections, not proof that a database read ran.
  const cited = new Set((envelope.body?.citations || []).map(item=>item?.chunkId).filter(id=>typeof id==='string' && id.startsWith('account:')).map(id=>id.slice(8)));
  return {observed,cited};
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
export function gradeCase(testCase, envelope = {}) {
  const checks = [];
  const check = (id,passed,detail) => checks.push({id,passed:passed===true,detail});
  const expected = testCase?.expected || {};
  const body = envelope.body && typeof envelope.body === 'object' ? envelope.body : {};
  const answer = typeof body.answer === 'string' ? body.answer : '';
  const text = normalize(answer);
  const entireOutput=normalize(JSON.stringify(body));
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
    check('answer.limitation',limitationText.test(answer),'The answer explicitly states missing records, inability or unsupported capability.');
    if(expected.limitation && expected.limitation!==true)check('answer.limitation.specific',matches(text,expected.limitation),'The specific required limitation is stated.');
  }
  if (behavior==='answer' && testCase.mode==='record') {
    check('oracle.independent',Boolean(expected.facts?.length || expected.exactLists?.length),'A record answer needs labelled facts or an expected set, not only a substring/runtime verdict.');
    check('answer.verification',body.verification?.status==='verified','Runtime evidence verification completed; independent checks still apply.');
  }
  if (expected.verification) check('answer.verification.expected',body.verification?.status===expected.verification,'Declared verification outcome matches.');
  if (body.verification) check('answer.verification.bound',Number.isInteger(body.verification.attempts) && body.verification.attempts>=0 && body.verification.attempts<=2,'Verification uses at most two checks.');
  for (const [index,value] of (expected.requiredText || []).entries()) check(`text.required.${index}`,matches(text,value),'Required independent text is present with token boundaries.');
  for (const [index,value] of [...(expected.forbiddenText || []),...(expected.forbiddenAccountMarkers || [])].entries()) check(`text.forbidden.${index}`,!matches(entireOutput,value),'No forbidden contradiction, foreign-account value or unsupported claim appears in prose, cards, citations or actions.');
  for (const [index,fact] of (expected.facts || []).entries()) {
    const result = factResult(answer,fact);check(`fact.${index}`,result.passed,result.detail);
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
  for (const [index,url] of (expected.forbiddenLinks || []).entries()) check(`links.forbidden.${index}`,!validLinks.includes(normalizedLink(url)),'A forbidden destination is absent.');
  if (expected.localLinksOnly) check('links.localOnly',validLinks.every(url=>url?.startsWith('https://stu.best/')),'Personal record navigation stays on stu.best.');
  const tools=observedTools(envelope);
  for (const name of expected.requiredTools || []) {
    check(`tool.${name}`,tools.observed.has(name) || !expected.requireToolExecution && tools.cited.has(name),
      tools.observed.has(name)?'Completed tool execution was observed.':expected.requireToolExecution?'A completed tool execution is required.':'The selected account collection is declared in response evidence; this is not database execution proof.');
  }
  const allEvents=[...(envelope.events || []),...(body.activity || [])];
  for (const kind of expected.requiredEvents || []) check(`event.${kind}`,allEvents.some(event=>event.kind===kind && event.status==='complete'),'Required completed operation is retained.');
  const noAction=expected.noAction ?? behavior!=='proposal';
  if (noAction) check('action.none',!actions,'Read, navigation, clarification and unavailable answers do not propose writes.');
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
    elapsedMs:envelope.elapsedMs,toolEvidence:{observed:[...tools.observed],claimed:[...tools.cited]},
  };
}
