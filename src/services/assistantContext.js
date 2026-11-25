import {boundedAssistantText} from './assistantActivityBudget.js';
// Current saved-conversation contract retains 24 messages. Keep model context
// consistent across the browser and handlers, with a bounded UTF-8 payload.
export const ASSISTANT_CONTEXT_MESSAGES=24;
export const ASSISTANT_CONTEXT_BYTES=64000;
export function assistantContext(history){
  if(!Array.isArray(history))return [];
  const selected=[];let remaining=ASSISTANT_CONTEXT_BYTES;
  for(const item of history.slice(-ASSISTANT_CONTEXT_MESSAGES).reverse()){
    if(!item||!['user','assistant'].includes(item.role)||typeof item.content!=='string')continue;
    let content=boundedAssistantText(item.content,Math.min(8000,remaining));
    while(BufferlessBytes(content)>remaining)content=boundedAssistantText(content,Math.floor(content.length*0.8));
    if(!content)continue;
    selected.unshift({role:item.role,content});remaining-=BufferlessBytes(content);
    if(!remaining)break;
  }
  return selected;
}
const BufferlessBytes=value=>new TextEncoder().encode(value).byteLength;
