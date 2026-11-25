import test from 'node:test';
import assert from 'node:assert/strict';
import {isPublicClubQuestion,isPublicClubRecommendationQuestion} from './publicClubIntent.js';
import {isPublicAdmissionLanguageQuestion} from './publicAdmissionLanguageIntent.js';
import {publicProspectusContext} from './publicProspectusEvidence.js';

test('club suggestions do not require personal membership access',()=>{
 assert.equal(isPublicClubRecommendationQuestion('Which clubs would improve my skills?'),true);
 assert.equal(isPublicClubQuestion('Recommend clubs for my music interests'),true);
 for(const question of ['What clubs have I joined?','Show my club records','What is my club membership status?','我的社團學分有多少？'])assert.equal(isPublicClubQuestion(question),false,question);
});
test('public admission language questions do not establish personal eligibility',()=>{
 assert.equal(isPublicAdmissionLanguageQuestion('Do international students need Mandarin to enroll?'),true);
 for(const question of ['What is my English certificate score?','Am I eligible for admission with my Mandarin result?','What is my application status?'])assert.equal(isPublicAdmissionLanguageQuestion(question),false,question);
});
test('language retrieval selects admission and scholarship sections from the existing cohort source',()=>{
 const context=publicProspectusContext('Do international students need Mandarin to enroll?');
 const metadata=JSON.parse(context.evidence.content);
 assert.match(metadata.excerpt,/CEFR/);assert.match(metadata.excerpt,/A2/);
 assert.match(metadata.coverage,/115-entry draft/);
 assert.equal(metadata.selectedPages.length,3);
 assert.equal(publicProspectusContext('What is my English certificate score?'),null);
});
