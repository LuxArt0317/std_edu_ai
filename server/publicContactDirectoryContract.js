import data from './data/publicContactDirectory.json' with {type:'json'};
export const publicContactDirectory=data;
export const publicContactDirectoryPath=data.path;
/** Search only the catalog's published fields, never private account information. */
export function findPublicContacts(query=''){
 const text=String(query).normalize('NFKC').trim().toLowerCase().slice(0,120);
 return data.records.filter(row=>!text||[row.name,row.phone,...row.extensions,row.email||'',row.address||''].some(value=>value.normalize('NFKC').toLowerCase().includes(text)));
}
export function publicContactPhoneHref(phone){return 'tel:'+phone.replace(/[^+\d]/gu,'');}
