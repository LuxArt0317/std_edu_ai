/** Repair only a single-line pipe table with a recognizable alignment row. */
export function normalizeAssistantTables(text){
 return text.split('\n').map(line=>{
  if(!/^\\?\|/.test(line.trim())||!line.includes('---'))return line;
  const parts=line.trim().replace(/^\\\|/,'|').split(/(?<!\\)\|/).map(s=>s.trim()).filter(Boolean);
  const start=parts.findIndex(p=>/^:?-{3,}:?$/.test(p));if(start<1)return line;
  let end=start;while(end<parts.length&&/^:?-{3,}:?$/.test(parts[end]))end++;
  const columns=end-start;if(start!==columns||columns<2||parts.length%columns)return line;
  const rows=[];for(let i=0;i<parts.length;i+=columns)rows.push('| '+parts.slice(i,i+columns).join(' | ')+' |');return rows.join('\n');
 }).join('\n');
}
