type NamedAction = {title:string;ambiguous:boolean};
type TargetedAction = {target:string;ambiguous:boolean};
export type ExplicitAccountAction =
  | ({kind:'create_task'|'update_display_name'} & NamedAction)
  | ({kind:'complete_task'} & TargetedAction)
  | ({kind:'cancel_club_equipment';pickup:string} & TargetedAction)
  | ({kind:'set_assignment_status';status:'open'|'submitted'} & TargetedAction)
  | ({kind:'create_service_request';details:string;requestType:string} & NamedAction)
  | ({kind:'publish_announcement';details:string} & NamedAction);
export function parseExplicitAccountAction(question:unknown):ExplicitAccountAction|null;
