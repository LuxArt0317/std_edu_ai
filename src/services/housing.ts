export const housingCategories = [
  ['general','一般生'],['disability','身心障礙學生'],['island','離島學生'],['low_income','低收入戶學生'],
  ['lower_middle_income','中低收入戶學生'],['college','書院生'],['academic_award','書卷獎學生'],
  ['athlete','體保生'],['dorm_leader','宿舍幹部'],['overseas_chinese','僑生'],['international','外國學生'],['mainland','大陸學生'],
] as const;
export type HousingCategory=typeof housingCategories[number][0];
export type HousingPeriod={
  id:string;termLabel:string;academicYear:number;semester:number;opensAt:string;closesAt:string;published:boolean;
  instructions:string;agreementText:string;sourceMode:'local_demo';version:number;
};
export type HousingApplication={
  id:string;userId:string;periodId:string;receiptNumber:string;fullName:string;studentNumber:string;gender:'male'|'female';
  department:string;birthDate:string;homePhone:string;mobilePhone:string;email:string;address:string;postalCode:string;
  category:HousingCategory;healthNotes:string;agreementVersion:number;agreementText:string;submittedAt:string;version:number;
};
export type HousingAssignment={
  id:string;userId:string;periodId:string;academicYear:number|null;semester:number|null;bedNumber:string;dormitory:string;
  bunk:'upper'|'lower'|null;accommodationFee:number|null;deposit:number|null;subsidyAmount:number|null;version:number;
};
export type HousingRecords={periods:HousingPeriod[];applications:HousingApplication[];assignments:HousingAssignment[]};
export type HousingManagerAction={kind:'save_housing_period'|'save_housing_assignment';payload:Record<string,string>};
export function housingPeriodState(period:HousingPeriod,now=Date.now()):'draft'|'upcoming'|'open'|'closed' {
  if(!period.published)return 'draft';
  if(now<Date.parse(period.opensAt))return 'upcoming';
  return now<Date.parse(period.closesAt)?'open':'closed';
}
export function housingDate(value:string) {
  return new Intl.DateTimeFormat('zh-TW',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(value));
}
export function housingApplicantLabel(profile:{user_id:string;display_name:string;email:string}) {
  const identity=profile.email||profile.user_id;
  return profile.display_name&&profile.display_name!==identity?`${profile.display_name} (${identity})`:identity;
}
