import {assistantReasoningOverride} from './assistantModelConfig.js';
export function assistantReasoning(deeper=false){
  const configured=assistantReasoningOverride()||process.env.OPENAI_REASONING_EFFORT;
  return ['low','medium','high'].includes(configured)?configured:deeper?'medium':'low';
}
