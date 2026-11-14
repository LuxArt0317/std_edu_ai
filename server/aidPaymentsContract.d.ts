export type AidPaymentView='claims'|'salary';
export type AidPaymentRow={id:string;[name:string]:string|number|null};
export type AidPaymentResult={userId:string;view:AidPaymentView;total:number;rows:AidPaymentRow[]};
export const aidPaymentsScope:'aid-payments';
export const aidPaymentsPageSize:25;
export const aidPaymentsPaths:Record<AidPaymentView,string>;
export const aidPaymentsFields:Record<AidPaymentView,Array<[string,string]>>;
export function validAidPayments(value:unknown,userId:string,view:AidPaymentView):value is AidPaymentResult;
export function aidPaymentsQuestion(question:string):AidPaymentView|null;
