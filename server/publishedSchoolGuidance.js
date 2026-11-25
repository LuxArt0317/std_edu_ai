import {publicDtmSubmissionGuide} from './publicDtmSubmissionGuide.js';
import {publicMapAnswer} from './publicMapAnswer.js';
import {publicCourseNavigationAnswer} from './publicCourseNavigationAnswer.js';
import {publicCalendarDatesAnswer,publicCalendarEventsAnswer} from './publicCalendarDatesAnswer.js';
import {publicDormWirelessAnswer} from './publicDormWirelessAnswer.js';
import {publicCalendarAnswer} from './publicCalendarAnswer.js';
import {publicPaymentAnswer} from './publicPaymentAnswer.js';
import {publicTuitionAnswer} from './publicTuitionAnswer.js';
/** Shared across guest and signed-in routes, before any personal record lookup. */
export function publishedSchoolGuidance(question){
 return publicDtmSubmissionGuide(question)||publicDormWirelessAnswer(question)||publicCalendarDatesAnswer(question)||publicCalendarEventsAnswer(question)||publicCourseNavigationAnswer(question)||publicMapAnswer(question)||publicCalendarAnswer(question)||publicPaymentAnswer(question)||publicTuitionAnswer(question);
}
