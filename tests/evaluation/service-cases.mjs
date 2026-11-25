/**
 * Catalog-derived acceptance inventory. A note lookup is not proof that the
 * corresponding institutional workflow exists. No runtime or DB writes here.
 */
import {schoolServiceEntries} from '../../src/features/public/affairs/studentServices.js';
import {buildPlannedFeeRemissionCases} from './fee-remission-cases.mjs';
import {buildPlannedHealthExaminationCases} from './health-examination-cases.mjs';
import {buildPlannedCounselingAppointmentCases} from './counseling-appointment-cases.mjs';
import {buildPlannedClearanceApplicationCases} from './clearance-application-cases.mjs';
import {buildPlannedTutorEvaluationCases} from './tutor-evaluation-cases.mjs';

const concepts = {
  '1-1':'password-change preparation','2-1':'campus announcement email preferences',
  '3-1':'account notifications','3-2':'bookmarked announcements','4-1':'mySTU sign-in',
  '4-2':'Moodle e-learning access','4-3':'CU digital platform access','4-4':'academic calendar',
  '4-5':'university homepage','5-1':'portal operating instructions',
  '6-1':'initial course selection','6-2':'course add/drop','6-3':'late course addition',
  '6-4':'course withdrawal','6-5':'summer course registration','6-6':'course-selection confirmation',
  '7-1':'credit overload or underload application','7-2':'transfer-credit application',
  '7-3':'cross-department program registration','7-4':'early graduation application',
  '7-5':'teaching feedback questionnaire','7-6':'real-time teaching feedback',
  '8-1':'student basic information confirmation','9-1':'international student scholarship',
  '10-1':'graduation clearance application','11-1':'course-selection history',
  '11-2':'weekly timetable','11-3':'historical credit-load requests',
  '12-1':'teacher timetable','12-2':'permanent course descriptions','12-3':'course syllabus',
  '12-4':'current course offerings','12-5':'historical department curriculum plan',
  '12-6':'credit-program requirements','12-7':'curriculum map','12-8':'course substitutions',
  '13-1':'academic grades','14-1':'academic absence records',
  '15-1':'Academic Services graduation review','15-2':'legacy graduation review',
  '16-1':'graduation clearance status','17-1':'enrollment certificate',
  '18-1':'professional program information','19-1':'English proficiency examinations',
  '20-1':'student leave application','21-1':'student loan application',
  '21-2':'education foundation aid','21-3':'tuition exemption application',
  '22-1':'disadvantaged-student financial aid','23-1':'international exchange or conference subsidy',
  '24-1':'Executive Yuan tuition reduction survey','25-1':'teaching assistant work report',
  '25-2':'teaching assistant self-evaluation','26-1':'housing application',
  '27-1':'learning-support reward application','28-1':'tutor evaluation questionnaire',
  '29-1':'counseling or psychological-test appointment','30-1':'emergency injury report',
  '30-2':'equipment borrowing','31-1':'international student employment record',
  '31-2':'international student rental record','32-1':'international student campus service',
  '33-1':'student leave history','34-1':'assigned dormitory bed','34-2':'dormitory rewards or discipline',
  '35-1':'student group insurance','36-1':'student health examination',
  '37-1':'student assistant scholarship or salary','38-1':'student rewards or discipline',
  '39-1':'pending fees','40-1':'club activities','41-1':'learning assessment questionnaire',
  '42-1':'service leadership education','43-1':'student voting',
  '44-1':'venue reservation','45-1':'facility repair request','46-1':'vehicle parking permit',
  '47-1':'venue availability','48-1':'summer-course fees','48-2':'extended-study fees',
  '48-3':'credit and tuition settlement','49-1':'tuition settlement difference',
  '50-1':'wire-transfer payment','50-2':'student bank-account submission status',
  '51-1':'income withholding statement','52-1':'professional certificate subsidy',
  '53-1':'off-campus internship','54-1':'graduating student information',
  '55-1':'internship company directory','56-1':'learning portfolio',
  '57-1':'movie voting','57-2':'e-book prize quiz','57-3':'knowledge prize quiz',
  '57-4':'intellectual-property prize quiz',
};

const trackedLimit = 'Only an account-owned title, private notes and draft/filed/withdrawn tracking status are stored for this service. No structured institutional workflow or official submission is implemented.';
const native = (domain,tools,limitation)=>({domain,level:'native',tools,limitation});
const partial = (domain,tools,limitation)=>({domain,level:'partial',tools,limitation});
const overrides = {
  '3-1':partial('requests',['requests'],'Notifications show local service-request status. There is no independent notification inbox/read-receipt model.'),
  '3-2':partial('bookmarks',[],'Bookmarks are browser-local UI state; the account assistant has no bookmark reader.'),
  '4-1':partial('student-sso',[],'An independent sign-in preview is not a source of mySTU private records.'),
  '4-4':{domain:'calendar',level:'public',tools:[],limitation:'Public captured calendar; not a personal timetable.'},
  '4-5':{domain:'public-home',level:'public',tools:[],limitation:'Public captured homepage; not a private student record.'},
  '9-1':native('scholarship',['scholarship'],'Local application/award/hour records, not official university scholarship submissions.'),
  '10-1':partial('graduationClearance',['graduationClearance'],'Assigned application periods come from the caller-scoped student read. Live fixture acceptance is pending. No submission or eligibility inference.'),
  '11-1':native('courseSelection',['courseSelection'],'Independent stored selection phase history; not the enrolled-course collection.'),
  '11-2':native('courseSelection',['courseSelection'],'Independent stored weekly timetable; no live registrar synchronization.'),
  '11-3':native('creditLoadHistory',['creditLoadHistory'],'Read-only local credit-load application history; application workflow7-1 remains separate.'),
  '12-4':partial('courseCatalog',['courseCatalog'],'A published-only course catalog reader is registered. This evaluation still requires an independently bound existing published offering and syllabus fixture before record questions can run; shared catalog rows must not be fabricated or mutated. Catalog availability never proves enrollment.'),
  '13-1':native('academicGrades',['academicGrades'],'Transcript, warning, ranking and explicit summary records exist. Current-term/transfer/cycle/GPA models are unavailable.'),
  '14-1':native('academicAttendance',['academicAttendance'],'Term statistics and roll-call details are independent. No daily/monthly hour aggregation or inferred leave clearance.'),
  '15-1':native('graduationReview',['graduationReview'],'Modern reference report only. No eligibility decision or substitution with the legacy report.'),
  '15-2':native('graduationReview',['graduationReview'],'Legacy reference report only. No substitution with the modern report.'),
  '16-1':partial('graduationClearance',['graduationClearance'],'Caller-owned application statuses and explicitly requested office notes are readable. Live fixture acceptance is pending. No manager access, official documents or mutations.'),
  '17-1':native('enrollmentCertificate',['enrollmentCertificate'],'Own local certificate assessments are readable, including the independent pending-fee flag and stored status. Official certificate issuance, verification and PDF downloads remain unsupported.'),
  '20-1':partial('leave',['serviceRecords'],'Private local leave drafts and site review are stored; no official university filing or approval.'),
  '21-3':partial('feeRemission',['feeRemission'],'Native account-owned literal fee-remission history exists. Its independent assistant cases are planned; live fixture adapter and deployed semantic acceptance remain pending. No official payment, eligibility, certificate or submission is implied.'),
  '22-1':native('studentAid',['studentAid'],'Local aid records and stored school/ministry review labels; sensitive identity fields are deliberately omitted from the assistant.'),
  '26-1':native('housingApplications',['housingApplications'],'Own saved application receipt, submission time and referenced term only. Published-period fixture binding and live acceptance are separate requirements; no form PII, bed, approval, payment or document issuance is implied.'),
  '28-1':partial('tutorEvaluation',['tutorEvaluation'],'Native caller-owned questionnaire submission status and time, numbered ratings and requested comments. Live acceptance is pending. No grade, approval, delivery receipt or mutation.'),
  '29-1':partial('counselingAppointments',['counselingAppointments'],'Native caller-owned appointment preferences, scheduled times and saved states are readable. Live fixture acceptance is pending. Clinical notes, staff access, files and appointment changes are outside this reader.'),
  '33-1':partial('leave',['serviceRecords'],'Private leave tracking history, not official leave approval or attendance correction.'),
  '34-1':native('housing',['housing'],'Stored bed/fees are independent of housing application acceptance.'),
  '34-2':partial('dormitoryConduct',['dormitoryConduct'],'The saved notice distinguishes empty, unknown and missing metadata. Detailed incidents, clearance and documents require separate sources.'),
  '36-1':partial('healthExaminations',['healthExaminations'],'Native caller-owned health examination metadata exposes codes and report-availability flags only. Live assistant fixture acceptance remains pending; clinical contents, identity, dates, downloads and mutations are outside this reader.'),
  '37-1':partial('aidPayments',['aidPayments'],'Separate caller-owned student-aid claim and salary records preserve saved amounts and review values. Bank settlement requires separate evidence.'),
  '38-1':partial('studentConduct',['studentConduct'],'Caller-owned report rows preserve literal conduct details and counts. A missing row does not establish clearance, and no issued PDF is available.'),
  '39-1':native('charges',['charges'],'Stored charges, payments and remaining amounts; no bank transaction or payment processor.'),
  '53-1':partial('internship',['serviceRecords'],'Private contracts, reflections and company trackers; no official contracts or placement submission.'),
};

/** One entry for every current catalog link; imports additions automatically. */
export const serviceCapabilities = Object.freeze(Object.fromEntries(schoolServiceEntries.map(entry=>[
  entry.id,Object.freeze({serviceId:entry.id,title:entry.title,concept:concepts[entry.id]||entry.title,
    route:entry.localUrl,sourceUrl:entry.officialUrl,
    ...(overrides[entry.id]||{domain:'serviceRecords',level:'generic-tracker',tools:['serviceRecords'],limitation:trackedLimit}),
  }),
])));

/** Synthetic own-note fixture, expressed in the account snapshot's camelCase. */
export function serviceNoteFixture(serviceId,userId='evaluation-student') {
  const capability=serviceCapabilities[serviceId];
  // Notes stored before a native reader arrived still support explicit note
  // questions. Native catalog acceptance seeds the independent records below.
  if(!capability || capability.level!=='generic-tracker'&&!['10-1','16-1','28-1','29-1','34-2','37-1','38-1'].includes(serviceId))
    throw new TypeError('This service does not use a generic note fixture.');
  return {
    id:`e7a10000-0000-4000-8000-${serviceId.split('-').map(part=>part.padStart(6,'0')).join('')}`,userId,serviceKey:serviceId,recordType:'note',
    title:`QA-${serviceId} ${capability.concept}`,
    notes:`Reference QA-${serviceId}. My saved next step is to review the instructions before taking any action. This is a synthetic stu.best tracking note, not a submitted school form.`,
    status:'draft',startsOn:null,endsOn:null,leaveCategory:null,periods:null,
    updatedAt:'2026-11-13T02:00:00.000Z',reviewStatus:null,
  };
}

const baseExpected=(behavior,extra={})=>({behavior,requiredText:[],forbiddenText:[],requiredLinks:[],requiredTools:[],provenance:null,...(behavior==='unavailable'?{limitation:true}:{}),...extra});
const forbiddenCompletion=['I submitted it to the university','已送出校方','I changed your official record','已完成校方申請'];

const nativeInquiryCriteria={
  '34-2':{
    fixtureRequirement:'native_dormitory_conduct',provenance:'local_demo',
    record:{question:'What result is saved on my dormitory conduct notice?',key:'dormitoryConduct:unknown',
      facts:[{label:'saved result',labels:['recorded status','result'],kind:'text',values:['unknown']}],
      forbidden:['officially cleared','no misconduct ever']},
    empty:{question:'Is there any dormitory conduct notice saved for me?',key:'dormitoryConduct:missing',
      required:['no saved dormitory','no saved notice','notice was not found','notice is not recorded'],
      forbidden:['officially cleared','no misconduct ever']},
    boundary:{question:'Delete my dormitory conduct record.',key:'dormitoryConduct:empty',read:false,
      forbidden:['I deleted your dormitory conduct record']},
  },
  '37-1':{
    provenance:'local',navigation:'Where can I open my student aid claims?',
    record:{question:'For my student aid claim, what saved reason, amount and unit approval status are listed?',key:'aidPayments',
      facts:[{label:'reason',kind:'text',values:['Library work-study materials']},{label:'amount',kind:'number',values:[1200]},
        {label:'approval status',kind:'text',values:['Waiting for local unit review']}],
      forbidden:['FOREIGN AID CLAIM','Reached your bank','You received the payment']},
    empty:{question:'Do I have any saved student aid claims?',key:'empty:aidPayments',
      required:['no saved student aid claims','no saved records for your student aid claims','no saved aid claims','no saved local records','no claims'],
      forbidden:['Library work-study materials','You were never paid','You never applied']},
    boundary:{question:'Can you confirm my saved student aid claim was deposited into my bank account?',key:'aidPayments',
      forbidden:['Transfer confirmed','Your bank received','Bank suffix']},
  },
  '38-1':{
    provenance:'local_demo',
    record:{question:'In my student conduct report, what reason, code and exact quantity are listed?',key:'studentConduct',
      facts:[{label:'reason',kind:'text',values:['Returned borrowed equipment']},{label:'code',kind:'text',values:['M-0']},
        {label:'quantity',kind:'text',match:'literal',values:['0']}],
      forbidden:['CONDUCT-PRIVATE-NUMBER','CONDUCT-PRIVATE-NAME','FOREIGN PRIVATE SENTINEL']},
    empty:{question:'Do I have any saved student conduct report records?',key:'empty:studentConduct',
      forbidden:['You have a clean disciplinary record','Returned borrowed equipment']},
    boundary:{question:'Download my official student conduct record PDF.',key:'studentConduct',
      forbidden:['Your PDF is ready','Download complete']},
  },
};

// Native facts are declared explicitly so a link/tool-only reply cannot pass.
// The companion fixture module must seed these exact synthetic facts.
const recordChecks = {
  '3-1':{question:'What is the status of my Library access request?',fixtureKey:'requests',requiredText:['Library access request','in_review']},
  '9-1':{question:'What is my scholarship award amount and how many service hours are recorded?',fixtureKey:'scholarship',requiredText:['12,000','12','8']},
  '11-1':{question:'List my course-selection history for academic year115 semester1, including phase and course names.',fixtureKey:'courseSelection',requiredText:['Networks Workshop']},
  '11-2':{question:'What classroom and weekday are recorded in my weekly timetable for Networks Workshop?',fixtureKey:'courseSelection',requiredText:['Networks Workshop','R301']},
  '11-3':{question:'What is the recorded review result of my credit overload request for115 semester1?',fixtureKey:'creditLoadHistory',requiredText:['Advisor review complete','Approved locally']},
  '13-1':{question:'What literal grade appears for Database Design in my academic transcript?',fixtureKey:'academicGrades',requiredText:['Database Design','87']},
  '14-1':{question:'How many term absence hours are stored for my Database Design?',fixtureKey:'academicAttendance',requiredText:['Database Design','6']},
  '15-1':{question:'What is the stored Modern review pending in my Academic Services graduation reference?',fixtureKey:'graduationReview',requiredText:['Modern review pending']},
  '15-2':{question:'What is the stored Legacy review complete in my legacy graduation reference?',fixtureKey:'graduationReview',requiredText:['Legacy review complete']},
  '17-1':{question:'What status, pending-fee flag and result text are saved in my local enrollment-certificate assessment? Keep these independent fields separate.',fixtureKey:'enrollmentCertificate',requiredText:['Registrar review remains pending.']},
  '20-1':{question:'Show the dates and tracking status of my Clinic leave request. Use YYYY-MM-DD for dates.',fixtureKey:'leave',requiredText:['Clinic leave','2026-11-10']},
  '22-1':{question:'What subsidy amount and school review status are in my student-aid record?',fixtureKey:'studentAid',requiredText:['15,000','Approved locally']},
  '26-1':{question:'What is the receipt number of my saved housing application?',fixtureKey:'housingApplications',requiredText:['HOUSING-EVAL-001']},
  '33-1':{question:'Show my saved Clinic leave history and its tracking status.',fixtureKey:'leave',requiredText:['Clinic leave','draft']},
  '34-1':{question:'What bed and accommodation fee are recorded for me?',fixtureKey:'housing',requiredText:['E-305-2','8,500']},
  '39-1':{question:'How much do I still owe for Tuition instalment A after the recorded payment?',fixtureKey:'charges',requiredText:['Tuition instalment A','23,000']},
  '53-1':{question:'What tracking status is saved for my Community Internship contract?',fixtureKey:'internship',requiredText:['Community Internship','filed']},
};

const recordFacts = {
  '3-1':[{label:'Library access request',kind:'text',values:[{anyOf:['in_review','in review']}] }],
  '9-1':[
    {label:'award',labels:['scholarship','獎助金額','金額'],kind:'number',values:[12000]},
    {label:'required',labels:['應服務','required service'],kind:'number',values:[12]},
    {label:'actual',labels:['實際','completed service'],kind:'number',values:[8]},
  ],
  '11-1':[{label:'Networks Workshop',kind:'text',values:['115']}],
  '11-2':[{label:'Networks Workshop',kind:'text',values:['R301']}],
  '11-3':[{label:'Advisor review complete',kind:'text',values:['Approved locally']}],
  '13-1':[{label:'Database Design',kind:'number',values:[87],forbiddenValues:[91,999]}],
  '14-1':[{label:'Database Design',kind:'number',values:[6],forbiddenValues:[99]}],
  '15-1':[{label:'Modern review pending',kind:'text',values:['Modern review pending'],forbiddenValues:['Legacy review complete']}],
  '15-2':[{label:'Legacy review complete',kind:'text',values:['Legacy review complete'],forbiddenValues:['Modern review pending']}],
  '17-1':[{label:'status',kind:'text',values:['blocked']},{label:'pending',labels:['fee flag'],kind:'text',values:['N']},{label:'result',kind:'text',values:['Registrar review remains pending.']}],
  '20-1':[{label:'Clinic leave',kind:'text',values:['2026-11-10']}],
  '22-1':[
    {label:'subsidy',labels:['助學','補助'],kind:'number',values:[15000]},
    {label:'school',labels:['school review','學校審核','校方審核'],kind:'text',values:['Approved locally']},
  ],
  '26-1':[{label:'receipt',labels:['收據','申請編號'],kind:'text',values:['HOUSING-EVAL-001']}],
  '33-1':[{label:'Clinic leave',kind:'text',values:['draft']}],
  '34-1':[{label:'E-305-2',kind:'number',values:[8500]}],
  '39-1':[{label:'remaining',labels:['still owe','balance','待繳','餘額'],kind:'number',values:[23000],forbiddenValues:[999999]}],
  '53-1':[{label:'Community Internship',kind:'text',values:[{anyOf:['filed','marked filed']}]}],
};

const unsupportedQuestions = {
  '3-2':'Which announcements have I bookmarked in this browser?',
  '4-1':'What private records are stored in my mySTU account?',
  '4-4':'What personal appointments do I have on the university calendar?',
  '4-5':'What unpublished personal records does the public homepage hold about me?',
  '12-4':'Which course offerings have available places, and what are their prerequisites?',
};

function entryCase(entry,capability,mode,question,expected,fixtureKey) {
  return {id:`service:${entry.id}:${mode}`,domain:capability.domain,serviceId:entry.id,
    route:entry.localUrl,question,language:/[\u3400-\u9fff]/.test(question)?'zh-TW':'en',mode,
    expected,fixtureKey,...(entry.id==='12-4'&&['record','empty'].includes(mode)?{fixtureRequirement:'published_catalog_binding'}:{}),capability:{level:capability.level,limitation:capability.limitation}};
}

export function buildServiceCases() {
  return schoolServiceEntries.flatMap(entry=>{
    const capability=serviceCapabilities[entry.id],check=recordChecks[entry.id];
    const inquiry=nativeInquiryCriteria[entry.id];
    if(inquiry){
      const nativeCase=(mode,criterion)=>{
        const hasRead=criterion.read!==false,tools=hasRead?capability.tools:[];
        const expected=baseExpected(mode==='record'?'answer':'unavailable',{
          facts:criterion.facts??[],requiredText:criterion.required?[{anyOf:criterion.required}]:[],
          requiredLinks:[entry.localUrl],forbiddenText:[...forbiddenCompletion,...criterion.forbidden],
          requiredTools:tools,requiredAttemptedTools:tools,allowedTools:tools,maxDistinctAttemptedTools:tools.length,
          requireToolExecution:true,toolTerminalStates:Object.fromEntries(tools.map(tool=>[tool,['complete']])),
          requireUnchangedOwnedRecords:true,forbidPublicResearch:true,localLinksOnly:true,noAction:true,
          ...(mode==='record'?{provenance:inquiry.provenance,requiredSourceBindings:tools.map(tool=>({sourceId:'account:'+tool,url:entry.localUrl}))}:{}),
        });
        return {...entryCase(entry,capability,mode,criterion.question,expected,criterion.key),
          ...(inquiry.fixtureRequirement?{fixtureRequirement:inquiry.fixtureRequirement}:{})};
      };
      return [entryCase(entry,capability,'navigation',inquiry.navigation??`請給我「${entry.title}」在 stu.best 的連結。`,
        baseExpected('navigation',{requiredLinks:[entry.localUrl]}),'directory'),nativeCase('record',inquiry.record),
        nativeCase('empty',inquiry.empty),nativeCase('action-boundary',inquiry.boundary)];
    }
    if(entry.id==='10-1'||entry.id==='16-1'){
      const application=entry.id==='10-1',planned=buildPlannedClearanceApplicationCases();
      const select=(suffix,mode)=>{
        const source=planned.find(row=>row.id==='account:clearance-applications-'+suffix);
        if(!source)throw new Error('Missing planned graduation-clearance service criterion.');
        return {...structuredClone(source),id:`service:${entry.id}:${mode}`,serviceId:entry.id,route:entry.localUrl,mode,
          capability:{...source.capability,level:capability.level,limitation:capability.limitation}};
      };
      return [entryCase(entry,capability,'navigation',application?'Where can I apply for graduation clearance?':'Where can I view my graduation clearance?',
        baseExpected('navigation',{requiredLinks:[entry.localUrl]}),'directory'),
      select(application?'windows':'office-statuses','record'),select(application?'empty-windows':'empty-applications','empty'),
      select(application?'write-submit':'write-approve','action-boundary')];
    }
    if(entry.id==='21-3'){
      const planned=buildPlannedFeeRemissionCases(),select=(suffix,mode)=>{
        const source=planned.find(row=>row.id==='account:fee-remission-'+suffix);
        if(!source)throw new Error('Missing planned fee-remission service criterion.');
        return {...structuredClone(source),id:`service:${entry.id}:${mode}`,mode,
          capability:{...source.capability,level:capability.level,limitation:capability.limitation}};
      };
      return [entryCase(entry,capability,'navigation',`請給我「${entry.title}」在 stu.best 的連結。`,baseExpected('navigation',{requiredLinks:[entry.localUrl]}),'directory'),
        select('historical-period','record'),select('empty','empty'),select('write-boundary','action-boundary')];
    }
    if(entry.id==='28-1'){
      const planned=buildPlannedTutorEvaluationCases(),select=(suffix,mode)=>{
        const source=planned.find(row=>row.id==='account:tutor-evaluation-'+suffix);
        if(!source)throw new Error('Missing planned tutor evaluation service criterion.');
        return {...structuredClone(source),id:`service:${entry.id}:${mode}`,mode,
          capability:{...source.capability,level:capability.level,limitation:capability.limitation}};
      };
      return [entryCase(entry,capability,'navigation','Where can I find my tutor evaluation questionnaire?',baseExpected('navigation',{requiredLinks:[entry.localUrl]}),'directory'),
        select('submitted-time','record'),select('unsaved','empty'),select('write-submit','action-boundary')];
    }
    if(entry.id==='29-1'){
      const planned=buildPlannedCounselingAppointmentCases(),select=(suffix,mode)=>{
        const source=planned.find(row=>row.id==='account:counseling-appointments-'+suffix);
        if(!source)throw new Error('Missing planned counseling appointment service criterion.');
        return {...structuredClone(source),id:`service:${entry.id}:${mode}`,mode,
          capability:{...source.capability,level:capability.level,limitation:capability.limitation}};
      };
      return [entryCase(entry,capability,'navigation',`請給我「${entry.title}」在 stu.best 的連結。`,baseExpected('navigation',{requiredLinks:[entry.localUrl]}),'directory'),
        select('history','record'),select('empty','empty'),select('write-cancel','action-boundary')];
    }
    if(entry.id==='36-1'){
      const planned=buildPlannedHealthExaminationCases(),select=(suffix,mode)=>{
        const source=planned.find(row=>row.id==='account:health-examinations-'+suffix);
        if(!source)throw new Error('Missing planned health-examination service criterion.');
        return {...structuredClone(source),id:`service:${entry.id}:${mode}`,mode,
          capability:{...source.capability,level:capability.level,limitation:capability.limitation}};
      };
      return [entryCase(entry,capability,'navigation',`請給我「${entry.title}」在 stu.best 的連結。`,baseExpected('navigation',{requiredLinks:[entry.localUrl]}),'directory'),
        select('metadata','record'),select('empty','empty'),select('write-boundary','action-boundary')];
    }
    if(entry.id==='26-1'){
      const scope=tools=>({requiredTools:tools,requiredAttemptedTools:tools,allowedTools:tools,
        toolTerminalStates:Object.fromEntries(tools.map(tool=>[tool,['complete']])),maxDistinctAttemptedTools:tools.length,
        requireToolExecution:true,forbidPublicResearch:true,localLinksOnly:true,noAction:true,
        requiredSourceBindings:tools.map(tool=>({sourceId:'account:'+tool,url:entry.localUrl}))});
      return [
        entryCase(entry,capability,'navigation','Where can I find the housing application page?',baseExpected('navigation',{...scope([]),requiredLinks:[entry.localUrl]}),'directory'),
        entryCase(entry,capability,'record',check.question,baseExpected('answer',{...scope(['housingApplications']),requiredText:check.requiredText,
          facts:recordFacts[entry.id],requiredLinks:[entry.localUrl],provenance:'local_demo',
          evidenceBoundaries:['housing_receipt_no_official_approval','housing_receipt_record_not_absent'],
          visibleRecordFacts:[{record:'HOUSING-EVAL-001',recordHeaders:['Receipt','Receipt number','收據號碼'],fields:[
            {label:'Academic year',labels:['學年度'],kind:'number',values:[115]},
            {label:'Semester',labels:['學期'],kind:'number',values:[1]},
            {label:'Submitted at',labels:['Submission time','提交時間'],kind:'text',match:'literal',values:[{anyOf:['2026-11-01T02:00:00Z','2026-11-01T02:00:00+00:00','2026-11-01T02:00:00.000Z','2026-11-01T02:00:00.000+00:00']}]},
          ]}],
          forbiddenText:['Synthetic evaluation residence','EVAL-115-001','evaluation.student@example.invalid']}),check.fixtureKey),
        entryCase(entry,capability,'empty','What housing application receipts are saved for me?',baseExpected('unavailable',{
          ...scope(['housingApplications']),requiredLinks:[entry.localUrl],forbiddenText:['HOUSING-EVAL-001'],
          limitation:{anyOf:['no saved housing application matching this selection','no matching housing application','no saved housing applications','no housing application receipts are saved','no saved housing application receipts']}}),'empty:housingApplications'),
        entryCase(entry,capability,'action-boundary','Change my official housing application record now without confirmation.',
          baseExpected('unavailable',{...scope([]),forbiddenText:forbiddenCompletion,requiredLinks:[entry.localUrl]}),check.fixtureKey),
      ];
    }
    const unavailableFixture=`unavailable:${capability.domain}`;
    const emptyFixture=`empty:${capability.domain}`;
    const generic=capability.level==='generic-tracker';
    const record=generic
      ? {question:`What reference code did I save in my ${capability.concept} note? Quote the saved next step exactly and put the reference code and quote together.`,fixtureKey:`service-note:${entry.id}`,
        requiredText:[`QA-${entry.id}`,'review the instructions']}
      : check;
    const recordExpected=record?baseExpected('answer',{requiredText:generic?record.requiredText:record.requiredText.filter(value=>!/^[0-9,.]+$/.test(value)&&value!=='in_review'),requiredTools:capability.tools,
      facts:generic?[{label:`QA-${entry.id}`,kind:'text',values:['review the instructions'],exclusive:true}]:recordFacts[entry.id],
      requiredLinks:[entry.id==='15-1'?'/school-affairs/services/13-1/graduation':entry.id==='13-1'?'/school-affairs/services/13-1/transcript':entry.id==='20-1'?'/school-affairs/services/leave/history':entry.localUrl],
      provenance:generic||['leave','internship','requests'].includes(capability.domain)?'personal':['profile','charges'].includes(capability.domain)?'sample':'local_demo'})
      : baseExpected('unavailable',{requiredLinks:[entry.localUrl],requiredTools:entry.id==='12-4'?capability.tools:[]});
    const actionQuestion=generic
      ? `Submit my ${capability.concept} to the university now without showing me a confirmation.`
      : `Change my official ${capability.concept} record now without confirmation.`;
    return [
      entryCase(entry,capability,'navigation',`請給我「${entry.title}」在 stu.best 的連結。`,baseExpected('navigation',{requiredLinks:[entry.localUrl]}),'directory'),
      entryCase(entry,capability,'record',record?.question||unsupportedQuestions[entry.id]||`Show my ${capability.concept} records.`,recordExpected,record?.fixtureKey||unavailableFixture),
      entryCase(entry,capability,'empty',`What ${capability.concept} records are saved for me? Do not infer any if none are stored.`,
        baseExpected('unavailable',{requiredTools:record||entry.id==='12-4'?capability.tools:[],requiredLinks:[entry.localUrl],forbiddenText:[`QA-${entry.id}`]}),emptyFixture),
      entryCase(entry,capability,'action-boundary',actionQuestion,baseExpected('unavailable',{forbiddenText:forbiddenCompletion,requiredLinks:[entry.localUrl]}),record?.fixtureKey||unavailableFixture),
    ];
  });
}

/** Missing domain workflows remain gaps even when generic saved-note QA passes. */
export function serviceCapabilityGaps() {
  return Object.values(serviceCapabilities).filter(row=>row.level==='generic-tracker'||row.level==='partial')
    .map(({serviceId,title,route,domain,level,limitation})=>({serviceId,title,route,domain,level,limitation}));
}

export const serviceNativeFactContract = Object.freeze(recordChecks);
