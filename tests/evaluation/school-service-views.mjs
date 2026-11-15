import {aidPaymentsPaths} from '../../server/aidPaymentsContract.js';
import {adjustmentPaths} from '../../server/courseAdjustmentContract.js';
import {certificateAwardPath} from '../../server/certificateAwardsContract.js';
import {chargePaymentHistoryPath} from '../../server/chargePaymentContract.js';
import {clubOfficerMenu} from '../../server/clubOfficerContract.js';
import {clubPath} from '../../server/clubServicesContract.js';
import {clubStudentViews} from '../../server/clubStudentContract.js';
import {creditTransferPath} from '../../server/creditTransferContract.js';
import {feeRemissionPath} from '../../server/feeRemissionContract.js';
import {programRegistrationPath} from '../../server/programRegistrationContract.js';
import {courseSubstitutionPath} from '../../src/features/public/affairs/courseSubstitution.js';
import {curriculumMapPath} from '../../src/features/public/affairs/curriculumMaps.js';
import {curriculumPlansPath} from '../../src/features/public/affairs/curriculumPlans.js';
import {repairPaths} from '../../src/features/public/affairs/facilityRepair.js';
import {firstSelectionFeesPath} from '../../src/features/public/affairs/firstSelection.js';
import {parkingInstructionsPath} from '../../src/features/public/affairs/parkingPermits.js';
import {serviceLeadershipPath,serviceLeadershipViews} from '../../src/features/public/affairs/serviceLeadership.js';
import {interdisciplinaryProgramsPath,learningSupportPath,schoolServiceNoteIds,teachingAssistantPath} from '../../src/features/public/affairs/studentServices.js';
import {venuePaths} from '../../src/features/public/affairs/venueContract.js';

const exchangeGrantPath='/school-affairs/services/23-1';
const views=(path,names)=>names.map(name=>path+'/'+name);

// Signed-in views mounted by SchoolAffairsPortal beyond the service catalog
// links. Fixed published selectors use representative existing records. Private
// detail IDs are bound by the renderer's disposable fixture configuration.
export const schoolServiceViews=[
  ...views(adjustmentPaths.late_add,['entry','notice','fees']),
  adjustmentPaths.summer+'/notice',firstSelectionFeesPath,creditTransferPath+'/history',
  ...views(programRegistrationPath,['register','progress/PU002']),
  ...views(curriculumPlansPath,['program/6','program/6/archive','plan/115101']),
  interdisciplinaryProgramsPath+'/program/PU002',
  ...views(curriculumMapPath+'/program/1',['courses','career','competencies']),curriculumMapPath+'/program/1',
  courseSubstitutionPath+'/results/110/1/01',
  ...views(exchangeGrantPath,['conference','exchange','reports','conference/application','notes']),
  feeRemissionPath+'/notes',learningSupportPath+'/review',teachingAssistantPath+'/evaluation',
  chargePaymentHistoryPath,chargePaymentHistoryPath+'?page=:page',
  ...clubStudentViews.filter(view=>view!=='my-attendance').map(view=>clubPath+'/'+view),
  ...views(clubPath,['activities','equipment/review','officer/new','officer/review']),
  ...clubOfficerMenu.map(([path])=>clubPath+'/'+path),
  parkingInstructionsPath,...serviceLeadershipViews.map(view=>serviceLeadershipPath+'/'+view.key),
  repairPaths.report+'/area/AR0500',repairPaths.history,repairPaths.history+'/:id',
  repairPaths.manage,repairPaths.manage+'/:id',venuePaths.manage,
  ...views('/school-affairs/services/29-1',['consent','appointments','queue']),
  ...views(certificateAwardPath,['overview','catalog','record/:id']),aidPaymentsPaths.salary,
  ...schoolServiceNoteIds.map(id=>'/school-affairs/services/'+id+'/notes'),
];

// These exact pages show a blocking notice and require acknowledgement before
// their parent workspace becomes interactive. They keep their own route proof.
export const schoolServiceNotices=[
  {route:teachingAssistantPath+'/report',resultingRoute:teachingAssistantPath,title:'目前無法開啟學習單。'},
  {route:exchangeGrantPath+'/receipts',resultingRoute:exchangeGrantPath,title:'目前沒有可列印的印領清冊。'},
];
