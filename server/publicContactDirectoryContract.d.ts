export type PublicContactRecord={id:string;name:string;phone:string;extensions:string[];email:string|null;address:string|null;source:{title:string;url:string;source:string;captureFile:string;checksum:string;capturedOn:string;locator:string;text:string}};
export const publicContactDirectory:{version:number;title:string;path:string;records:PublicContactRecord[];coverage:string};
export const publicContactDirectoryPath:string;
export function findPublicContacts(query?:string):PublicContactRecord[];
export function publicContactPhoneHref(phone:string):string;
