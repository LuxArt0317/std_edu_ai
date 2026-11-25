import {isPublicGraduationAttendanceQuestion} from './publicAcademicRulesEvidence.js';
import {isPublicLearningResourceQuestion} from './publicLearningResources.js';
import {isPublicOfficeDirectionsQuestion} from './publicOfficeDirections.js';
import {isPublicContactDirectoryQuestion} from './publicContactDirectoryEvidence.js';
import {isPublicFacultyTrainingQuestion} from './publicFacultyTrainingEvidence.js';
import {isPublicStaffParkingQuestion} from './publicStaffParkingEvidence.js';
import {repairQuestion} from '../src/features/public/affairs/facilityRepair.js';
import {publicPageForRoute} from './publicPageContext.js';

/** Public guidance remains public after sign-in; compound account work stays private. */
export function isAdditionalPublicGuidanceQuestion(question){
 if(typeof question!=='string'||question.length>2000)return false;
 const text=question.normalize('NFKC');
 if(/\b(?:another student|someone else(?:'s)?|their (?:grades|records|balance)|his (?:grades|records)|her (?:grades|records))\b|其他學生|其他学生|他人的/iu.test(text))return false;
 if(/\b[\p{L}\p{N}_-]+['’]s\s+(?:grades?|transcripts?|records?|balances?|assignments?|attendance|profile|inbox)\b|(?:同學|同学|室友|他人).{0,12}的(?:成績|成绩|紀錄|记录|作業|作业|信箱)/iu.test(text))return false;
 if(/\b(?:my|our)\b[^.!?;\n]{0,60}\b(?:grades?|credits?|attendance|records?|assignments?|subjects?|courses?|class(?:es)?|schedules?|timetables?|enrollments?|balance|tuition|payments?|appointments?|requests?|tickets?|permits?|applications?|status|history|profile|email|inbox)\b|我的[^。！？；\n]{0,30}(?:成績|成绩|學分|学分|出席|紀錄|记录|作業|作业|課程|课程|課表|课表|選課|选课|餘額|余额|學費|学费|預約|预约|申請|申请|狀態|状态|車證|车证|個人資料|个人资料|信箱|郵件|邮件)/iu.test(text))return false;
 if(/\b(?:my|our)\s+(?:(?:current|saved|pending|past|upcoming|approved)\s+)?(?:grades?|credits?|attendance|records?|assignments?|subjects?|courses?|balance|tuition|payments?|appointments?|requests?|tickets?|permits?|applications?|status|history)\b|\b(?:have i|did i|am i (?:registered|enrolled|approved|eligible))\b|我的(?:成績|學分|出席|紀錄|作業|課程|餘額|學費|預約|申請|狀態|車證)/iu.test(text))return false;
 if(/\b(?:submit|file|create|cancel|delete|update|change|register|enroll|apply|book)\b.{0,40}\b(?:for me|on my behalf)\b|\b(?:submit|file|create|cancel|delete|update|register|enroll|book)\s+my\b|幫我|帮我|代我/iu.test(text))return false;
 if(/^\s*(?:please\s+)?(?:submit|file|create|cancel|delete|update|change|register|enroll|apply|book)\b|^(?:請)?(?:送出|提交|取消|刪除|修改|申請)/iu.test(text))return false;
 const repairGuide=repairQuestion(text)==='report'&&/\b(?:how (?:do|can|should|to)|where (?:do|can|should|to)|where (?:is|are))\b|如何|怎麼|哪裡|在哪/iu.test(text)
  &&!/立即送出|直接送出/iu.test(text);
 return repairGuide||isPublicGraduationAttendanceQuestion(text)||isPublicLearningResourceQuestion(text)||isPublicOfficeDirectionsQuestion(text)||isPublicContactDirectoryQuestion(text)||isPublicFacultyTrainingQuestion(text)||isPublicStaffParkingQuestion(text);
}
export function additionalPublicGuidanceRoute(route){
 if(typeof route!=='string'||route.length>2000||/[?#]/u.test(route))return '/';
 return publicPageForRoute(route)?route:'/';
}
