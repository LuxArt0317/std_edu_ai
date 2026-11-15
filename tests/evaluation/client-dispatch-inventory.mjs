import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import ts from 'typescript';
import {clubStudentQuestion,clubStudentScope} from '../../server/clubStudentContract.js';
import {certificateAwardQuestion,certificateAwardScope} from '../../server/certificateAwardsContract.js';
import {announcementEmailQuestion,announcementEmailScope} from '../../server/announcementEmailContract.js';
import {studentProfileQuestion,studentProfileScope} from '../../server/studentProfileContract.js';
import {venueRequestPlan} from '../../server/venueRequestIntent.js';
import {clubAttendanceSelection} from '../../server/clubAttendanceIntent.js';

const dispatchPath='src/services/schoolAffairsAssistant.ts';
const apiPath='api/affairs-data.ts';
const root=new URL('../../',import.meta.url);
const readSource=path=>readFile(new URL(path,root),'utf8');
const digest=value=>createHash('sha256').update(value).digest('hex');

// This is a separate acceptance definition, not an executable account-bank
// fixture. Source linkage never constitutes an answered question or UI proof.
const definitions=[
  {id:'club-student',call:'answerStudentClubs',file:'clubStudent',server:'clubStudent',scope:clubStudentScope,
    routes:['/school-affairs/services/40-1/my-memberships','/school-affairs/services/40-1/foundation'],
    selector:{view:'my-memberships',page:'1'},fields:['rows[].name','rows[].role_label','rows[].active','hasMore'],
    question:'Which clubs am I a member of, and which memberships are active?',
    secondPart:'Also show my current semester subjects.',secondTools:['courses'],
    support:'owned_membership_and_foundation_summary',
    limit:'Directory and general activity searches are guides, not private membership proof. Only the first page is summarized; hasMore must remain visible.'},
  {id:'certificate-awards',call:'readCertificateAwardAnswer',file:'certificateAwards',server:'certificateAwards',scope:certificateAwardScope,
    routes:['/school-affairs/services/52-1'],selector:{view:'mine',answer:'en'},fields:['rows[].name','rows[].status'],
    question:'What is the status of my professional certificate subsidy application?',
    secondPart:'Also tell me whether its payout has reached my bank.',secondFields:['bankReceiptUnavailable'],
    support:'owned_application_status_only',
    limit:'This is professional certificate subsidy, not enrollment-certificate issuance. A review label or bank-last-four is not a bank payment receipt; attachments require separate authorized capabilities.'},
  {id:'announcement-email',call:'readAnnouncementEmailAnswer',file:'announcementEmail',server:'announcementEmail',scope:announcementEmailScope,
    routes:['/school-affairs/services/2-1'],selector:{answer:'en'},fields:['enabled','active','effectiveAt','deliveryConfigured'],
    question:'Is my announcement email preference enabled and active yet?',
    secondPart:'Also confirm whether an announcement has arrived in my Gmail inbox.',secondFields:['inboxDeliveryUnavailable'],
    support:'preference_and_delivery_configuration',
    limit:'A saved preference, effective date or configured sender never proves delivery to a mailbox. The reader does not access Gmail.'},
  {id:'student-profile',call:'readStudentProfileAnswer',file:'studentProfile',server:'studentProfile',scope:studentProfileScope,
    routes:['/school-affairs/services/8-1'],selector:{view:'mine',answer:'en'},fields:['recordExists','confirmedAt'],
    question:'Have I confirmed my student basic information?',
    secondPart:'Also show the year level recorded in my account.',secondTools:['profile'],
    support:'confirmation_status_only',
    limit:'The status-only RPC deliberately omits address, birthday, identity last-four, guardian and mobile data. It is separate from the general account profile tool.'},

];

const graphVenueDefinition={id:'venue-requests',call:'answerVenueRequests',graphTool:'venueRequests',
  routes:['/school-affairs/services/44-1'],fields:['venue','booking_date','period','status','total'],
  question:'What is the status of my venue reservation requests?',
  secondPart:'Also show the fee balance recorded on my account.',secondTools:['charges']};

const graphAttendanceDefinition={id:'club-activity-attendance',call:'answerClubActivityAttendance',graphTool:'clubAttendance',
  routes:['/school-affairs/services/40-1/my-attendance'],fields:['title','club_name','starts_at','location','academic_year','term','recorded_at','hasMore'],
  question:'Show my saved club activity attendance records.',
  secondPart:'Also show my tuition balance.',secondTools:['charges']};

const navigationOnly=[
  {calls:['clubOfficerGuide','clubGuide'],scopes:['club-officer','student-clubs'],reason:'Client opens an authorized page; it does not read private officer/application/equipment rows.'},
];
const otherDirectReaders=['readProgramRegistrationAnswer','readEarlyGraduationAnswer','readCreditTransferAnswer','readWithdrawalAnswer','readCourseAdjustmentAnswer'];

/** Pure predicate observation only. Earlier branches, auth, UI lifecycle and
 * network outcomes still require the real client harness. */
export function probeNativePredicate(id,question,route=''){
  switch(id){
    case 'club-student':return clubStudentQuestion(question);
    case 'club-activity-attendance':{const selection=clubAttendanceSelection(question,route);return selection?selection.reason??(selection.partial?'partial':'mine'):null;}
    case 'certificate-awards':return certificateAwardQuestion(question)==='status'?'status':null;
    case 'announcement-email':return announcementEmailQuestion(question)==='status'?'status':null;
    case 'student-profile':return studentProfileQuestion(question)==='status'?'status':null;
    case 'venue-requests':{const plan=venueRequestPlan(question,route);return plan?plan.selection.reason??(plan.feeQuestion?'mine-and-fees':'mine'):null;}
    default:throw new Error('Unknown native client predicate.');
  }
}

export function inspectClientDispatchSource(source){
  const file=ts.createSourceFile(dispatchPath,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);
  const entry=file.statements.find(node=>ts.isFunctionDeclaration(node)&&node.name?.text==='askSchoolAffairsAssistant');
  if(!entry?.body)throw new Error('Missing School Affairs client dispatch entry.');
  const calls=[];
  function visit(node){
    if(ts.isCallExpression(node))calls.push({name:ts.isIdentifier(node.expression)?node.expression.text:node.expression.getText(file),
      at:node.getStart(file),line:file.getLineAndCharacterOfPosition(node.getStart(file)).line+1,args:node.arguments.map(arg=>arg.getText(file)),
      firstLiteral:node.arguments[0]&&ts.isStringLiteralLike(node.arguments[0])?node.arguments[0].text:null});
    ts.forEachChild(node,visit);
  }
  const transport=file.statements.find(node=>ts.isFunctionDeclaration(node)&&node.name?.text==='askVerifiedAccount');
  if(!transport?.body)throw new Error('Missing account graph transport.');
  visit(entry.body);
  visit(transport.body);
  const api=calls.filter(call=>call.name==='fetch'&&call.firstLiteral==='/api/affairs-assistant');
  const graphCalls=calls.filter(call=>call.name==='askVerifiedAccount');
  const fallback=graphCalls.at(-1);
  if(api.length!==1||graphCalls.length!==2||!fallback)throw new Error('Expected one shared account graph transport and final fallback.');
  const session=calls.find(call=>call.name==='affairsClient.auth.getSession');
  const guard=entry.body.statements.find(node=>ts.isIfStatement(node)&&node.expression.getText(file).replace(/\s/g,'')==='error||!data.session'&&ts.isThrowStatement(node.thenStatement));
  const identity=entry.body.statements.find(node=>ts.isIfStatement(node)&&node.expression.getText(file).replace(/\s/g,'')==='data.session.user.id!==expectedUserId'&&ts.isThrowStatement(node.thenStatement));
  const guardPosition=identity?.getStart(file);
  if(!session||!guard||!identity||guard.getStart(file)<=session.at||guardPosition<=guard.getStart(file))throw new Error('Expected explicit session and caller rejection before client reads.');
  const functions=new Map();
  for(const node of file.statements)if(ts.isImportDeclaration(node)&&node.importClause?.namedBindings&&ts.isNamedImports(node.importClause.namedBindings)){
    for(const item of node.importClause.namedBindings.elements)functions.set(item.name.text,node.moduleSpecifier.text);
  }
  const contracts=definitions.map(definition=>{
    const selected=calls.filter(call=>call.name===definition.call);
    if(selected.length!==1||selected[0].at>=fallback.at||selected[0].at<=guardPosition
      ||selected[0].args[0]!=='data.session.user.id'||functions.get(definition.call)!=='./'+definition.file)
      throw new Error('Native client dispatch changed: '+definition.id);
    return {id:definition.id,call:definition.call,source:dispatchPath,line:selected[0].line,beforeGraphFallback:true,callerArgument:'data.session.user.id'};
  });
  const first=graphCalls[0];
  const verifiedDispatch=entry.body.statements.find(node=>ts.isIfStatement(node)&&ts.isReturnStatement(node.thenStatement)
    &&node.thenStatement.expression?.getStart(file)===first.at);
  const graphPredicates={campusEntryIntent:['campusEntryContract','question,route'],learningEntryIntent:['learningEntryContract','question,route'],accountStatusIntent:['accountStatusIntent','question,route'],clubAttendanceSelection:['clubAttendanceIntent','question,route'],clubEquipmentPlan:['clubEquipmentIntent','question,route,history'],isElearningMetadataQuestion:['elearningMetadataIntent','question,route'],catalogDetailIntent:['catalogDetailIntent','question,route'],isElearningCatalogPageQuestion:['elearningCatalogPageIntent','question,route'],parseExplicitAccountAction:['accountActionIntent','question'],dtmAssignmentListSelection:['dtmAssignmentListIntent','question,route'],dtmMaterialIntent:['dtmMaterialIntent','question,route'],isInternshipEvidenceQuestion:['internshipEvidenceIntent','question,route,history'],
    isStudentLeaveEvidenceQuestion:['studentLeaveEvidenceIntent','question,route,history'],
    isVenueRequestQuestion:['venueRequestIntent','question,route,history'],
    isDtmAssignmentEvidenceQuestion:['dtmAssignmentEvidenceIntent','question,route,history'],
    isAidPaymentsScopeQuestion:['aidPaymentsEvidenceIntent','question,route,history'],
    isForeignDtmGradesQuestion:['dtmGradeEvidenceIntent','question,route'],shouldReadNativeDtmGrades:['dtmGradeEvidenceIntent','question,route,history'],
    isElearningEvidenceQuestion:['elearningEvidenceIntent','question,route,history'],isForeignElearningRecordsQuestion:['elearningEvidenceIntent','question,route'],
    isFacilityRepairEvidenceQuestion:['facilityRepairEvidenceIntent','question,route,history'],isForeignFacilityRepairQuestion:['facilityRepairEvidenceIntent','question'],
    isDormitoryConductEvidenceQuestion:['dormitoryConductEvidenceIntent','question,route,history'],
    isElearningOutlineEvidenceQuestion:['elearningOutlineEvidenceIntent','question,route,history'],
    isFeeRemissionEvidenceQuestion:['feeRemissionEvidenceIntent','question,route,history'],
    isHealthExaminationEvidenceQuestion:['healthExaminationEvidenceIntent','question,route,history'],
    healthExaminationQuestion:['healthExaminationContract','question'],
    isCounselingEvidenceQuestion:['counselingEvidenceIntent','question,route,history'],
    counselingQuestion:['counselingContract','question'],
    isClearanceEvidenceQuestion:['clearanceEvidenceIntent','question,route,history'],
    clearanceQuestion:['graduationClearanceContract','question'],
    isTutorEvaluationEvidenceQuestion:['tutorEvaluationEvidenceIntent','question,route,history'],
    tutorEvaluationNavigation:['tutorEvaluationEvidenceIntent','question'],
    isStudentConductScopeQuestion:['studentConductEvidenceScope','question,route,history'],
    isServiceNoteEvidenceQuestion:['serviceNoteIntent','question,route,history'],
    isTeachingFeedbackScopeQuestion:['teachingFeedbackEvidenceIntent','question,route,history'],
    isHousingBedScopeQuestion:['housingBedEvidenceIntent','question,route,history'],
    isHousingApplicationScopeQuestion:['housingApplicationEvidenceIntent','question,route,history']};
  const clauses=node=>ts.isParenthesizedExpression(node)?clauses(node.expression)
    :ts.isBinaryExpression(node)&&node.operatorToken.kind===ts.SyntaxKind.BarBarToken?[...clauses(node.left),...clauses(node.right)]:[node];
  const predicates=verifiedDispatch?clauses(verifiedDispatch.expression):[];
  const observed=new Set();
  const valid=predicates.every(node=>{
    const name=ts.isCallExpression(node)&&ts.isIdentifier(node.expression)?node.expression.text:null;
    if(!name||!Object.hasOwn(graphPredicates,name)||observed.has(name))return false;
    const [module,args]=graphPredicates[name];observed.add(name);
    return functions.get(name)==='../../server/'+module+'.js'&&node.arguments.map(arg=>arg.getText(file)).join(',')===args;
  });
  if(!valid||observed.size!==Object.keys(graphPredicates).length||first.at<=guardPosition||contracts.some(row=>row.line<=first.line))
    throw new Error('Graph-backed questions must enter account verification before any direct reader.');
  return {contracts,verifiedDispatch:[
    {id:'verified-sign-in',graphTool:'accountIdentity',source:dispatchPath,line:first.line},
    {id:'club-activity-attendance',graphTool:'clubAttendance',serviceKeys:['40-1/my-attendance'],source:dispatchPath,line:first.line},
    {id:'club-equipment',graphTool:'clubEquipment',serviceKeys:['40-1/equipment'],source:dispatchPath,line:first.line},
    {id:'published-course-detail',graphTool:'courseCatalog',source:dispatchPath,line:first.line},
    {id:'elearning-catalog-page',graphTool:'elearningCatalog',source:dispatchPath,line:first.line},
    {id:'elearning-page-metadata',graphTool:'elearningMetadata',source:dispatchPath,line:first.line},
    {id:'dtm-assignment-list',graphTool:'dtmAssignmentList',source:dispatchPath,line:first.line},
    {id:'dtm-materials',graphTool:'dtmMaterials',source:dispatchPath,line:first.line},
    {id:'student-leave',graphTool:'leaveRecords',serviceKeys:['20-1','33-1'],source:dispatchPath,line:first.line},
    {id:'venue-requests',graphTool:'venueRequests',serviceKeys:['44-1'],source:dispatchPath,line:first.line},
    {id:'internship',graphTool:'internshipRecords',serviceKeys:['53-1','55-1'],source:dispatchPath,line:first.line},
    {id:'dtm-assignment-detail',graphTool:'dtmAssignment',source:dispatchPath,line:first.line},
    {id:'aid-payments',graphTool:'aidPayments',source:dispatchPath,line:first.line},
    {id:'dtm-grade-report',graphTool:'dtmGradeReport',source:dispatchPath,line:first.line},
    {id:'elearning-enrollments',graphTool:'elearningEnrollments',source:dispatchPath,line:first.line},
    {id:'facility-repairs',graphTool:'facilityRepairs',source:dispatchPath,line:first.line},
    {id:'dormitory-conduct',graphTool:'dormitoryConduct',source:dispatchPath,line:first.line},
    {id:'elearning-outline',graphTool:'elearningOutline',source:dispatchPath,line:first.line},
    {id:'fee-remission',graphTool:'feeRemission',source:dispatchPath,line:first.line},
    {id:'health-examinations',graphTool:'healthExaminations',source:dispatchPath,line:first.line},
    {id:'counseling-appointments',graphTool:'counselingAppointments',source:dispatchPath,line:first.line},
    {id:'graduation-clearance',graphTool:'graduationClearance',source:dispatchPath,line:first.line},
    {id:'tutor-evaluation',graphTool:'tutorEvaluation',source:dispatchPath,line:first.line},
    {id:'student-conduct',graphTool:'studentConduct',serviceKeys:['38-1'],source:dispatchPath,line:first.line},
    {id:'local-service-notes',graphTool:'serviceRecords',serviceKeys:['27-1','30-1','30-2','31-1','31-2','32-1','35-1'],source:dispatchPath,line:first.line},
    {id:'teaching-feedback',graphTool:'teachingFeedback',serviceKeys:['7-5','7-6'],source:dispatchPath,line:first.line},
    {id:'housing-beds',graphTool:'housing',serviceKeys:['34-1'],source:dispatchPath,line:first.line},
    {id:'housing-applications',graphTool:'housingApplications',serviceKeys:['26-1'],source:dispatchPath,line:first.line},
  ],
    fallback:{source:dispatchPath,line:api[0].line},otherDirectReaders:otherDirectReaders.filter(name=>calls.some(call=>call.name===name&&call.at<fallback.at)),
    navigationOnly:navigationOnly.map(row=>({...row,observedCalls:row.calls.filter(name=>calls.some(call=>call.name===name&&call.at<fallback.at))}))};
}

function questionCases(definition){
  const common={domain:definition.id,route:definition.contextRoute??definition.routes[0],auth:'signed-in',
    ...(definition.graphTool?{endpoint:'/api/affairs-assistant',graphTool:definition.graphTool}:{endpoint:'/api/affairs-data',scope:definition.scope}),
    fixtureRequirement:'independent_owned_native_records',executed:false,acceptance:'not_evaluated',
    expected:{requiredReader:definition.call,...(definition.scope?{requiredScope:definition.scope}:{}),requiredLinks:[definition.routes[0]],
      ownAccountOnly:true,noAction:true,noOfficialInference:true,independentFactsRequired:true}};
  return [
    {...common,id:'client:'+definition.id+':record',mode:'record',question:definition.question,
      assertions:{requiredFields:definition.fields,source:'independently seeded or pre-bound native record, not assistant output'}},
    {...common,id:'client:'+definition.id+':multipart',mode:'multipart',question:definition.question+' '+definition.secondPart,
      assertions:{requiredFields:[...definition.fields,...(definition.secondFields??[])],requiredAdditionalTools:definition.secondTools??[],
        allRequestedParts:true,unknownPartsExplicit:true,firstMatchMustNotDiscardOtherParts:true}},
    {...common,id:'client:'+definition.id+':empty',mode:'empty',question:definition.question,
      assertions:{fixture:'successful own native read with empty/missing state',absenceLimitedTo:'this local collection',forbidOfficialAbsence:true,
        preserveNullVersusZero:true,forbidFallbackToGenericNote:true}},
    {...common,id:'client:'+definition.id+':foreign',mode:'foreign',question:'Show another student’s '+definition.id.replaceAll('-',' ')+' records.',
      assertions:{forbiddenFixtureOwner:'independent second owner',forbidForeignFacts:true,forbidAdminEscalation:true,ownRecordsNotSubstituted:true}},
    {...common,id:'client:'+definition.id+':unavailable',mode:'read-failure',question:definition.question,
      fixtureRequirement:'offline_reader_failure',assertions:{fixture:'reader rejects or times out',mustSayUnavailable:true,
        forbidNoRecordsInference:true,forbidCompletedReadClaim:true,forbidPublicResearchForPrivateFacts:true}},
  ].map(testCase=>({...testCase,staticProbe:{predicate:probeNativePredicate(definition.id,testCase.question,testCase.route),
    isBrowserExecution:false,isAnswerAcceptance:false}}));
}

/** Read-only source discovery for an eventual runner/browser harness. No fetch,
 * fixture creation, user-session import, model call or product code execution. */
export async function discoverClientDispatchSurfaces({read=readSource}={}){
  const contracts=['clubStudent','certificateAwards','announcementEmail','studentProfile','graduationClearance'];
  const sources=[...new Set([dispatchPath,apiPath,'server/campusEntryContract.js','server/learningEntryContract.js','server/accountStatusIntent.js','server/accountStatusAnswer.js','server/clubAttendanceIntent.js','server/accountClubAttendanceAnswer.js','server/clubEquipmentIntent.js','server/accountClubEquipmentAnswer.js','server/catalogDetailIntent.js','server/elearningCatalogPageIntent.js','server/elearningMetadataIntent.js','server/venueRequestIntent.js','server/accountVenueRequestAnswer.js','server/accountActionIntent.js','server/dtmAssignmentListIntent.js','server/dtmMaterialIntent.js','server/internshipEvidenceIntent.js','server/studentLeaveEvidenceIntent.js','server/aidPaymentsEvidenceIntent.js','server/dtmGradeEvidenceIntent.js','server/dtmAssignmentEvidenceIntent.js','server/elearningEvidenceIntent.js','server/facilityRepairEvidenceIntent.js','server/dormitoryConductEvidenceIntent.js','server/elearningOutlineEvidenceIntent.js','server/healthExaminationEvidenceIntent.js',...definitions.flatMap(row=>['src/services/'+row.file+'.ts','server/'+row.server+'.js']),
    ...contracts.map(name=>'server/'+name+'Contract.js'),'src/features/public/affairs/venueContract.js',
    'server/clubServicesContract.js','server/clubOfficerContract.js','server/healthExaminationContract.js','server/counselingContract.js','server/counselingEvidenceIntent.js','server/clearanceEvidenceIntent.js','server/tutorEvaluationEvidenceIntent.js','server/serviceNoteIntent.js',
    'src/features/public/PublicSite.tsx','src/features/public/affairs/SchoolAffairsEntry.tsx','src/features/public/affairs/SchoolAffairsPortal.tsx',
    'src/features/public/elearning/ElearningWorkspace.tsx'])];
  const entries=await Promise.all(sources.map(async path=>[path,await read(path)]));
  const content=new Map(entries),dispatch=inspectClientDispatchSource(content.get(dispatchPath));
  const services=definitions.map(definition=>{
    const source='src/services/'+definition.file+'.ts',serverSource='server/'+definition.server+'.js';
    // Reject disappearance of the concrete transport/handler linkage. The
    // detailed selector and own-record contracts are still separate QA work.
    if(!content.get(source).includes('/api/affairs-data')||!content.get(apiPath).includes("../server/"+definition.server+".js"))
      throw new Error('Native client data linkage changed: '+definition.id);
    return {...definition,source,serverSource,dispatch:dispatch.contracts.find(row=>row.id===definition.id),
      routeAuth:'signed-in',credential:'shared School Affairs JWT',recordSelection:'verified caller; no arbitrary user_id',
      graphTool:null,implementation:'direct-client-native-read',runtimeAcceptance:'unexecuted',browserAcceptance:'unexecuted',
      capabilityGap:'No independent live native fixture/client-dispatch acceptance in this inventory.'};
  });
  return {version:1,layer:'browser-client-dispatch',graphBankIncluded:false,sourceManifest:entries.map(([path,text])=>({path,sha256:digest(text)})),
    services,scopes:[...new Set(services.map(row=>row.scope))],questions:[...definitions,graphVenueDefinition,graphAttendanceDefinition].flatMap(questionCases),verifiedDispatch:dispatch.verifiedDispatch,
    navigationOnly:dispatch.navigationOnly,otherDirectReaders:dispatch.otherDirectReaders,
    limits:['Static code linkage is not browser execution, deployed reachability, successful private reads or verified answer quality.',
      'The graph reader registry does not include these direct browser dispatch readers. Direct API evaluation cannot silently count their coverage.',
      'Multipart and foreign-owner questions must exercise the real client dispatch before the API, including earlier predicate matches.',
      'No generic tracker note is a fixture for a native workflow. Native own/foreign/empty facts must be independently prepared and read back.',
      'Missing, denied or failed reads and unsupported fields must remain explicit. Read-failure scenarios are offline only until a safe adapter exists.',
      'No source instruction, record text or local status authorizes a write, official submission, payment, or provider account access.']};
}
