import {
  chargePaymentHistoryPath,chargePaymentHistoryScope,chargePaymentQuery,type ChargePaymentSelection,
} from '../../../../server/chargePaymentContract.js';

export function chargePaymentHistorySelection(params:URLSearchParams){
  const values=Object.fromEntries([...new Set(params.keys())].map(key=>{
    const matches=params.getAll(key);
    return [key,matches.length===1?matches[0]:matches];
  }));
  return Object.hasOwn(values,'scope')?null:chargePaymentQuery({scope:chargePaymentHistoryScope,...values});
}

export function chargePaymentHistoryParams({from,through,chargeId,page}:ChargePaymentSelection){
  const params=new URLSearchParams();
  if(from)params.set('from',from);
  if(through)params.set('through',through);
  if(chargeId)params.set('charge_id',chargeId);
  if(page&&page!==1)params.set('page',String(page));
  return params;
}

export function chargePaymentHistoryUrl(selection:ChargePaymentSelection) {
  const search=chargePaymentHistoryParams(selection).toString();
  return chargePaymentHistoryPath+(search?'?'+search:'');
}
