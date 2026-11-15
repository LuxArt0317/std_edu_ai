type NamedAction = {title:string;ambiguous:boolean};
type TargetedAction = {target:string;ambiguous:boolean};
export type ExplicitAccountAction =
  | ({kind:'create_task'|'update_display_name'} & NamedAction)
  | ({kind:'complete_task'} & TargetedAction)
  | ({kind:'cancel_club_equipment';pickup:string} & TargetedAction)
  | {kind:'cancel_facility_repair';id:string;ambiguous:boolean}
  | ({kind:'submit_learning_support';details:string} & NamedAction)
  | {kind:'withdraw_learning_support';id:string;mode:'exact'|'latest'|'unique';ambiguous:boolean}
  | {kind:'counseling_cancel';appointmentKind:'counseling'|'assessment';date:string;id:string;ambiguous:boolean}
  | ({kind:'set_assignment_status';status:'open'|'submitted'} & TargetedAction)
  | ({kind:'create_service_request';details:string;requestType:string} & NamedAction)
  | ({kind:'publish_announcement';details:string} & NamedAction);
export function parseExplicitAccountAction(question:unknown):ExplicitAccountAction|null;
