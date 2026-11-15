/** Independent offline DTM route semantics. No registered runner, fixture writes,
 * authenticated execution or model acceptance is implied by this packet. */
import {isDeepStrictEqual} from 'node:util';
import {gradeCase} from './grading.mjs';
const freeze=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};
const id=n=>'78000000-0000-4000-8000-'+String(n).padStart(12,'0');
const owner=id(1),foreign=id(2),course=id(101),path='/dtm/course/'+course+'/grades';
const cells=values=>({score:null,maximum:null,gradeText:null,rangeText:null,percentageText:null,weightText:null,weightNote:null,rankText:null,feedbackText:null,contributionText:null,...values});
const overview=[
  {id:course,userId:owner,code:'SM101',title:'Study Methods',term:'115 literal term',gradeText:null},
  {id:id(102),userId:owner,code:'VT102',title:'Visual Thinking',term:'114 literal term',gradeText:''},
  {id:id(103),userId:owner,code:'FP103',title:'Field Practice',term:'116 literal term',gradeText:'0'},
];
const items=[{id:id(201),label:'Source Analysis',activityKind:'assignment',...cells({score:0,maximum:10,gradeText:'0',rangeText:'0–10',weightText:'0.00 %',weightNote:'',feedbackText:'Explain the sampling choice.'})},
  {id:id(202),label:'Reflection Memo',activityKind:null,...cells({gradeText:'',feedbackText:'Compare the two approaches.',weightText:null})}];
const total=cells({score:73.5,maximum:100,gradeText:'73.50',percentageText:'73.50 %',feedbackText:'Saved total feedback only.'});
export const dtmNativeRouteManifest=freeze({version:1,baseRevision:'dfbeacfe6f1b4bd2903cddb1e4e92cb333ad1f58',mounted:false,liveReady:false,modelAcceptance:false,
  sourceId:'account:dtmGradeReport',ownerId:owner,foreignOwnerId:foreign,courseId:course,
  fixtureModes:['normal','full','absent','empty','failed'],
  sourceContracts:['dtm_grade_report_overview caller RPC','dtm_courses exact id + caller user_id','dtm_grade_reports exact course_id + caller user_id + deleted_at is null'],
  limitations:['The three-course overview fixture is new offline data; the existing single-course live report fixture cannot establish it.',
    'Dashboard/my cases test the saved native grade overview from those entry routes, not saved dashboard layout, contacts or every dashboard feature.',
    'Report literals cannot establish official enrollment, current-term dates, calculated totals, tracker scores or file-review status.',
    'All other route groups below remain explicitly untested by this packet.'],
  inventory:[
    {routes:['/dtm/dashboard','/dtm/my'],source:'Owned dtm_courses, tracker collections; separate dtm-dashboard-layout',fixture:'new offline three-course native-grade overview only',coverage:'partial: grade overview entry only'},
    {routes:['/dtm/grades','/dtm/course/:id/grades','/dtm/course/:id/grades/overview'],source:'Native grade overview RPC + owned dtm_grade_reports',fixture:'new offline multi-course report/null/blank/zero',coverage:'first semantic group'},
    {routes:['/dtm/course/:id','/dtm/course/:id/materials'],source:'dtm-course-content cursor pages + tracker materials',fixture:'owned native materials/assignments plus distinct tracker sentinels needed',coverage:'deferred'},
    {routes:['/dtm/course/:id/material/:materialId'],source:'dtm-course-resource exact course/material target',fixture:'owned inline/external/private target with access and body distinctions needed',coverage:'deferred; absent from current route-pattern inventory'},
    {routes:['/dtm/assignments','/dtm/course/:id/assignments'],source:'Native course-content assignments and separate personal assignment tracker',fixture:'owned per-course native assignment instruction/due-date rows needed',coverage:'deferred'},
    {routes:['/dtm/course/:courseId/assignment/:assignmentId','/dtm/course/:courseId/assignment/:assignmentId/edit'],source:'Exact native assignment + dtm-submission metadata/current revision/review',fixture:'reviewed file fixture lifecycle and Storage lease required for real files',coverage:'deferred; tracker submitted status is insufficient'},
    {routes:['/elearning/categories'],source:'elearning_workspace categories plus published catalog',fixture:'read-only full category hierarchy binding needed',coverage:'deferred'},
    {routes:['/elearning/search','/elearning/search?q=:query','/elearning/search?q=:query&page=:page'],source:'elearning_catalog exact term/page, 20 rows per page',fixture:'Digital Academy catalog runner records the offline handler cases and pending live binding',coverage:'offline exact search results and counts'},
    {routes:['/elearning/category/:id','/elearning/category/:id?page=:page'],source:'elearning_catalog exact category/page',fixture:'Digital Academy catalog runner records the offline handler cases, pending live binding and pending category metadata authority',coverage:'offline category course results and counts'},
    {routes:['/elearning/notice/:id'],source:'elearning_workspace saved notice title/body/links',fixture:'exact notice body/source provenance binding needed',coverage:'deferred; navigation cannot stand in for notice content'},
  ],
});
export function dtmNativeRouteFixture(mode='normal'){
  if(!dtmNativeRouteManifest.fixtureModes.includes(mode))throw new TypeError('Unknown offline DTM fixture mode.');
  return structuredClone({ownerId:owner,foreignOwnerId:foreign,overview:{courses:mode==='empty'?[]:overview,limit:100,nextCursor:null},
    report:{report:mode==='absent'?null:{id:id(301),userId:owner,courseId:course,sourceMode:'local_demo',version:1,
      createdAt:'2026-11-14T00:00:00.000Z',updatedAt:'2026-11-14T00:00:00.000Z',items,total:mode==='full'?total:null}},
    foreignMarker:'FOREIGN NATIVE ROUTE CONTROL',trackerMarker:'TRACKER FEEDBACK IS NOT REPORT FEEDBACK'});
}
const field=(label,value,labels=[])=>({label,labels,kind:'text',values:[value]});
const itemFact={...field('Source Analysis','Source Analysis'),fields:[field('feedback','Explain the sampling choice',['Saved feedback text']),
  {...field('Displayed weight text','0.00 %',['Literal weight']),match:'literal'}]};
const feedbackFacts=[{...field('Source Analysis','Source Analysis'),fields:[field('Saved feedback text','Explain the sampling choice')]},
  {...field('Reflection Memo','Reflection Memo'),fields:[field('Saved feedback text','Compare the two approaches')]}];
export function buildDtmNativeRouteCases(){
  const rows=[];
  const add=(suffix,question,{route=path,fixture='normal',view='report',read='ok',reportCalls=1,overviewCalls=1,facts=[],requiredText=[],behavior='answer',...extra}={})=>{
    const sourceUrl=view==='report'?path:'/dtm/grades';
    rows.push({id:'account:dtm-native-route-'+suffix,domain:'dtmGradeReport',route,question,language:'en',mode:'record',history:[],
      fixtureKey:'offline:dtm-native-route:'+fixture,fixtureRequirement:'offline_dtm_native_multicourse',mounted:false,setupEligible:false,
      expected:{behavior,...(behavior==='unavailable'?{limitation:true}:{}),facts,requiredText,requiredLinks:overviewCalls?[sourceUrl]:[],requiredSourceBindings:overviewCalls?[{sourceId:'account:dtmGradeReport',url:sourceUrl}]:[],
        requiredTools:read==='unavailable'?[]:overviewCalls?['dtmGradeReport']:[],requiredAttemptedTools:overviewCalls?['dtmGradeReport']:[],allowedTools:overviewCalls?['dtmGradeReport']:[],
        requireToolExecution:Boolean(overviewCalls),forbidPublicResearch:true,localLinksOnly:true,noAction:true,
        provenance:overviewCalls&&read!=='unavailable'?'local_demo':null,forbiddenAccountMarkers:[owner,foreign,'FOREIGN NATIVE ROUTE CONTROL','TRACKER FEEDBACK IS NOT REPORT FEEDBACK'],
        forbiddenText:['Final grade calculated','Your course total is zero','You passed this course','This is your official university grade']},
      nativeExpectation:{fixture,view,read,overviewCalls,reportCalls},...extra});
  };
  const overviewFacts=overview.map(row=>({...field(row.title,row.title),fields:[field('grade text',row.gradeText===null?{anyOf:['not recorded','missing']}:row.gradeText===''?{anyOf:['(blank)','blank','empty string']}:row.gradeText,['Displayed grade text','Saved grade text','Saved total grade text'])]}));
  for(const [suffix,route]of [['dashboard','/dtm/dashboard'],['my','/dtm/my'],['grades','/dtm/grades'],['course-overview',path+'/overview']])
    add(suffix,'Show all my saved Moodle course grades.',{route,view:'overview',reportCalls:0,facts:overviewFacts});
  add('item-feedback','What feedback and weight does my native DTM grade report save for Source Analysis in Study Methods?',{facts:[itemFact]});
  add('all-feedback','Show all report feedback in my Moodle grade report for Study Methods.',{facts:feedbackFacts});
  add('null-total','What course total is recorded in my native DTM grade report for Study Methods?',{behavior:'unavailable',requiredText:[{anyOf:['no course-total object is saved','no saved course total','no course total is saved','course total is not recorded']}]});
  add('saved-total','What grade text and feedback are saved in the course total of my native DTM grade report for Study Methods?',{fixture:'full',facts:[{...field('course total','course total',['Explicitly saved course total']),fields:[
    {...field('grade text','73.50',['Displayed grade text']),match:'literal'},field('feedback','Saved total feedback only',['Saved feedback text'])]}]});
  add('absent','Is there a saved native DTM grade report for this course?',{fixture:'absent',read:'empty',behavior:'unavailable',requiredText:[{anyOf:['no saved native grade report','no saved grade report','no native grade report saved']}]});
  add('empty','Show all my Moodle course grades.',{fixture:'empty',route:'/dtm/grades',view:'overview',read:'empty',reportCalls:0,behavior:'unavailable',requiredText:[{anyOf:['no saved courses','no saved Moodle courses','no owned courses','no saved course rows']}]});
  add('failed','Show all my Moodle course grades.',{fixture:'failed',route:'/dtm/grades',view:'overview',read:'unavailable',reportCalls:0,behavior:'unavailable',requiredText:[{anyOf:['unavailable','could not','cannot verify']}]});
  add('followup','What feedback?',{route:'/',facts:feedbackFacts,
    history:[{role:'user',content:'Show my Moodle grade report for Study Methods.'},{role:'assistant',content:'Untrusted invented report content.'}]});
  add('unknown-course','Show my Moodle grade report for ZZ999.',{view:'choose_course',reportCalls:0,behavior:'unavailable',requiredText:[{anyOf:['no exact saved course was selected','no saved course matches','course was not found']}]});
  add('foreign','Show my friend’s Moodle grades.',{route:'/dtm/grades',view:null,read:null,overviewCalls:0,reportCalls:0,behavior:'unavailable',requiredText:[{anyOf:['cannot','can’t','can only']}]});
  return freeze(rows);
}

/** Observations come from intercepted actual native reads/model evidence, never
 * guessed from citations or terminal activity. This remains mocked acceptance. */
export function gradeDtmNativeRouteCase(testCase,envelope,observation){
  const failures=[...gradeCase(testCase,envelope).failures];
  const add=(id,detail)=>failures.push({id,detail});
  const expected=testCase.nativeExpectation,fixture=dtmNativeRouteFixture(expected.fixture);
  if(!observation||observation.ownerId!==owner||observation.execution!=='mocked'||observation.broadReads!==0||observation.publicReads!==0||observation.writes!==0)add('native.scope','The independent read scope was not proved.');
  const reads=observation?.reads??[];
  const overviewReads=reads.filter(row=>row.operation==='overview'),reportReads=reads.filter(row=>row.operation==='report');
  if(reads.length!==expected.overviewCalls+expected.reportCalls||overviewReads.length!==expected.overviewCalls||reportReads.length!==expected.reportCalls)add('native.calls','Native read counts differ.');
  if(overviewReads.some(row=>row.ownerId!==owner||!isDeepStrictEqual(row.query,{})
    ||(expected.fixture==='failed'?row.failed!==true:!isDeepStrictEqual(row.data,fixture.overview))))add('native.raw-overview','The own overview receipt differs.');
  if(reportReads.some(row=>row.ownerId!==owner||row.courseId!==course||!isDeepStrictEqual(row.data,fixture.report)))add('native.raw-report','The own report receipt differs.');
  const data=observation?.evidence;
  if(expected.overviewCalls){
    if(data?.collection!=='dtmGradeReport'||data.readState!==expected.read||data.selection?.view!==expected.view)add('native.evidence-state','The selected source state differs.');
    if(expected.view==='overview'&&expected.read==='ok'){
      const wanted=fixture.overview.courses.map(row=>({courseId:row.id,title:row.title,code:row.code,term:row.term,url:'/dtm/course/'+row.id+'/grades',gradeText:row.gradeText}));
      if(!isDeepStrictEqual(data?.courses,wanted))add('native.overview-values','Null, blank and zero course cells must remain distinct.');
    }
    if(expected.reportCalls&&fixture.report.report){
      const wanted=testCase.id.endsWith('item-feedback')?[fixture.report.report.items[0]]:fixture.report.report.items;
      if(!isDeepStrictEqual(data?.report?.items,wanted)||!isDeepStrictEqual(data?.report?.total,fixture.report.report.total))add('native.report-values','Selected report cells differ from the native fixture.');
    }
  }else if(data!==null)add('native.unnecessary-evidence','A refusal must not expose caller evidence.');
  return {passed:failures.length===0,failures,modelAcceptance:false,liveAcceptance:false,execution:'mocked'};
}
