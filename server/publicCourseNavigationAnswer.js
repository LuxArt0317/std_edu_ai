import {assistantLanguage} from '../src/services/assistantLanguage.js';
import {permanentCoursesPath} from '../src/features/public/affairs/permanentCourseRouting.js';

/** Navigation facts from the implemented Academic Affairs workspaces, not enrolment evidence. */
export function publicCourseNavigationAnswer(question){
 if(typeof question!=='string'||question.length>2000)return null;
 if(!/\b(?:what courses (?:are|does|can)|courses (?:are )?offered|course offerings|course catalog(?:ue)?)\b|有哪些課程|開設哪些課程|開課查詢/iu.test(question))return null;
 if(/\b(?:my|i am|i'm|enrolled|grades?|assignments?|next class)\b|我的|我已|成績|作業|下一堂/iu.test(question))return null;
 const zh=assistantLanguage(question)==='zh-Hant';
 const destinations=[
  ['/school-affairs/services/12-4',zh?'當期課程查詢':'Course offerings','Search offerings by term, department, instructor or meeting time.'],
  [permanentCoursesPath,zh?'永久課程簡介':'Permanent course descriptions','Read course descriptions; a description alone does not confirm a current offering.'],
  ['/school-affairs/services/12-5',zh?'歷年課程規劃':'Curriculum plans','Check the curriculum for the relevant admission year and program.'],
  ['/school-affairs/services/11-1',zh?'個人歷年選課':'My course selections','Signed-in personal course selections establish what the account is enrolled in, unlike a general catalog.'],
 ];
 const answer=zh?`可以先開啟[當期課程查詢](${destinations[0][0]})，依學期、系所、教師或上課時間找開課。想看課程內容可查[永久課程簡介](${permanentCoursesPath})；想了解入學年度與學制的修課規劃可看[歷年課程規劃](${destinations[2][0]})。自己的選課則在登入後的[個人歷年選課](${destinations[3][0]})。課程簡介或規劃表不代表當期一定開課，也不代表你已選修。你想找哪個系所、哪一學期的課程？`:
  `Start with [Course offerings](${destinations[0][0]}) to search by term, department, instructor or meeting time. For what a course covers, use [Permanent course descriptions](${permanentCoursesPath}); for your program's planned curriculum, use [Curriculum plans](${destinations[2][0]}) and select the admission year and program. Your own enrolments are separate: sign in and open [My course selections](${destinations[3][0]}). A description or curriculum plan does not by itself confirm a current offering or personal enrolment. Which department and term are you interested in?`;
 return {status:'answered',answer,citations:destinations.map(([url,title,claim],i)=>({chunkId:'course-navigation-'+i,title,url,sourceName:'Implemented Academic Affairs workspace',claim,locator:null,effectiveAt:null,reviewedAt:null})),suggestedQuestions:[],grounding:{source:'directory',webSearched:false,checkedAt:new Date().toISOString()},activity:[{kind:'course-navigation',label:'Located course search and curriculum pages',detail:'Distinguished offerings, descriptions, curriculum plans and signed-in course selections. No personal enrolments were inferred.',status:'complete'}]};
}
