import {studentLeaveAssistantPlan,studentLeaveGuestAnswer} from '../../server/studentLeaveAssistantPlan.js';
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {answerDirectoryQuestion} from '../../server/schoolAffairsDirectory.js';
import {campusHelpGuide} from '../../server/campusHelpGuides.js';
import {assistantLanguage} from '../../src/services/assistantLanguage.js';
import {publicProspectusContext} from '../../server/publicProspectusEvidence.js';
import {loadPublicPageContext} from '../../server/publicPageContext.js';

test('local Moodle navigation works without exposing private marks or needing a student snapshot',()=>{
  const answer=answerDirectoryQuestion('How do I open or log in to Moodle?');
  assert.match(answer.answer,/\]\(\/dtm\/login\)/);
  assert.match(answer.answer,/Continue with Google/);
  assert.equal(answer.citations.every(source=>source.url.startsWith('/')),true);
  assert.equal(campusHelpGuide('What are my Moodle grades?'),null);
});
test('multi-system grade directions retain both destinations; unrelated clauses need the planner',()=>{
  const answer=campusHelpGuide('How do I check my grades, including Moodle grades?');
  assert.match(answer.answer,/\/dtm\/grades/);assert.match(answer.answer,/\/school-affairs\/services\/13-1/);
  assert.equal(campusHelpGuide('How do I open Moodle and pay my tuition?'),null);
  assert.equal(campusHelpGuide('How do I open Moodle and what is my next class?'),null);
  assert.equal(campusHelpGuide('My friend told me to check my grades. How do I do that?'),null);
  assert.equal(campusHelpGuide("Do not show my friend's grades; show my own grades instead."),null);
});
test('third-party grade access is a permission question, not a generic grade directory result',()=>{
  for(const question of ["Can I look up a friend's grades?",'Can you get my roommate’s exam score?','我能查別人的成績嗎？']){
    const answer=answerDirectoryQuestion(question);
    assert.ok(answer);assert.match(answer.answer,/authorized|授權/);
    assert.doesNotMatch(answer.answer,/The School Affairs directory lists/);
  }
});
test('English prose with an isolated Chinese menu label keeps English; Chinese and explicit choices remain intact',()=>{
  assert.equal(assistantLanguage('Where is the leave (請假) section?'),'en');
  assert.equal(assistantLanguage('Moodle 要如何登入？'),'zh-Hant');
  assert.equal(assistantLanguage('Where is the leave (請假) section? Reply in Chinese.'),'zh-Hant');
  const answer=answerDirectoryQuestion('Where is the leave (請假) section?');
  assert.match(answer.answer,/Open the student leave form/);
  assert.equal(answer.citations[0].url,'/school-affairs/services/leave');
  const plan=studentLeaveAssistantPlan('Where is the leave (請假) section?','/',[]);
  assert.equal(plan.formNavigation,true);
  assert.match(studentLeaveGuestAnswer(plan,'Where is the leave (請假) section?').answer,/Open School Affairs/);
});
test('source prospectus retrieval is dated, excerpted, and reproducible from original PDF bytes',async()=>{
  const context=publicProspectusContext('What are the IPIAC scholarship rules?');assert.ok(context);
  const metadata=JSON.parse(context.evidence.content);
  const bytes=await readFile(new URL('../../public/source-documents/ipiac-115/prospectus.pdf',import.meta.url));
  assert.equal(metadata.sourceChecksum,createHash('sha256').update(bytes).digest('hex'));
  assert.match(metadata.provenance,/draft/i);assert.equal(metadata.excerptTruncated,true);
  assert.equal(publicProspectusContext('What is my class schedule?'),null);
  assert.equal(context.evidence.url,'/source-documents/ipiac-115/index.html');
});
test('local captured-page reads remain checksum-pinned and accept only the loopback development origin',async()=>{
  const saved={env:process.env.VERCEL_ENV,origin:process.env.STU_LOCAL_CAPTURE_ORIGIN};
  const html='<main><h1>Public source</h1><p>Published opening hours.</p></main>';
  const page={source:'https://www.stu.edu.tw/example/',title:'Example',route:'/example/',file:'/school-pages/0123456789abcdef0123.html',capturedOn:'2026-11-25',checksum:createHash('sha256').update(html).digest('hex')};
  let seen;
  const read=()=>loadPublicPageContext('/example/',Date.now()+10000,{captures:[page],fetchCapture:async url=>{seen=url;return new Response(html)}});
  try{
    process.env.VERCEL_ENV='development';process.env.STU_LOCAL_CAPTURE_ORIGIN='http://127.0.0.1:5173';
    assert.equal((await read()).contentAvailable,true);assert.match(seen,/^http:\/\/127\.0\.0\.1:5173\//);
    process.env.STU_LOCAL_CAPTURE_ORIGIN='http://169.254.169.254:80';await read();assert.match(seen,/^https:\/\/stu\.best\//);
    process.env.VERCEL_ENV='production';process.env.STU_LOCAL_CAPTURE_ORIGIN='http://127.0.0.1:5173';await read();assert.match(seen,/^https:\/\/stu\.best\//);
  }finally{for(const[k,v]of [['VERCEL_ENV',saved.env],['STU_LOCAL_CAPTURE_ORIGIN',saved.origin]])if(v===undefined)delete process.env[k];else process.env[k]=v;}
});

test('a keyword match does not turn a policy or amount question into a generic service list',()=>{
  for(const q of ['What are the requirements for an IPIAC scholarship?','How much is tuition?','What are the requirements for graduation?'])assert.equal(answerDirectoryQuestion(q),null,q);
  assert.ok(answerDirectoryQuestion('Where is the school calendar?'));
});
