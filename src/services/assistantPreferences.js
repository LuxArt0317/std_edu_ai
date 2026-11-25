export const assistantThinkingLevels=['auto','low','medium','high'];
export const defaultAssistantPreferences={model:'auto',thinking:'auto'};
export function sanitizeAssistantPreferences(value){
 if(!value||typeof value!=='object'||typeof value.model!=='string'||value.model.length>100
  ||!(value.model==='auto'||/^gpt-[a-z0-9.-]+$/u.test(value.model))||!assistantThinkingLevels.includes(value.thinking))return null;
 return {model:value.model,thinking:value.thinking};
}
export function assistantCommandChoices(query,models=[]){
 const text=query.trimStart(),model=text.match(/^\/model(?:\s+(.*))?$/iu),thinking=text.match(/^\/thinking(?:\s+(.*))?$/iu);
 if(model)return ['auto',...models].filter(value=>value.toLowerCase().includes((model[1]||'').trim().toLowerCase()))
  .map(value=>({kind:'model',value,label:value==='auto'?'Auto · configured default':value}));
 if(thinking)return assistantThinkingLevels.filter(value=>value.startsWith((thinking[1]||'').trim().toLowerCase()))
  .map(value=>({kind:'thinking',value,label:value==='auto'?'Auto · adaptive thinking':value[0].toUpperCase()+value.slice(1)}));
 if(/^\/[a-z]*$/iu.test(text))return [{kind:'query',value:'/model ',label:'Model · choose an answer model'},
  {kind:'query',value:'/thinking ',label:'Thinking · choose reasoning effort'}].filter(value=>value.value.startsWith(text.toLowerCase()));
 return [];
}
export function parseAssistantCommand(text,models=[]){
 const value=text.trim();
 if(value==='/')return {kind:'pick',query:'/'};
 const match=value.match(/^\/(model|thinking)(?:\s+(.*))?$/iu);if(!match)return {kind:'none'};
 if(!match[2])return {kind:'pick',query:'/'+match[1].toLowerCase()+' '};
 const field=match[1].toLowerCase(),chosen=match[2].trim().toLowerCase();
 if(field==='model'&&(chosen==='auto'||models.includes(chosen)))return {kind:'set',field,value:chosen};
 if(field==='thinking'&&assistantThinkingLevels.includes(chosen))return {kind:'set',field,value:chosen};
 return {kind:'error',message:field==='model'?'Choose a model from the available list.':'Use /thinking auto, low, medium, or high.'};
}
