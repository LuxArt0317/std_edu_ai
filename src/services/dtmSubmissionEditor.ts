/** UI-only metadata and validation. Upload reservations and authorization belong to the host. */
export const dtmEditorMaxFileBytes=10*1024*1024;
export type DtmEditorAssignment={id:string;userId:string;title:string};
export type DtmEditorFileScope={userId:string;assignmentId:string};
export type DtmEditorSavedFile=DtmEditorFileScope&{id:string;filename:string;sizeBytes:number;contentType:string};
export type DtmEditorStatus='idle'|'uploading'|'saving';
export type DtmEditorView='icons'|'list'|'tree';
export const dtmEditorAssets={
  add:'/school-assets/802a7e657787f126537d.svg',download:'/school-assets/252c16446b06649136ff.svg',
  icons:'/school-assets/af7c50f6fe273363b952.svg',list:'/school-assets/019876201b206569c518.svg',
  tree:'/school-assets/2c19ccfeb0d9658e19ea.svg',pdf:'/school-assets/93b52d1355e1812e7957.png',
  menu:'/school-assets/f75b1f6e06c9776c7777.gif',
} as const;
export function dtmEditorContentType(value:string):string|null {
  if(typeof value!=='string')return null;
  const type=value===''?'application/octet-stream':value.toLowerCase();
  return type.length<=120&&/^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/.test(type)?type:null;
}
export function dtmEditorFileError(file:Pick<File,'name'|'size'|'type'>|null):string|null {
  if(!file)return '請選擇一個新檔案。';
  if(typeof file.name!=='string'||file.name.trim()===''||['.','..'].includes(file.name)||
    /[/\\]/.test(file.name)||[...file.name].some(char=>{const code=char.codePointAt(0)!;return code<=31||code===127||code>=0xd800&&code<=0xdfff;})||
    new TextEncoder().encode(file.name).byteLength>255)return '檔名不可為空白、包含路徑或控制字元，且不可超過 255 個 UTF-8 位元組。';
  if(!Number.isSafeInteger(file.size)||file.size<0||file.size>dtmEditorMaxFileBytes)return '請選擇不超過 10 MiB 的檔案。';
  if(dtmEditorContentType(file.type)===null)return '無法使用這個檔案類型，請重新選擇檔案。';
  return null;
}
export function ownDtmEditorAssignment(assignment:DtmEditorAssignment|null,userId:string):DtmEditorAssignment|null {
  return typeof userId==='string'&&userId.trim()!==''&&assignment!==null&&Object.hasOwn(assignment,'userId')&&assignment.userId===userId&&
    typeof assignment.id==='string'&&assignment.id.trim()!==''?assignment:null;
}
export function dtmEditorScopeMatches(scope:DtmEditorFileScope|null|undefined,assignment:DtmEditorAssignment):boolean {
  return Boolean(scope&&Object.hasOwn(scope,'userId')&&Object.hasOwn(scope,'assignmentId')&&scope.userId===assignment.userId&&scope.assignmentId===assignment.id);
}
export function ownDtmEditorSavedFile(file:DtmEditorSavedFile|null,assignment:DtmEditorAssignment):DtmEditorSavedFile|null {
  return file&&dtmEditorScopeMatches(file,assignment)&&typeof file.id==='string'&&file.id.trim()!==''&&
    dtmEditorFileError({name:file.filename,size:file.sizeBytes,type:file.contentType})===null?file:null;
}
