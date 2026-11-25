export const staffParkingProcedureRoute:string;
export type StaffParkingSections={general:{locator:string;text:string};staffCar:{locator:string;text:string};staffMotorcycle:{locator:string;text:string};contact:{locator:string;text:string;phone:string;extensions:string[]}};
export function extractStaffParkingSections(html:string):StaffParkingSections;
export function importStaffParkingSource():Promise<unknown>;
