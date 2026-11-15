import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import ts from 'typescript';
import {schoolServiceEntries} from '../../src/features/public/affairs/studentServices.js';
import {accountTools,supplementalAccountTools} from '../../server/answerVerificationAccount.js';
import {academicGradesPaths} from '../../server/academicGrades.js';
import {graduationReviewPaths} from '../../server/graduationReview.js';
import {academicAttendancePaths} from '../../server/academicAttendance.js';
import {elearningPath,elearningServicePath,elearningCoursePath,elearningActivityPath} from '../../server/elearningContract.js';
import {clubAttendanceEvaluationPath} from './club-attendance-cases.mjs';

// Read literal route descriptors without importing React, executing product
// source or copying a second menu list that silently drifts from the UI.
function unwrap(node){while(node&&ts.isAsExpression(node))node=node.expression;return node;}
function literalValue(node){
  node=unwrap(node);
  if(node&&ts.isStringLiteralLike(node))return node.text;
  if(node&&ts.isArrayLiteralExpression(node))return node.elements.map(literalValue);
  if(node&&ts.isObjectLiteralExpression(node))return Object.fromEntries(node.properties.map(property=>{
    if(!ts.isPropertyAssignment(property)||!property.name||!['Identifier','StringLiteral'].includes(ts.SyntaxKind[property.name.kind]))throw new Error('Route descriptor must use literal properties.');
    return [property.name.text,literalValue(property.initializer)];
  }));
  throw new Error('Route descriptor is no longer a static literal; update inventory discovery.');
}
export function readRouteLiteral(source,name){
  const file=ts.createSourceFile('route-descriptor.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
  for(const statement of file.statements){
    if(!ts.isVariableStatement(statement))continue;
    for(const declaration of statement.declarationList.declarations)if(ts.isIdentifier(declaration.name)&&declaration.name.text===name)return literalValue(declaration.initializer);
  }
  throw new Error('Missing route descriptor: '+name);
}
const readSource=path=>readFile(new URL('../../'+path,import.meta.url),'utf8');
const signedIn=(id,routes,extra={})=>({id,routes,auth:'signed-in',browserChecks:['assistantPresent','keyboardUsable','sessionVerified'],...extra});
const publicFamily=(id,routes,extra={})=>({id,routes,auth:'public',browserChecks:['assistantPresent','keyboardUsable'],...extra});

// Discover production catalogs rather than copying their counts into a test.
// Newly registered services, menus, record tools or captures expand the gate.
export async function discoverSurfaces() {
  const [publicPagesText,menuSource,dtmSource,internshipSource,authSource]=await Promise.all([
    readSource('src/features/public/mirror/pages.json'),readSource('src/features/public/affairs/model.ts'),
    readSource('src/features/public/dtm/catalog.ts'),readSource('src/features/public/affairs/StudentServiceWorkspace.tsx'),
    readSource('src/features/public/affairs/authClient.ts'),
  ]);
  const publicPages=JSON.parse(publicPagesText),menus=readRouteLiteral(menuSource,'portalGroups');
  const dtmViews=readRouteLiteral(dtmSource,'dtmViews'),internshipViews=readRouteLiteral(internshipSource,'internshipViews');
  const callbackPath=readRouteLiteral(authSource,'affairsCallbackPath');
  if(!Array.isArray(menus)||!menus.length||menus.some(group=>typeof group.id!=='string'||!Array.isArray(group.views)||!group.views.length))throw new Error('Invalid current portal menu inventory.');
  if(!Array.isArray(dtmViews)||!dtmViews.every(view=>typeof view==='string'))throw new Error('Invalid current DTM view inventory.');
  const routeFamilies=[
    signedIn('school-affairs',['/school-affairs','/school-affairs/records','/school-affairs/notifications','/school-affairs/bookmarks','/school-affairs/search']),
    signedIn('school-menus',menus.flatMap(group=>group.views.map(([view])=>`/school-affairs/menu/${group.id}/${view}`))),
    signedIn('school-services',[...new Set(schoolServiceEntries.map(row=>row.localUrl).filter(route=>route.startsWith('/school-affairs/services/')))]),
    signedIn('student-leave',['/school-affairs/services/leave','/school-affairs/services/leave/index','/school-affairs/services/leave/history','/school-affairs/services/leave/archive','/school-affairs/services/leave/periods','/school-affairs/services/leave/edit/:id']),
    signedIn('student-club-attendance',[clubAttendanceEvaluationPath,clubAttendanceEvaluationPath+'?page=:page']),
    signedIn('internship',['/school-affairs/services/internship',...internshipViews.map(([view])=>'/school-affairs/services/internship/'+view)]),
    signedIn('course-catalog',['/school-affairs/services/12-4','/school-affairs/services/12-4?course=:id','/school-affairs/services/12-4?syllabus=:id']),
    signedIn('academic-grades',Object.values(academicGradesPaths)),
    signedIn('academic-graduation',[...Object.values(graduationReviewPaths),'/school-affairs/services/15-1']),
    signedIn('academic-attendance',Object.values(academicAttendancePaths)),
    signedIn('dtm',['/dtm','/dtm/dashboard','/dtm/my','/dtm/assignments','/dtm/grades','/dtm/course/:id',...dtmViews.map(view=>'/dtm/course/:id/'+view),'/dtm/course/:id/material/:materialId']),
    signedIn('dtm-submissions',['/dtm/course/:courseId/assignment/:assignmentId','/dtm/course/:courseId/assignment/:assignmentId/edit']),
    // Content in ElearningWorkspace is authenticated, including its catalog and
    // notices. A copied public catalog does not make this workspace anonymous.
    signedIn('elearning',[elearningPath,...['categories','my-courses','search','category/:id','notice/:id'].map(view=>elearningPath+'/'+view),
      elearningCoursePath(':id'),elearningActivityPath(':courseId',':activityId'),
      elearningPath+'/search?q=:query',elearningPath+'/search?q=:query&page=:page',elearningPath+'/category/:id?page=:page']),
    {id:'elearning-authentication',routes:[elearningPath+'/login'],auth:'public',browserChecks:['assistantPresent','keyboardUsable','sessionVerified'],
      browserScenarios:[
        {route:elearningPath+'/login',id:'signed-out-login',frame:'top-level',auth:'signed-out'},
        {route:elearningPath+'/login',id:'already-signed-in',frame:'top-level',auth:'transition',initialAuthenticated:true,resultingAuthenticated:true,
          resultingRoute:elearningPath,checks:['sessionVerified','navigationSucceeded']},
      ]},
    {id:'elearning-entry-transitions',routes:[elearningServicePath,'/school-sites/elearning.stu.edu.tw/','/school-sites/elearning.stu.edu.tw/login/index.php',
      '/school-sites/elearning.stu.edu.tw/course/index.php?categoryid=48'],auth:'transition',browserChecks:['sessionVerified','navigationSucceeded'],
      browserScenarios:[
        ...[elearningServicePath,'/school-sites/elearning.stu.edu.tw/','/school-sites/elearning.stu.edu.tw/login/index.php'].flatMap(route=>[
          {route,id:'signed-in-entry',frame:'top-level',initialAuthenticated:true,resultingAuthenticated:true,resultingRoute:elearningPath},
          {route,id:'signed-out-entry',frame:'top-level',initialAuthenticated:false,resultingAuthenticated:false,
            resultingRoute:route===elearningServicePath?'/school-affairs/login?next='+encodeURIComponent(elearningServicePath)
              :elearningPath+'/login'+(route.endsWith('/login/index.php')?'':'?next='+encodeURIComponent(elearningPath))},
        ]),
        // A concrete captured category makes source→destination identity
        // checkable; two independent :id patterns do not bind the same value.
        {route:'/school-sites/elearning.stu.edu.tw/course/index.php?categoryid=48',id:'signed-in-category',frame:'top-level',
          initialAuthenticated:true,resultingAuthenticated:true,resultingRoute:elearningPath+'/category/48'},
        {route:'/school-sites/elearning.stu.edu.tw/course/index.php?categoryid=48',id:'signed-out-category',frame:'top-level',
          initialAuthenticated:false,resultingAuthenticated:false,resultingRoute:elearningPath+'/login?next='+encodeURIComponent(elearningPath+'/category/48')},
      ]},
    signedIn('legacy-route-aliases',['/ePortal/index.asp','/ePortal/apMenu.asp','/school-sites/dtm.stu.edu.tw/']),
    publicFamily('authentication',['/school-affairs/login','/dtm/login','/dtm/login/index.php','/student-sso','/ePortal/login.asp','/auth/realms/stuarm/protocol/saml']),
    {id:'authentication-transitions',routes:[callbackPath,'/school-affairs/signed-out'],auth:'transition',browserChecks:['sessionVerified'],
      browserScenario:'Complete callback or sign-out, then verify the resulting account state; these routes are transitions, not persistent pages.',
      browserScenarios:[
        {route:callbackPath,id:'callback-success',frame:'top-level',initialAuthenticated:false,resultingAuthenticated:true,resultingRoute:'/school-affairs',checks:['sessionVerified','navigationSucceeded','oauthParametersCleared']},
        {route:callbackPath,id:'callback-rejected',frame:'top-level',initialAuthenticated:false,resultingAuthenticated:false,resultingRoute:callbackPath,checks:['sessionVerified','navigationSucceeded','oauthParametersCleared']},
        {route:'/school-affairs/signed-out',id:'sign-out',frame:'top-level',initialAuthenticated:true,resultingAuthenticated:false,resultingRoute:'/school-affairs/login',checks:['sessionVerified','navigationSucceeded','privateTranscriptCleared']},
        {route:'/school-affairs/signed-out',id:'already-signed-out',frame:'top-level',initialAuthenticated:false,resultingAuthenticated:false,resultingRoute:'/school-affairs/login',checks:['sessionVerified','navigationSucceeded','privateTranscriptCleared']},
      ]},
    publicFamily('account-information',['/school-affairs/privacy','/account-status'],{browserScenarios:[
      {route:'/account-status',id:'account-indicator',frame:'iframe',auth:'either',checks:['accountStateVerified','keyboardUsable','sessionVerified']},
    ]}),
    {id:'assistant-sessions',routes:['/campus-assistant','/campus-assistant?embed=1'],auth:'either',browserChecks:['assistantPresent','keyboardUsable','sessionVerified'],browserScenarios:[
      {route:'/campus-assistant',id:'standalone',frame:'top-level'},
      {route:'/campus-assistant?embed=1',id:'embedded',frame:'iframe',semanticContext:'host-route',
        checks:['assistantPresent','keyboardUsable','sessionVerified','hostContextVerified','answerScopeVerified']},
    ]},
    publicFamily('campus-navigation',['/campus-directory','/local-pages']),
    ...[...new Set(publicPages.map(row=>new URL(row.source).hostname))].sort().map(host=>publicFamily('public:'+host,publicPages.filter(row=>new URL(row.source).hostname===host).map(row=>row.route))),
  ];
  const value={version:3,services:schoolServiceEntries.map(({id,title,section,group,kind,localUrl})=>({id,title,section,group,kind,route:localUrl})),
    tools:Object.entries({...accountTools,...supplementalAccountTools,accountIdentity:'The verified School Affairs sign-in state and explicitly requested account email.',dtmAssignmentList:'Owned Moodle assignment list metadata and local tracker status for the selected view.',dtmMaterials:'Saved Moodle material lists and exact resource metadata for the caller’s course.',
      venueRequests:'Saved caller-owned venue request status, date, room, period and filtered count; supports a separate scoped fee-balance companion.',
      clubAttendance:'Caller-owned saved student club attendance, selected page, activity location and Taipei times.',
      elearningCatalog:'The verified Digital Academy catalog search or category result page, with local course links.',
      elearningMetadata:'The saved Digital Academy category hierarchy or exact notice title and body.'}).map(([id,description])=>({id,description})),routeFamilies,publicPages,
    coverageLimits:[
      'A route appearing in an API question or link is semantic/navigation coverage, not browser acceptance.',
      'Public capture title/date questions test page context only; source-content question coverage is separate.',
      'Inline administration editors, filter combinations, role states, uploads and OAuth transitions require their own browser scenarios.',
      'Explicit callback/sign-out routes are evaluated by their resulting state, not by requiring a launcher during a transient redirect.',
      'Browser observations are keyed by route, authentication state, scenario and frame; either-state pages require both signed-in and signed-out observations.',
      'Account-status is an iframe indicator, not a chatbot page. The embedded assistant uses the host route for its questions; it requires separate browser observations in both session states.',
      'Remote-learning catalog, notice, course and activity pages require the shared signed-in session. Their presence does not establish university enrollment, available course-outline permission, or provider-hosted grades and submissions.',
      'The legacy remote-learning category redirect uses captured category 48 in both session states as one exact representative; passing it does not cover every category identifier or return destination.',
    ]};
  return {...value,hash:createHash('sha256').update(JSON.stringify(value)).digest('hex')};
}
