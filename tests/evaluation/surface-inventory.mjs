import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import ts from 'typescript';
import {schoolServiceEntries} from '../../src/features/public/affairs/studentServices.js';
import {accountTools,supplementalAccountTools} from '../../server/answerVerificationAccount.js';
import {academicGradesPaths} from '../../server/academicGrades.js';
import {graduationReviewPaths} from '../../server/graduationReview.js';
import {academicAttendancePaths} from '../../server/academicAttendance.js';

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
    signedIn('internship',['/school-affairs/services/internship',...internshipViews.map(([view])=>'/school-affairs/services/internship/'+view)]),
    signedIn('course-catalog',['/school-affairs/services/12-4','/school-affairs/services/12-4?course=:id','/school-affairs/services/12-4?syllabus=:id']),
    signedIn('academic-grades',Object.values(academicGradesPaths)),
    signedIn('academic-graduation',[...Object.values(graduationReviewPaths),'/school-affairs/services/15-1']),
    signedIn('academic-attendance',Object.values(academicAttendancePaths)),
    signedIn('dtm',['/dtm','/dtm/dashboard','/dtm/my','/dtm/assignments','/dtm/grades','/dtm/course/:id',...dtmViews.map(view=>'/dtm/course/:id/'+view)]),
    signedIn('dtm-submissions',['/dtm/course/:courseId/assignment/:assignmentId','/dtm/course/:courseId/assignment/:assignmentId/edit']),
    signedIn('legacy-route-aliases',['/ePortal/index.asp','/ePortal/apMenu.asp','/school-sites/dtm.stu.edu.tw/']),
    publicFamily('authentication',['/school-affairs/login','/dtm/login','/dtm/login/index.php','/student-sso','/ePortal/login.asp','/auth/realms/stuarm/protocol/saml']),
    {id:'authentication-transitions',routes:[callbackPath,'/school-affairs/signed-out'],auth:'either',browserChecks:['sessionVerified'],
      browserScenario:'Complete callback or sign-out, then verify the resulting account state; these routes are transitions, not persistent pages.'},
    publicFamily('account-information',['/school-affairs/privacy','/account-status']),
    {id:'assistant-sessions',routes:['/campus-assistant','/campus-assistant?embed=1'],auth:'either',browserChecks:['assistantPresent','keyboardUsable','sessionVerified']},
    publicFamily('campus-navigation',['/campus-directory','/local-pages']),
    ...[...new Set(publicPages.map(row=>new URL(row.source).hostname))].sort().map(host=>publicFamily('public:'+host,publicPages.filter(row=>new URL(row.source).hostname===host).map(row=>row.route))),
  ];
  const value={version:2,services:schoolServiceEntries.map(({id,title,section,group,kind,localUrl})=>({id,title,section,group,kind,route:localUrl})),
    tools:Object.entries({...accountTools,...supplementalAccountTools}).map(([id,description])=>({id,description})),routeFamilies,publicPages,
    coverageLimits:[
      'A route appearing in an API question or link is semantic/navigation coverage, not browser acceptance.',
      'Public capture title/date questions test page context only; source-content question coverage is separate.',
      'Inline administration editors, filter combinations, role states, uploads and OAuth transitions require their own browser scenarios.',
      'Explicit callback/sign-out routes are evaluated by their resulting state, not by requiring a launcher during a transient redirect.',
    ]};
  return {...value,hash:createHash('sha256').update(JSON.stringify(value)).digest('hex')};
}
