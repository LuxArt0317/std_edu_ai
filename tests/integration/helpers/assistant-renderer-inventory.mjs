import {discoverSurfaces} from '../../evaluation/surface-inventory.mjs';
import {schoolServiceNotices} from '../../evaluation/school-service-views.mjs';
import {legacyDtmWorkspacePath} from '../../../server/learningEntryContract.js';
import {nativeServiceAlias} from '../../../src/features/public/affairs/studentServices.js';
import {schoolServiceRouteInventory} from './school-service-route-inventory.mjs';

export const fixtureIds=Object.freeze({
  leave:'45000000-0000-4000-8000-000000000001',
  offering:'45000000-0000-4000-8000-000000000002',
  course:'45000000-0000-4000-8000-000000000003',
  material:'45000000-0000-4000-8000-000000000004',
  assignment:'45000000-0000-4000-8000-000000000005',
  elearningCourse:'9408',elearningActivity:'293395',elearningCategory:'48',elearningNotice:'325504',
});
const host='https://renderer.invalid';
const local=(value)=>{const url=new URL(value,host);if(url.origin!==host||!value.startsWith('/')||value.length>400)throw new Error('invalid-renderer-route');return url;};
const services=new Map(schoolServiceRouteInventory.map(row=>[row.href,row]));
const shells={
  'student-leave':'.student-leave','student-club-attendance':'.student-clubs',
  internship:'.student-internship','course-catalog':'.course-catalog',
  'academic-graduation':'.graduation-review-main','academic-grades':'.academic-grades','academic-attendance':'.academic-attendance',
};
function resolveTemplate(family,template){
  const id=family==='student-leave'?fixtureIds.leave:family==='course-catalog'?fixtureIds.offering
    :family==='school-service-views'?fixtureIds.leave
      :template.includes('/category/')?fixtureIds.elearningCategory:template.includes('/notice/')?fixtureIds.elearningNotice
      :family==='elearning'?fixtureIds.elearningCourse:fixtureIds.course;
  const replacements={id,materialId:fixtureIds.material,assignmentId:fixtureIds.assignment,
    courseId:family==='elearning'?fixtureIds.elearningCourse:fixtureIds.course,activityId:fixtureIds.elearningActivity,query:'safety',page:'2',
    from:'2026-11-01',through:'2026-11-30'};
  const path=template.replace(/:([a-zA-Z]+)/gu,(_match,name)=>{
    if(!Object.hasOwn(replacements,name))throw new Error('unbound-renderer-route-variable:'+name);
    return replacements[name];
  });
  local(path);return path;
}
function finalRoute(route){
  const {pathname,search}=local(route);
  if(pathname==='/school-affairs/records'||pathname==='/ePortal/index.asp')return '/school-affairs';
  if(pathname==='/ePortal/apMenu.asp')return '/school-affairs/search';
  if(pathname==='/school-affairs/services/4-2')return '/elearning';
  if(/^\/school-affairs\/course-selection\/review\/(?:tutor|dean|academic)$/u.test(pathname))return '/school-affairs/course-selection';
  const service=/^\/school-affairs\/services\/(\d+-\d+)$/u.exec(pathname);
  return ((service&&nativeServiceAlias(service[1]))||pathname)+search;
}
function guestRoute(route){
  const {pathname,search}=local(route);
  if(pathname.startsWith('/school-sites/dtm.stu.edu.tw/')){
    const target=legacyDtmWorkspacePath(pathname);
    return '/dtm/login'+(target?'?next='+encodeURIComponent(target):'');
  }
  const normalized=pathname==='/ePortal/index.asp'?'/school-affairs':pathname==='/ePortal/apMenu.asp'?'/school-affairs/search':pathname;
  const [home]=normalized.match(/^\/(?:school-affairs|dtm|elearning)/u)??[];
  if(!home)throw new Error('unexpected-renderer-home');
  if(normalized===home&&home!=='/elearning')return home+'/login';
  return home+'/login?'+(home==='/elearning'?new URLSearchParams({next:normalized+search}).toString():'next='+encodeURIComponent(normalized+search));
}
function selector(family,route){
  const {pathname,search,searchParams}=local(route);
  if(pathname==='/school-affairs/services/12-4'&&search)return searchParams.has('syllabus')?'.course-syllabus':'.catalog-detail';
  if(pathname.startsWith('/dtm')||pathname.startsWith('/school-sites/dtm.stu.edu.tw/'))return '.dtm.is-signed-in #dtm-content';
  if(pathname.startsWith('/elearning'))return '.elearning-root #elearning-main';
  if (/^\/school-affairs\/services\/[^/]+\/notes$/u.test(pathname))return '.student-service';
  if (/^\/school-affairs\/services\/27-1(?:\/review)?$/u.test(pathname))return '.student-service:has(nav[aria-label="Learning support"])';
  if(pathname==='/school-affairs/services/6-3/entry')return '.course-adjustment-event';
  if(pathname.startsWith('/school-affairs/services/6-3/'))return '.course-adjustment-late';
  if(pathname==='/school-affairs/services/6-5/notice')return '.summer-selection-notice';
  if(pathname==='/school-affairs/services/6-1/fees')return '.first-selection-fees';
  if(pathname==='/school-affairs/services/7-2/history')return '.credit-transfer';
  if(pathname.startsWith('/school-affairs/services/7-3/'))return '.program-registration';
  if(pathname.startsWith('/school-affairs/services/12-5/'))return '.curriculum-plans';
  if(pathname.startsWith('/school-affairs/services/12-6/'))return '.interdisciplinary-programs';
  if(pathname.startsWith('/school-affairs/services/12-7/'))return '.curriculum-map';
  if(pathname.startsWith('/school-affairs/services/12-8/'))return '.course-substitution';
  if(pathname.startsWith('/school-affairs/services/23-1/'))return '.exchange-grant';
  if(pathname==='/school-affairs/services/25-1/evaluation')return '.ta-event-page';
  if(pathname==='/school-affairs/services/39-1/payment-history')return '.payment-history-filters';
  if(pathname.startsWith('/school-affairs/services/42-1/'))return '.service-leadership-detail';
  if(pathname==='/school-affairs/services/46-1/instructions')return '.parking-permits-instructions';
  if(pathname.startsWith('/school-affairs/services/45-1/')||pathname.startsWith('/school-affairs/admin/repairs'))return '.facility-repair-page';
  if(pathname==='/school-affairs/admin/venues')return '.venue-workspace';
  if(pathname==='/school-affairs/admin/records')return '#portal-content p[role="alert"]:text-is("Administration requires a verified site administrator.")';
  const extraMarker=pathname==='/school-affairs/records/subjects'?'.school-subject-records'
    :pathname==='/school-affairs/course-selection'?'.course-selection-system-main'
      :pathname.startsWith('/school-affairs/services/29-1/')?'.counseling-workspace'
        :pathname.startsWith('/school-affairs/services/52-1/')?'.certificate-awards'
          :pathname.startsWith('/school-affairs/services/40-1/')?'.student-clubs'
            :pathname==='/school-affairs/services/37-1/salary'?'.aid-payment-site':null;
  if(extraMarker)return extraMarker;
  const descriptor=services.get(pathname);
  if(descriptor?.selector)return descriptor.selector;
  if(/^\/school-affairs\/(?:menu\/|search$)/u.test(pathname))return '#portal-program-search';
  if(pathname==='/school-affairs'||['/school-affairs/notifications','/school-affairs/bookmarks'].includes(pathname))return '#portal-content';
  return shells[family]??null;
}
export async function rendererInventory(){
  const {hash,routeFamilies}=await discoverSurfaces();
  const bank=new Map();
  const include=(family,template)=>{
    const route=resolveTemplate(family,template),existing=bank.get(route);
    if(existing){existing.families.push(family);return;}
    const final=finalRoute(route);
    bank.set(route,{route,final,guest:guestRoute(route),families:[family],selector:selector(family,final),
      evidenceScope:'signed-in-inventory'});
  };
  for(const family of routeFamilies.filter(row=>row.auth==='signed-in'))
    for(const template of family.routes)include(family.id,template);
  for(const family of routeFamilies.filter(row=>row.id==='elearning-entry-transitions'))
    for(const scenario of family.browserScenarios.filter(row=>row.initialAuthenticated)){
      const guest=family.browserScenarios.find(row=>!row.initialAuthenticated&&row.route===scenario.route);
      bank.set(scenario.route,{route:scenario.route,final:scenario.resultingRoute,guest:guest.resultingRoute,families:[family.id],
        selector:selector(family.id,scenario.resultingRoute),evidenceScope:'entry-transition'});
    }
  for(const notice of schoolServiceNotices){
    const family='school-service-acknowledgements';
    bank.set(notice.route,{route:notice.route,final:notice.route,guest:guestRoute(notice.route),families:[family],
      selector:selector(family,notice.resultingRoute),notice,evidenceScope:'notice-transition'});
  }
  return {hash,cases:[...bank.values()]};
}
