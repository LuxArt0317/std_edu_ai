// Fixed inputs and expected scope authored independently of the runtime selector.
const root='/school-affairs/services/leave';
export const leaveFixtureOwner='11900000-0000-4000-8000-000000000001';
export const leaveFixtureForeign='11900000-0000-4000-8000-000000000002';
export const leaveFixtureRow='11900000-0000-4000-8000-000000000101';
export const leaveFixtureOtherRow='11900000-0000-4000-8000-000000000102';
export const leaveFixtureReview='11900000-0000-4000-8000-000000000201';
export const leaveFixtureClock=Date.UTC(2026,10,14,17);
const history=root+'/history',archive=root+'/archive',periods=root+'/periods',edit=root+'/edit/'+leaveFixtureRow;
export const studentLeaveNativeCases=[
  {id:'history',question:'Show my leave history',route:history,view:'history',fields:['dates','status']},
  {id:'dates',question:'Show my leave dates',route:'/',view:'history',fields:['dates']},
  {id:'approved',question:'Is my leave approved?',route:'/',view:'history',fields:['reviewStatus']},
  {id:'review-status',question:'What is the review status of my leave?',route:'/',view:'history',fields:['reviewStatus']},
  {id:'category',question:'What is my saved leave type?',route:history,view:'history',fields:['category']},
  {id:'archive',question:'Show archived leave',route:history,view:'archive',fields:['dates','status']},
  {id:'archive-route',question:'Status?',route:archive,view:'archive',fields:['status']},
  {id:'archived-english-dates',question:'Show my leave dates',route:archive,view:'archive',fields:['dates']},
  {id:'periods',question:'查詢我的請假節次',route:periods,view:'periods',fields:['periods']},
  {id:'taipei-today',question:'Show my leave periods today',route:periods,view:'periods',fields:['periods'],from:'2026-11-15',through:'2026-11-15'},
  {id:'requested-interval',question:'Show my leave dates from 2026-11-01 to 2026-11-15',route:history,view:'history',fields:['dates'],from:'2026-11-01',through:'2026-11-15'},
  {id:'explicit-date',question:'Did I have leave on 2026-11-10?',route:history,view:'history',fields:['dates','status'],from:'2026-11-10',through:'2026-11-10'},
  {id:'exact-edit',question:'Is my leave approved?',route:edit,view:'record',fields:['reviewStatus'],recordId:leaveFixtureRow},
  {id:'exact-sibling',question:'Show my leave dates for '+leaveFixtureOtherRow,route:edit,view:'record',fields:['dates'],recordId:leaveFixtureOtherRow},
  {id:'explicit-all-history',question:'Show all my leave records',route:edit,view:'history',fields:['dates','status']},
  {id:'record-from-history',question:'Status?',route:'/',history:[{role:'user',content:'Show my leave dates for '+leaveFixtureRow},{role:'assistant',content:'Previous reply'}],
    view:'record',fields:['status'],recordId:leaveFixtureRow},
  {id:'date-from-history',question:'Status?',route:'/',history:[{role:'user',content:'Show my leave dates on 2026-11-01'}],
    view:'history',fields:['status'],from:'2026-11-01',through:'2026-11-01'},
  {id:'count-only',question:'How many saved leave requests did I have this month?',route:history,view:'history',fields:[],countOnly:true,from:'2026-11-01',through:'2026-11-30'},
  {id:'own-no-foreign',question:'Show my leave dates but do not show Alice’s leave dates.',route:history,view:'history',fields:['dates']},
  {id:'companion',question:'Show my leave dates and my tuition balance',route:history,view:'history',fields:['dates'],residual:'my tuition balance'},
  {id:'companion-reverse',question:'What is my next class? Show my leave dates.',route:'/',view:'history',fields:['dates'],residual:'What is my next class'},
  {id:'explicit-foreign',question:'Show Alice’s leave history.',route:history,reason:'foreign_request'},
  {id:'chinese-foreign',question:'查詢小芳的請假紀錄',route:history,reason:'foreign_request'},
  {id:'foreign-record-no-expansion',question:'Show the leave dates for another student',route:edit,reason:'foreign_request'},
  {id:'route-tamper',question:'Show my leave dates',route:history+'?user_id='+leaveFixtureForeign,reason:'invalid_route'},
  {id:'unsupported-date',question:'Show my leave records last semester',route:history,reason:'ambiguous_selector'},
  {id:'malformed-id',question:'Show my leave ID 13f2be10',route:history,reason:'ambiguous_selector'},
  {id:'unsupported-detail',question:'Show my leave attachment',route:history,reason:'unsupported_field'},
  {id:'attendance',question:'Was my leave marked as an excused absence?',route:history,reason:'requires_attendance_source'},
  {id:'write',question:'Show my leave and delete it',route:edit,reason:'unsupported_operation'},
  {id:'excluded',question:'Do not show my leave status',route:history,excluded:true},
  {id:'excluded-foreign',question:'Do not show Alice’s leave status',route:history,excluded:true},
  {id:'navigation',question:'Where can I find my leave history?',route:'/',navigation:true},
  {id:'independent',question:'Show my next class',route:history,residual:'Show my next class'},
];
