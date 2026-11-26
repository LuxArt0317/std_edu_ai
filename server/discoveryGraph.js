import {Annotation,START,END,StateGraph} from '@langchain/langgraph';
/** Request-scoped graph; authorization and evidence live in the calling closure. */
export async function runDiscoveryGraph({plan,execute,verify,canContinue,maxSteps=8}){
 const State=Annotation.Root({decision:Annotation(),steps:Annotation(),done:Annotation()});
 const graph=new StateGraph(State)
 .addNode('plan',async state=>{if(state.steps>=maxSteps||!canContinue())return {done:true};const decision=await plan();return {decision,steps:state.steps+1,done:!decision};})
 .addNode('tool',async state=>({done:await execute(state.decision)}))
 .addNode('verify',async state=>({done:await verify(state.decision)}))
 .addEdge(START,'plan')
 .addConditionalEdges('plan',state=>state.done?END:state.decision.kind==='answer'?'verify':'tool')
 .addConditionalEdges('tool',state=>state.done||!canContinue()?END:'plan')
 .addConditionalEdges('verify',state=>state.done||!canContinue()?END:'plan').compile();
 return graph.invoke({steps:0,done:false},{recursionLimit:maxSteps*3+3});
}
