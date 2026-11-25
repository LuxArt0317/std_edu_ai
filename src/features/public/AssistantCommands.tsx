import {useEffect,useState,type KeyboardEvent} from 'react';
import {assistantCommandChoices,defaultAssistantPreferences,parseAssistantCommand,sanitizeAssistantPreferences,type AssistantCommandChoice,type AssistantPreferences} from '../../services/assistantPreferences.js';
const key='stu-assistant-model-settings-v1';

export function useAssistantCommands(query:string,setQuery:(value:string)=>void){
 const [preferences,setPreferences]=useState<AssistantPreferences>(()=>{try{return sanitizeAssistantPreferences(JSON.parse(localStorage.getItem(key)||'null'))||defaultAssistantPreferences;}catch{return defaultAssistantPreferences;}});
 const [models,setModels]=useState<string[]>([]),[defaultModel,setDefaultModel]=useState(''),[notice,setNotice]=useState('');
 const [dismissed,setDismissed]=useState(false),[active,setActive]=useState(0);
 useEffect(()=>{const controller=new AbortController();fetch('/api/research-assistant?options=1',{signal:controller.signal})
  .then(async response=>{if(!response.ok)throw Error('unavailable');return response.json();})
  .then(value=>{setModels(Array.isArray(value.models)?value.models.filter((id:unknown)=>typeof id==='string'):[]);setDefaultModel(typeof value.defaultModel==='string'?value.defaultModel:'');})
  .catch(()=>{if(!controller.signal.aborted)setNotice('Model choices could not be loaded. Auto and thinking settings are still available.');});
  return()=>controller.abort();},[]);
 useEffect(()=>{try{localStorage.setItem(key,JSON.stringify(preferences));}catch{/* Browser storage may be disabled. */}},[preferences]);
 useEffect(()=>{setDismissed(false);setActive(0);},[query]);
 const choices=dismissed?[]:assistantCommandChoices(query,models);
 function apply(choice:AssistantCommandChoice){
  if(choice.kind==='query'){setQuery(choice.value);return;}
  setPreferences(old=>sanitizeAssistantPreferences({...old,[choice.kind]:choice.value})||old);
  setNotice(`${choice.kind==='model'?'Model':'Thinking'} set to ${choice.value}.`);setQuery('');
 }
 function consumeCommand(text:string){
  const command=parseAssistantCommand(text,models);
  if(command.kind==='none')return false;
  if(command.kind==='pick'){setQuery(command.query);setDismissed(false);return true;}
  if(command.kind==='error'){setNotice(command.message);return true;}
  apply({kind:command.field,value:command.value,label:command.value});return true;
 }
 function onKeyDown(event:KeyboardEvent<HTMLTextAreaElement>){
  if(!choices.length||event.nativeEvent.isComposing)return false;
  if(event.key==='Escape'){event.preventDefault();setDismissed(true);return true;}
  if(event.key==='ArrowDown'||event.key==='ArrowUp'){event.preventDefault();setActive(old=>(old+(event.key==='ArrowDown'?1:-1)+choices.length)%choices.length);return true;}
  if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();apply(choices[Math.min(active,choices.length-1)]);return true;}
  return false;
 }
 const controls=<div className="relative space-y-2">
  {choices.length>0&&<div id="assistant-command-list" role="listbox" aria-label="Chat commands" className="absolute bottom-full left-0 right-0 z-30 mb-2 max-h-48 overflow-y-auto rounded-lg border bg-popover p-1 shadow-lg">
   {choices.map((choice,index)=><button id={`assistant-command-option-${index}`} key={choice.kind+choice.value} type="button" role="option" aria-selected={index===active} onMouseEnter={()=>setActive(index)} onClick={()=>apply(choice)} className={`block w-full rounded-md px-3 py-2 text-left text-sm ${index===active?'bg-accent text-accent-foreground':'text-popover-foreground hover:bg-accent'}`}>{choice.label}</button>)}
  </div>}
  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
   <button type="button" onClick={()=>setQuery('/model ')} className="hover:text-foreground">Model: {preferences.model==='auto'?`Auto${defaultModel?' · '+defaultModel:''}`:preferences.model}</button>
   <button type="button" onClick={()=>setQuery('/thinking ')} className="hover:text-foreground">Thinking: {preferences.thinking}</button>
   <span>Type / for settings</span>
  </div>
  {notice&&<p role="status" className="text-xs text-muted-foreground">{notice}</p>}
 </div>;
 return {preferences,controls,onKeyDown,consumeCommand,activeCommandId:choices.length?`assistant-command-option-${Math.min(active,choices.length-1)}`:undefined};
}
