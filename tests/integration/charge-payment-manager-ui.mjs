import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
import AxeBuilder from '@axe-core/playwright';
import {affairsTestUser, mockAffairsAuth} from './helpers/affairs-auth.mjs';

const base = new URL(process.env.PUBLIC_SITE_ORIGIN || 'http://127.0.0.1:5309');
assert.ok(['localhost','127.0.0.1'].includes(base.hostname), 'Manager fixtures run against localhost only.');

const uuid = n => '85000000-0000-4000-8000-' + String(n).padStart(12, '0');
const manager = {...affairsTestUser, id: uuid(1), email:'luxart0317@gmail.com', user_metadata:{name:'Synthetic manager'}};
const student = {id:uuid(2), user_id:affairsTestUser.id, full_name:'Synthetic student', student_number:'QA001'};
const foreign = {id:uuid(3), user_id:uuid(4), full_name:'Synthetic second student', student_number:'QA002'};
const charge = {id:uuid(5), student_id:student.id, label:'Synthetic tuition', amount_due:1000, amount_paid:100, legacy_amount_paid:null, due_on:null};
const otherCharge = {...charge, id:uuid(6), student_id:foreign.id, label:'Synthetic other charge'};
const snapshot = {
  checkedAt:'2026-01-01T00:00:00.000Z', officialUniversityData:false,
  profile:{userId:manager.id, email:manager.email, displayName:'Synthetic manager', role:'admin'},
  student:null, courses:[], charges:[], assignments:[], announcements:[], tasks:[], requests:[],
  dtm:{sourceMode:'personal', courses:[], notices:[]},
  admin:{profiles:[], students:[student,foreign], sections:[], enrollments:[], dtmCourses:[],
    charges:[charge,otherCharge], assignments:[], requests:[]},
};
const path = '/school-affairs/admin/records';
const browser = await chromium.launch({headless:true, executablePath:process.env.CHROME_PATH
  || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});

try {
  const context = await browser.newContext({viewport:{width:1280,height:900}});
  await context.route('**/*', route => new URL(route.request().url()).origin === base.origin ? route.continue() : route.abort());
  await mockAffairsAuth(context, {user:manager});
  const operations = new Map();
  const writes = [], rows = [], errors = [];
  let foreignReply = false;
  const authSubject = request => JSON.parse(Buffer.from(request.headers().authorization.split('.')[1], 'base64url')).sub;

  await context.route('**/api/affairs-data*', route => {
    const request = route.request();
    const query = new URL(request.url()).searchParams;
    if (query.get('scope') !== 'fee-payment-history-admin') return route.fulfill({json:snapshot});
    assert.equal(request.method(), 'GET');
    assert.equal(authSubject(request), manager.id);
    assert.deepEqual(Object.fromEntries(query), {scope:'fee-payment-history-admin', student_id:student.id, charge_id:charge.id, page:'1'});
    return route.fulfill({json:{
      studentId:foreignReply ? foreign.id : student.id, chargeId:charge.id,
      rows:rows.map(item => ({...item, chargeLabel:'Synthetic tuition', chargeCategory:'學雜費',
        canReverse:item.entryKind==='payment'&&!rows.some(row=>row.reversesPaymentId===item.id)})),
      total:rows.length, hasUndatedPaidAmount:true,
    }});
  });

  await context.route('**/api/affairs-manage', route => {
    const request = route.request();
    assert.equal(request.method(), 'POST');
    assert.equal(authSubject(request), manager.id);
    const action = request.postDataJSON(), {payload} = action;
    writes.push(action);
    assert.equal(payload.student_id, student.id);
    assert.equal(payload.charge_id, charge.id);
    if (operations.has(payload.request_id)) {
      assert.deepEqual(action, operations.get(payload.request_id).action);
      return route.fulfill({json:operations.get(payload.request_id).receipt});
    }
    const payment = action.kind === 'record_charge_payment';
    if (payment) {
      assert.equal(payload.currency, 'TWD');
      assert.equal(payload.amount, '20.25');
      assert.equal(payload.paid_on, '2026-01-10');
    } else {
      assert.equal(action.kind, 'reverse_charge_payment');
      assert.equal(payload.payment_id, rows[0].id);
      assert.equal(payload.paid_on, '2026-01-12');
    }
    const entry = {id:uuid(10+rows.length), chargeId:charge.id, entryKind:payment?'payment':'reversal',
      paidOn:payload.paid_on, amount:'20.25', currency:'TWD', sourceMode:'local_recorded',
      reversesPaymentId:payment?null:payload.payment_id};
    rows.unshift(entry);
    charge.legacy_amount_paid = 100;
    charge.amount_paid = payment ? 120.25 : 100;
    const receipt={...entry, studentId:student.id, amountPaid:charge.amount_paid.toFixed(2), legacyAmountPaid:'100.00'};
    operations.set(payload.request_id, {action,receipt});
    return payment ? route.abort('failed') : route.fulfill({json:receipt});
  });

  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  async function openManager() {
    await page.getByRole('heading', {name:'School Affairs administration', exact:true}).waitFor();
    await page.getByRole('button', {name:'Manage dated payments', exact:true}).click();
    return page.getByRole('region', {name:'Dated charge payments', exact:true});
  }
  await page.goto(new URL(path,base).href);
  let ledger = await openManager();
  await ledger.getByText('No dated payments are recorded for this charge.', {exact:true}).waitFor();
  await ledger.getByLabel('Payment date (Taipei)').fill('2026-01-10');
  await ledger.getByLabel('Payment amount (TWD)').fill('0');
  await ledger.getByRole('button', {name:'Record payment', exact:true}).click();
  await ledger.getByRole('alert').filter({hasText:'positive amount'}).waitFor();
  assert.equal(writes.length, 0);

  await ledger.getByLabel('Payment amount (TWD)').fill('20.25');
  await ledger.getByRole('button', {name:'Record payment', exact:true}).click();
  await ledger.getByRole('alert').filter({hasText:'receipt could not be confirmed'}).waitFor();
  assert.equal(operations.size, 1);
  await page.reload();
  ledger = await openManager();
  await ledger.getByText('A payment request dated 2026-01-10 is awaiting confirmation.',{exact:true}).waitFor();
  await ledger.getByRole('button', {name:'Retry unchanged request', exact:true}).click();
  await ledger.getByText('Recorded NT$20.25 on 2026-01-10.',{exact:true}).waitFor();
  assert.deepEqual(writes[0], writes[1]);
  assert.equal(operations.size,1);

  await ledger.getByRole('button', {name:'Reverse payment on 2026-01-10'}).click();
  await ledger.getByLabel('Reversal date (Taipei)').fill('2026-01-12');
  await ledger.getByRole('button', {name:'Confirm payment reversal', exact:true}).click();
  await ledger.getByText('Reversed NT$20.25 on 2026-01-12.',{exact:true}).waitFor();
  await ledger.getByText('2026-01-10 · Payment reversed · NT$20.25',{exact:true}).waitFor();
  assert.equal(await ledger.getByRole('button', {name:/^Reverse payment on/u}).count(),0);
  assert.equal(operations.size,2);

  const fees=page.locator('.affairs-record-grid>section').filter({has:page.getByRole('heading',{name:'Tuition and fees',exact:true})});
  await fees.getByRole('button',{name:'Edit',exact:true}).click();
  assert.ok(await fees.getByLabel('Amount paid (TWD)').getAttribute('readonly') !== null);
  assert.equal(await fees.getByLabel('Amount paid (TWD)').inputValue(),'100');
  assert.equal(await fees.getByRole('button',{name:'Delete',exact:true}).isDisabled(),true);

  await page.setViewportSize({width:320,height:844});
  assert.equal(await ledger.evaluate(element=>element.scrollWidth<=element.clientWidth+1), true);
  const a11y=await new AxeBuilder({page}).include('[aria-label="Dated charge payments"]').analyze();
  assert.deepEqual(a11y.violations.filter(item=>['critical','serious'].includes(item.impact)).map(item=>item.id),[]);

  foreignReply = true;
  await ledger.getByRole('button',{name:'Refresh payment entries'}).click();
  await ledger.getByRole('alert').filter({hasText:'Payment entries could not be loaded'}).waitFor();
  assert.equal(await ledger.getByRole('list', {name:'Payment entries', exact:true}).count(),0);
  assert.equal(await ledger.getByRole('button', {name:'Record payment', exact:true}).count(),0);
  assert.equal(writes.length,3);
  const retryKey='school-payment-operation:'+manager.id+':'+student.id+':'+charge.id;
  await page.evaluate(({key,action}) => sessionStorage.setItem(key,JSON.stringify(action)),{key:retryKey,action:writes[0]});
  await page.goto(new URL('/school-affairs/signed-out',base).href);
  await page.waitForURL('**/school-affairs/login');
  assert.equal(await page.evaluate(key=>sessionStorage.getItem(key),retryKey),null);
  assert.deepEqual(errors,[]);
  console.log('Dated payment manager passed exact authorization, lost-receipt replay across reload, reversal, legacy-edit lock, 320px layout, axe and foreign response rejection.');
} finally {
  await browser.close();
}
