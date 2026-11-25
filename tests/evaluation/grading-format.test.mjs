import assert from 'node:assert/strict';
import {test} from 'node:test';
import {gradeCase} from './grading.mjs';
import {buildAccountCases} from './account-cases.mjs';

function grade(answer,facts,extra={}) {
  const testCase={id:'format.fact',domain:'academicGrades',mode:'record',fixtureKey:'format-fixture',expected:{behavior:'answer',facts,...extra}};
  return gradeCase(testCase,{statusCode:200,execution:'recorded',fixtureKey:'format-fixture',body:{status:'answered',answer,verification:{status:'verified',attempts:1}}});
}
const fact=(label,values,kind='text',extra={})=>({label,values:Array.isArray(values)?values:[values],kind,...extra});
const pass=result=>assert.equal(result.passed,true,JSON.stringify(result.failures));
const fail=(result,id='fact.0')=>assert.ok(result.failures.some(item=>item.id===id),JSON.stringify(result));

test('native semicolon-delimited fields remain attached to their course record',()=>{
  pass(grade('Database Design; category: Core; module: Information Studies; required/elective: required; credits: 3; grade: 87.',[fact('Database Design',87,'number')]));
  pass(grade('WR201 · Research Writing; credits: 2; grade: 42; remark: Consult the course teacher.',[fact('Research Writing',42,'number')]));
  pass(grade('Networks Workshop; required/elective: elective; 3 credits; instructor: Teacher Chen; remark: Selected for local review.',[fact('Networks Workshop',[3,'Teacher Chen'])]));
  pass(grade('Database Design；學分：3；成績：87。',[fact('Database Design',87,'number')]));
});

test('unknown semicolon subjects and other students are separate records',()=>{
  for(const answer of [
    'Database Design; grade: unknown; Another student has grade 87.',
    'Database Design; grade: unknown; Research Writing; grade: 87.',
    'Database Design; grade: unknown; Student B: grade 87.',
    'Database Design; grade: unknown\nAnother student has grade 87.',
    'Database Design; grade: unknown\n  Another student has grade 87.',
    '- Database Design; grade: unknown\n  - Research Writing; grade: 87.',
  ])fail(grade(answer,[fact('Database Design',87,'number')]));
});

test('visible Markdown label plus an indented feedback or instruction line is one record',()=>{
  const destination='/dtm/course/'+('a'.repeat(350))+'/grades#grade-'+('b'.repeat(350));
  const answer=`- [DTM301 · Quiz 1](${destination}) · 12/20 (60.0%)\n  Feedback: Revise normalization examples.`;
  pass(grade(answer,[fact('Quiz 1',['Revise normalization examples.',12,20])]));
  pass(grade('- [Index plan](/dtm/course/qa/assignments#assignment-qa) · open\n  Instructions: Compare B-tree and hash indexes in two pages.',[fact('Index plan',['B-tree','hash indexes','two pages'])]));
  pass(grade('- [Review notes](/dtm/course/qa)\n  The quiz covers normalization and transaction isolation.',[fact('Review notes','transaction isolation')]));
  pass(grade('- Quiz 1\n  - Feedback: Revise normalization examples.',[fact('Quiz 1','Revise normalization examples.')]));
});

test('separate bullets, paragraphs, table rows and unrelated indented records cannot donate feedback',()=>{
  for(const answer of [
    '- Quiz 1\n- Quiz 2\n  Feedback: Revise normalization examples.',
    '- Quiz 1\n\n  Feedback: Revise normalization examples.',
    '- Quiz 1\n  - Quiz 2\n    Feedback: Revise normalization examples.',
    '| Quiz 1 | No feedback |\n  | Quiz 2 | Revise normalization examples. |',
    '- Quiz 1\n  Another student: Revise normalization examples.',
  ])fail(grade(answer,[fact('Quiz 1','Revise normalization examples.')]));
});

test('navigation destinations never count as facts or enlarge the fact window',()=>{
  fail(grade('- [Quiz 1](/dtm/Revise%20normalization%20examples.)',[fact('Quiz 1','Revise normalization examples.')]));
  fail(grade('- [Quiz 1](/dtm/grade/87) · not recorded',[fact('Quiz 1',87,'number')]));
  fail(grade('- [Other course](/dtm/Database%20Design) · grade 87',[fact('Database Design',87,'number')]));
  pass(grade('- [Quiz 1](/dtm/999999) · 87',[fact('Quiz 1',87,'number',{exclusive:true,allowedNumbers:[1]})]));
});

test('ISO date and clock tokens match their precise date-time components',()=>{
  const answer='Database Design; course date 2026-11-10; period 3-4; roll-call time 2026-11-10T10:12:00+08:00.';
  pass(grade(answer,[fact('roll-call','2026-11-10','date'),fact('roll-call','10:12')],{requiredText:['2026-11-10','10:12']}));
  pass(grade('Recorded: 2026-11-10T10:12:00Z.',[fact('Recorded','2026-11-10','date')],{requiredText:['10:12']}));
  for(const answer of ['roll-call time 2026-11-11T10:12:00Z.','roll-call time 12026-11-10T10:12:00Z.','roll-call time 2026-11-10Tomorrow.'])
    fail(grade(answer,[fact('roll-call','2026-11-10','date')]));
  for(const answer of ['roll-call time 2026-11-10T11:12:00Z.','roll-call time 110:12.','roll-call time tokenT10:12.'])
    fail(grade(answer,[fact('roll-call','10:12')]));
});

test('wrong dates from another row cannot satisfy the requested labelled record',()=>{
  fail(grade('Database Design; roll-call time 2026-11-11T10:12:00Z.\nResearch Writing; roll-call time 2026-11-10T10:12:00Z.',[fact('Database Design','2026-11-10','date')]));
  fail(grade('Database Design; roll-call time 2026-11-11T10:12:00Z; Other student: 2026-11-10T10:12:00Z.',[fact('Database Design','2026-11-10','date')]));
});

test('format handling retains numeric contradictions, exact token boundaries, negation and missing-label failures',()=>{
  fail(grade('Database Design; grade: not 87.',[fact('Database Design',87,'number')]));
  fail(grade('Database Design; grade: 87 or 99.',[fact('Database Design',87,'number',{forbiddenValues:[99]})]));
  fail(grade('Database Design; grade: 870.',[fact('Database Design',87,'number')]));
  fail(grade('Other course; grade: 87.',[fact('Database Design',87,'number')]));
  fail(grade('NotDatabase Design; grade: 87.',[fact('Database Design',87,'number')]));
  fail(grade('Database Design; grade: Pending.',[fact('Database Design','P')]));
  fail(grade('Database Design; grade: 87.\nDatabase Design; grade: 99.',[fact('Database Design',87,'number',{forbiddenValues:[99]})]));
});

test('one fact cannot assemble its required values from different records with the same label',()=>{
  fail(grade('- Quiz 1; grade: 12\n- Quiz 1; grade: 20',[fact('Quiz 1',[12,20],'number')]));
  pass(grade('- Quiz 1; score: 12/20',[fact('Quiz 1',[12,20],'number')]));
});

test('opt-in stored-string matching never coerces a numeric-looking literal',()=>{
  const literal=fact('saved text','0','text',{match:'literal'});
  pass(grade('The saved text is `0`.',[literal]));
  for(const value of ['0.00','00','+0','-0','0e0','0,000','0%'])fail(grade('The saved text is `'+value+'`.',[literal]));
  pass(grade('Remaining balance: 0.00 TWD.',[fact('balance',0,'number')]));
  pass(grade('Remaining balance: 23,000 TWD.',[fact('balance',23000,'number')]));
  fail(grade('The saved text is `0`.',[{...literal,match:'unknown'}]));
});

test('independent evidence boundaries reject contradictions even beside valid caveats',()=>{
  const facts=[fact('literal saved text','0','text',{match:'literal'})];
  const boundary={evidenceBoundaries:['literal_text_not_payment']};
  pass(grade('Literal saved text: 0. This does not confirm payment.',facts,boundary));
  pass(grade('Literal saved text: 0. Payment is unconfirmed.',facts,boundary));
  for(const claim of ['Payment is confirmed.','Payment has now been confirmed.','Payment was verified.','This proves payment.','Your tuition is paid.','Payment is complete.','Payment has been made.','This is not a guess: payment is confirmed.','Payment is not only confirmed but settled.'])
    fail(grade('Literal saved text: 0. This does not confirm payment. '+claim,facts,boundary),'evidence.boundary.0');
  fail(grade('Literal saved text: 0.',facts,boundary),'evidence.boundary.0');
  fail(grade('Literal saved text: 0.',facts,{evidenceBoundaries:['unknown_boundary']}),'evidence.boundary.0');
});

test('failed-source wording cannot negate an adjacent affirmative empty-record claim',()=>{
  const expected={evidenceBoundaries:['failed_read_not_empty'],behavior:'unavailable',limitation:true};
  pass(grade('The backend is not available. I cannot infer that no records exist.',[],expected));
  for(const answer of ['The extended-study backend is not available, so no records are saved.','The source could not be accessed: no records exist.'])
    fail(grade(answer,[],expected),'evidence.boundary.0');
});

test('the default fact window remains bounded after removing link destinations',()=>{
  fail(grade('Quiz 1 '+('context '.repeat(60))+'Feedback: Revise normalization examples.',[fact('Quiz 1','Revise normalization examples.')]));
});

function missing(answer) {
  return gradeCase({id:'format.missing',mode:'empty',expected:{behavior:'unavailable',limitation:true}},
    {statusCode:200,execution:'recorded',body:{status:'answered',answer}});
}
test('explicit missing data and unsupported calculation wording counts as a limitation',()=>{
  for(const answer of [
    'No fee records are saved.',
    'These academic records do not store GPA.',
    'This local view has no current-term grade model; query saved transcript records.',
    'No matching unfinished assignments are saved.',
    'You have no saved DTM courses yet.',
    'No application history.',
    'No local application period has been published.',
    'No student aid records.',
    'No academic grade records match these filters.',
    'Your current term has not been explicitly designated.',
    'Only individual assessment records are available; no official final grade, weighting rule or GPA is recorded.',
  ])pass(missing(answer));
});

test('factual balances and generic disclaimers do not masquerade as missing-data or action-denial answers',()=>{
  for(const answer of [
    'Tuition instalment A: remaining NT$23,000; charged NT$28,000; paid NT$5,000.',
    'Database Design; grade: 87. No pass status, graduation eligibility or university synchronization is inferred.',
    'Your grade is 87. Local demonstration records maintained by the site administrator.',
    'Payment completed. All records are saved.',
  ])fail(missing(answer),'answer.limitation');
});

test('explicit foreign-record and file-capability denials accept ordinary typography without accepting generic disclaimers',()=>{
  for(const answer of [
    'I can’t show tuition settlement statements for another student account.',
    "I can't show another student's records.",
    'I cannot disclose records for a different account.',
    'I can’t verify this payment from the saved statement.',
    'Summer payment documents: no verified local file capability.',
    'This service has no download capability.',
  ])pass(missing(answer));
  for(const answer of [
    'I can show tuition settlement statements for another student account.',
    'I can’t show the animation. Here are the other student records.',
    'I can’t show '+('irrelevant '.repeat(30))+'another student account.',
    'Summer payment documents have verified local file capability.',
  ])fail(missing(answer),'answer.limitation');
});

test('recognizing a privacy denial cannot conceal foreign values or replace an answer-required fact',()=>{
  const item={id:'format.foreign',mode:'empty',expected:{behavior:'unavailable',limitation:true,forbiddenText:['FOREIGN PRIVATE SENTINEL']}};
  const answer='I can’t show another student account. FOREIGN PRIVATE SENTINEL';
  const result=gradeCase(item,{statusCode:200,execution:'recorded',body:{status:'answered',answer}});
  fail(result,'text.forbidden.0');
  fail(grade('I can’t show another student account.',[fact('statement','0')]));
});

test('forbidden claims cannot hide behind JSON escapes or inside structured output',()=>{
  const item={id:'format.forbidden',mode:'empty',expected:{behavior:'unavailable',limitation:true,forbiddenText:['Payment confirmed','FOREIGN PRIVATE SENTINEL']}};
  const evaluate=extra=>gradeCase(item,{statusCode:200,execution:'recorded',body:{status:'answered',answer:'Payment evidence is unavailable.',...extra}});
  for(const prefix of ['\n','\r\n','\t','"']){
    fail(evaluate({answer:'Payment evidence is unavailable.'+prefix+'Payment confirmed.'}),'text.forbidden.0');
    fail(evaluate({views:[{rows:[['Unknown'+prefix+'FOREIGN PRIVATE SENTINEL']]}]}),'text.forbidden.1');
  }
  fail(evaluate({citations:[{claim:'Evidence:\nPayment confirmed'}]}),'text.forbidden.0');
  fail(evaluate({views:[{'FOREIGN PRIVATE SENTINEL':'value'}]}),'text.forbidden.1');
  pass(evaluate({views:[{title:'Payment',note:'confirmed',rows:[['FOREIGN PRIVATE','SENTINEL']]}]}));
  pass(evaluate({answer:'Payment evidence is unavailable. XPayment confirmedX.'}));
});

test('numeric structured values are checked but array indexes never become invented forbidden data',()=>{
  const item={id:'format.numeric-forbidden',mode:'empty',expected:{behavior:'unavailable',limitation:true,forbiddenText:['115']}};
  const evaluate=views=>gradeCase(item,{statusCode:200,execution:'recorded',body:{status:'answered',answer:'Academic year is not recorded.',views}});
  fail(evaluate([{academicYear:115}]),'text.forbidden.0');
  fail(evaluate([{academicYear:'115'}]),'text.forbidden.0');
  pass(evaluate([{academicYear:1150}]));
  pass(evaluate(Array.from({length:116},()=>({academicYear:null}))));
});

test('primitive null and booleans remain visible to explicit forbidden-value checks',()=>{
  for(const [value,forbidden] of [[null,'null'],[true,'true'],[false,'false']]){
    const item={id:'format.primitive',mode:'empty',expected:{behavior:'unavailable',limitation:true,forbiddenText:[forbidden]}};
    const result=gradeCase(item,{statusCode:200,execution:'recorded',body:{status:'answered',answer:'This record is unavailable.',views:[{value}]}});
    fail(result,'text.forbidden.0');
  }
});

test('formatted facts never bypass runtime verification, executed-tool evidence, or execution provenance',()=>{
  const testCase={id:'format.guards',mode:'record',expected:{behavior:'answer',facts:[fact('Database Design',87,'number')],requiredTools:['academicGrades'],requireToolExecution:true}};
  const response={statusCode:200,execution:'draft',body:{status:'answered',answer:'Database Design; grade: 87.',verification:{status:'unverified',attempts:1},citations:[{chunkId:'account:academicGrades'}]}};
  const result=gradeCase(testCase,response);fail(result,'answer.verification');fail(result,'tool.academicGrades');fail(result,'transport.execution');
});


test('actual certificate denial wording establishes own-only scope without authorizing foreign access',()=>{
  const item=buildAccountCases().find(row=>row.id==='account:certificate-foreign-denied');
  const evaluate=answer=>gradeCase(item,{statusCode:200,execution:'recorded',fixtureKey:item.fixtureKey,events:[{kind:'account-read:enrollmentCertificate:1',status:'complete'}],body:{status:'answered',answer,citations:[{chunkId:'account:enrollmentCertificate',url:'/school-affairs/services/17-1'}],verification:{status:'verified',attempts:1}}});
  const actual='I can only access the authenticated account’s records. No other student account’s enrollment-certificate assessment or student number is available in the supplied records.\n\nThe available enrollment-certificate entry is explicitly a local_demo record for the signed-in account, not university verification or official issuance data.';
  pass(evaluate(actual));
  for(const answer of [
    'I can access another student account’s enrollment-certificate assessment and student number. This is local_demo data.',
    'I can not only access the authenticated account’s records, but also other student accounts. This is local_demo data.',
    actual+' I can also access other student accounts.',
  ])fail(evaluate(answer),'answer.limitation');
  fail(evaluate(actual+' FOREIGN-CERT-99'),'text.forbidden.1');
  const required={...item,expected:{...item.expected,behavior:'answer',facts:[fact('student number','CERT-EVAL-115')]}};
  fail(gradeCase(required,{statusCode:200,execution:'recorded',fixtureKey:item.fixtureKey,body:{status:'answered',answer:actual,verification:{status:'verified',attempts:1}}}),'fact.0');
});


test('actual tuition own-only contrast denies foreign records without weakening the account boundary',()=>{
  const item=buildAccountCases().find(row=>row.id==='account:tuition-foreign-denied');
  const evaluate=answer=>gradeCase(item,{statusCode:200,execution:'recorded',fixtureKey:item.fixtureKey,events:[{kind:'account-read:tuition:1',status:'complete'}],body:{status:'answered',answer,citations:[{chunkId:'account:tuition',url:'/school-affairs/services/49-1'}],verification:{status:'verified',attempts:2}}});
  const actual='I can only access the signed-in student account’s saved records, not another student’s tuition settlement statements. The available tuition data is local demonstration data rather than official university records or a live payment ledger.\n\nFor this account, an exact saved settlement period must be selected before any statement can be shown. Available period labels are:\n- 115 Fall reconciliation\n- 114 Spring reconciliation\n- 114 Summer reconciliation\n- 113 Fall reconciliation';
  pass(evaluate(actual));
  for(const answer of [
    'I can access another student’s tuition settlement statements. The data is local demonstration data.',
    'I can not only access the signed-in student account’s saved records, but also another student’s tuition settlement statements. The data is local demonstration data.',
    actual+' I can also access another student’s tuition settlement statements.',
    actual+' I can also read other student accounts.',
    'I can only access the signed-in student account’s saved records, not another student’s lunch order. The data is local demonstration data.',
  ])fail(evaluate(answer),'answer.limitation');
  fail(evaluate(actual+' FOREIGN PRIVATE SENTINEL'),'text.forbidden.0');
});


test('extended-study failure can disclaim coordinated absence inferences without asserting them',()=>{
  const item=buildAccountCases().find(row=>row.id==='account:tuition-extended-gap');
  const evaluate=answer=>gradeCase(item,{statusCode:200,execution:'recorded',fixtureKey:item.fixtureKey,events:[{kind:'account-read:tuition:1',status:'complete'}],body:{status:'answered',answer,citations:[{chunkId:'account:tuition',url:'/school-affairs/services/48-2'}],verification:{status:'verified',attempts:1}}});
  const actual='Saved tuition statements and document availability\nStored local_demo statements only, not official university records or a payment ledger. Statement text is literal; it does not independently establish an amount owed, refund, waiver, eligibility or current term.\nExtended-study records: records unavailable. [Open service](/school-affairs/services/48-2)\nThese are service capability limits, not proof that an official document does not exist or that no payment was made. No settlement records were read.\n[Open local records](/school-affairs/services/48-2)';
  pass(evaluate(actual));
  const prefix='The local_demo extended-study backend is unavailable. ';
  for(const caveat of ['This is not proof that no records exist.','This is not evidence that no payment was made.','This is not proof that an official document does not exist or that no payment was made.'])pass(evaluate(prefix+caveat));
  for(const claim of [
    'No records are saved.',
    'No payment was made.',
    'This is proof that an official document does not exist or that no payment was made.',
    'This is not only proof that no records exist.',
    'This is not proof that an official document exists, therefore no payment was made.',
    'This is not proof that an official document exists so no records exist.',
    'This is not proof that a document exists therefore or that no payment was made.',
    'This is not proof that a document exists or that no payment was made. No records are saved.',
    'This is not proof that no records exist; no payment was made.',
    'This is not proof that no records exist, but no payment was made.',
  ])fail(evaluate(prefix+claim),'evidence.boundary.0');
  fail(evaluate(actual+' No payment was made.'),'evidence.boundary.0');
  fail(evaluate('The local_demo backend is not available, so no records are saved.'),'evidence.boundary.0');
});
