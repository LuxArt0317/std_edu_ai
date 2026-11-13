/** Source34-2 exposed only a no-record notice. No populated rows or capabilities are modeled. */
export const dormitoryConductPath='/school-affairs/services/34-2';
export const dormitoryConductMaxVersion=999999999;
export type DormitoryConductResult='empty'|'unknown';
export type DormitoryConductSnapshot={userId:string;sourceMode:'local_demo';version:number;result:DormitoryConductResult};
export type DormitoryConductData={snapshot:DormitoryConductSnapshot|null};
export type DormitoryConductAdminRecord=DormitoryConductSnapshot & {id:string;createdAt:string;updatedAt:string};
export type DormitoryConductAdminData={record:DormitoryConductAdminRecord|null};
/** Missing, malformed or foreign data remains unknown, never evidence of an empty record. */
export function ownDormitoryConductSnapshot(value:unknown,userId:string):DormitoryConductSnapshot|null{
  const uuid=(item:unknown)=>typeof item==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(item);
  if(!uuid(userId)||!value||typeof value!=='object'||Array.isArray(value)||![Object.prototype,null].includes(Object.getPrototypeOf(value)))return null;
  const row=value as Record<string,unknown>,keys=['userId','sourceMode','version','result'];
  if(Object.keys(row).length!==keys.length||!keys.every(key=>Object.hasOwn(row,key))||row.userId!==userId||row.sourceMode!=='local_demo'
    ||!Number.isSafeInteger(row.version)||Number(row.version)<1||Number(row.version)>dormitoryConductMaxVersion||typeof row.result!=='string'||!['empty','unknown'].includes(row.result))return null;
  return {...row} as DormitoryConductSnapshot;
}
