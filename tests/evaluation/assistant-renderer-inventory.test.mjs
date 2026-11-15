import assert from 'node:assert/strict';
import {test} from 'node:test';
import {discoverSurfaces} from './surface-inventory.mjs';
import {fixtureIds,rendererInventory} from '../integration/helpers/assistant-renderer-inventory.mjs';

test('protected renderer inventory covers every declared signed-in route template in an exact bounded family',async()=>{
  const source=await discoverSurfaces(),result=await rendererInventory();
  assert.equal(result.hash,source.hash);
  assert.equal(new Set(result.cases.map(row=>row.route)).size,result.cases.length);
  const pattern=template=>new RegExp('^'+template.split(/(:[a-zA-Z]+)/u).map(value=>
    value.startsWith(':')?'[a-z0-9-]+':value.replace(/[.*+?^${}()|[\]\\]/gu,'\\$&')).join('')+'$','u');
  for(const family of source.routeFamilies.filter(row=>row.auth==='signed-in')){
    for(const route of family.routes)assert.equal(result.cases.filter(row=>row.families.includes(family.id)&&pattern(route).test(row.route)).length,1,route);
  }
  for(const row of result.cases){
    for(const url of [row.route,row.final,row.guest])assert.match(url,/^\/[^/:?#][^:#]*$/u);
    assert.ok(row.selector,row.route);
  }
});

test('route oracles keep exact private return selectors and aliases without expecting a provider session',async()=>{
  const {cases}=await rendererInventory(),route=path=>cases.find(row=>row.route===path);
  assert.equal(route('/ePortal/index.asp').final,'/school-affairs');
  assert.equal(route('/ePortal/index.asp').guest,'/school-affairs/login');
  assert.equal(route('/school-affairs/records').final,'/school-affairs');
  assert.equal(route('/school-affairs/services/6-6').final,'/school-affairs/services/11-1');
  assert.equal(route('/school-affairs/services/4-2').final,'/elearning');
  assert.equal(route('/dtm/course/'+fixtureIds.course+'/assignment/'+fixtureIds.assignment+'/edit').families[0],'dtm-submissions');
  const activity='/elearning/course/'+fixtureIds.elearningCourse+'/activity/'+fixtureIds.elearningActivity;
  assert.equal(new URL(route(activity).guest,'https://renderer.invalid').searchParams.get('next'),activity);
  const attendance='/school-affairs/services/40-1/my-attendance?page=2';
  assert.equal(new URL(route(attendance).guest,'https://renderer.invalid').searchParams.get('next'),attendance);
});

test('school service views and notice transitions keep distinct signed-in rendering and exact login destinations',async()=>{
  const inventory=await discoverSurfaces(),{cases}=await rendererInventory();
  const regular=inventory.routeFamilies.find(row=>row.id==='school-service-views');
  assert.equal(regular.auth,'signed-in');
  for(const path of ['/school-affairs/services/27-1/review','/school-affairs/services/27-1/notes',
    '/school-affairs/services/39-1/payment-history','/school-affairs/services/40-1/officer/new',
    '/school-affairs/services/45-1/history/:id','/school-affairs/admin/venues'])assert.ok(regular.routes.includes(path),path);
  const base=cases.find(row=>row.route==='/school-affairs/services/27-1');
  assert.match(base.selector,/Learning support/u);
  const history=cases.find(row=>row.route==='/school-affairs/services/39-1/payment-history?page=2');
  assert.equal(new URL(history.guest,'https://renderer.invalid').searchParams.get('next'),history.route);
  const transitions=inventory.routeFamilies.find(row=>row.id==='school-service-acknowledgements');
  assert.equal(transitions.auth,'transition');
  for(const scenario of transitions.browserScenarios){
    const row=cases.find(candidate=>candidate.route===scenario.route);
    assert.equal(row.final,scenario.route);
    assert.equal(row.notice.resultingRoute,scenario.resultingRoute);
    assert.equal(new URL(row.guest,'https://renderer.invalid').searchParams.get('next'),row.route);
  }
});
