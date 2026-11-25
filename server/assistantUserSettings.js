import {availableAssistantModels,validateAssistantModel} from './assistantAvailableModels.js';
import {withAssistantModel,assistantModelOverride,assistantReasoningOverride} from './assistantModelConfig.js';
const first=value=>Array.isArray(value)?value[0]:value;
const thinkingLevels=['auto','low','medium','high'];

/** Validate each request independently; model choices never alter global environment. */
export function withUserAssistantSettings(handler,{catalog=availableAssistantModels,validate=validateAssistantModel}={}){
 return async function(request,response,...rest){
  if(request.method==='GET'&&first(request.query?.options)==='1'){
   try{
    const options=await catalog();response.setHeader('Cache-Control','no-store');
    return response.status(200).json({...options,thinkingLevels});
   }catch{return response.status(503).json({error:'Model choices are temporarily unavailable. You can continue with Auto.'});}
  }
  const model=first(request.headers?.['x-stu-assistant-model'])||'auto';
  const thinking=first(request.headers?.['x-stu-assistant-thinking'])||'auto';
  if(typeof model!=='string'||model.length>100||!thinkingLevels.includes(thinking))
   return response.status(400).json({error:'Choose a model and thinking level from the available settings.'});
  if(model!=='auto'){
   try{await validate(model);}catch{return response.status(400).json({error:'That model is not currently available. Choose another model or Auto.'});}
  }
  const selectedModel=model==='auto'?assistantModelOverride():model;
  const reasoning=thinking==='auto'?assistantReasoningOverride():thinking;
  response.setHeader('X-STU-Assistant-Model',selectedModel||process.env.OPENAI_PUBLIC_MODEL||process.env.OPENAI_MODEL||'gpt-5.6-terra');
  response.setHeader('X-STU-Assistant-Thinking',thinking);
  if(model==='auto'&&thinking==='auto')return handler(request,response,...rest);
  return withAssistantModel({model:selectedModel,reasoning},()=>handler(request,response,...rest));
 };
}
