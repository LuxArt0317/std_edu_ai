import {Input} from '@/components/ui/input';
import type {PendingFeeDraft} from '@/services/pendingFees';

export function PendingFeeFields({value,onChange,disabled=false}:{value:PendingFeeDraft;onChange:(value:PendingFeeDraft)=>void;disabled?:boolean}) {
  const update=(key:keyof PendingFeeDraft,next:string)=>onChange({...value,[key]:next});
  return <>
    <label>Occurrence date · 發生日期<Input name="occurrence_on" type="date" min="1900-01-01" max="2100-12-31" value={value.occurrence_on} disabled={disabled} onChange={event=>update('occurrence_on',event.target.value)}/></label>
    <label>Fee category · 類別<Input name="category" maxLength={80} value={value.category} disabled={disabled} onChange={event=>update('category',event.target.value)}/></label>
    <label>Contact unit · 連絡單位<Input name="contact_unit" maxLength={160} value={value.contact_unit} disabled={disabled} onChange={event=>update('contact_unit',event.target.value)}/></label>
    <label>Contact extension · 連絡分機<Input name="contact_extension" maxLength={40} value={value.contact_extension} disabled={disabled} onChange={event=>update('contact_extension',event.target.value)}/></label>
    <label>Payment unit · 繳費單位<Input name="payment_unit" maxLength={160} value={value.payment_unit} disabled={disabled} onChange={event=>update('payment_unit',event.target.value)}/></label>
  </>;
}
