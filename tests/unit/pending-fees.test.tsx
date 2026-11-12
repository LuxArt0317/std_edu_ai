import assert from 'node:assert/strict';
import {test} from 'node:test';
import {pendingFeeBalance,pendingFeeDate,pendingFeeRows} from '../../src/services/pendingFees';

test('pending fee view uses positive outstanding cents, excluding settled and malformed balances',()=>{
  const base={label:'Synthetic fee',currency:'TWD',sourceMode:'sample'};
  const charges=[{...base,id:'partial',amountDue:1250.75,amountPaid:250.5},
    {...base,id:'paid',amountDue:100,amountPaid:100},
    {...base,id:'floating',amountDue:.1+.2,amountPaid:.3},
    {...base,id:'invalid',amountDue:NaN,amountPaid:0},
    {...base,id:'negative',amountDue:1,amountPaid:-1},
    {...base,id:'overpaid',amountDue:100,amountPaid:101}];
  assert.deepEqual(pendingFeeRows(charges).map(row=>row.id),['partial']);
  assert.equal(pendingFeeBalance(charges[0]),1000.25);assert.equal(pendingFeeBalance(charges[2]),0);
  assert.equal(charges.length,6,'Filtering does not mutate account history.');
});

test('pending fee occurrence date preserves its calendar day and never invents a missing date',()=>{
  assert.equal(pendingFeeDate('2024-02-29'),'2024/02/29');
  assert.equal(pendingFeeDate('1900-01-01'),'1900/01/01');
  for(const value of [null,undefined,'','2026-02-29','2026-13-01','2026-11-12T23:59:00Z','not-a-date'])assert.equal(pendingFeeDate(value),'—');
});
