export type PendingFeeMetadata={
  occurrenceOn:string|null;category:string|null;contactUnit:string|null;contactExtension:string|null;paymentUnit:string|null;
};
export type PendingFeeDraft={occurrence_on:string;category:string;contact_unit:string;contact_extension:string;payment_unit:string};
export function pendingFeeDraft(row?:Partial<Record<keyof PendingFeeDraft,string|null>>):PendingFeeDraft {
  return {occurrence_on:row?.occurrence_on||'',category:row?.category||'',contact_unit:row?.contact_unit||'',contact_extension:row?.contact_extension||'',payment_unit:row?.payment_unit||''};
}
export type PendingFeeCharge=Partial<PendingFeeMetadata>&{
  id:string;label:string;amountDue:number;amountPaid:number;currency:string;sourceMode:string;
};

/** Compare cents, so floating-point subtraction cannot create a phantom pending balance. */
export function pendingFeeBalance(charge:Pick<PendingFeeCharge,'amountDue'|'amountPaid'>):number {
  if(!Number.isFinite(charge.amountDue)||!Number.isFinite(charge.amountPaid)||charge.amountDue<0||charge.amountPaid<0)return 0;
  return Math.max(0,Math.round(charge.amountDue*100)-Math.round(charge.amountPaid*100))/100;
}

export function pendingFeeRows<T extends PendingFeeCharge>(charges:readonly T[]):T[] {
  return charges.filter(charge=>pendingFeeBalance(charge)>0);
}

export function pendingFeeDate(value:string|null|undefined):string {
  if(!value)return '—';
  const date=/^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if(!date)return '—';
  const parsed=new Date(value+'T00:00:00Z');
  return Number.isFinite(parsed.getTime())&&parsed.toISOString().slice(0,10)===value?`${date[1]}/${date[2]}/${date[3]}`:'—';
}
