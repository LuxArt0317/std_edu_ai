/** Compare supplied destinations without confusing Unicode with URL encoding.
 * Keep the host, path, query and fragment; never infer a new destination. */
export function navigationUrlKey(value){
 if(typeof value!=='string')return value;
 if(!/^\/(?!\/)|^https:\/\//u.test(value))return value;
 try{
  const url=new URL(value,'https://stu.best');
  if(url.username||url.password)return value;
  return url.href.replace(/%[a-f0-9]{2}/giu,match=>match.toUpperCase());
 }catch{return value;}
}
