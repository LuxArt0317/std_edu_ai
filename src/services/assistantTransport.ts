/** Per-call transport injection for QA; never replace global fetch during parallel runs. */
export type AssistantTransport = { fetch?: typeof fetch };
export function assistantFetch(input:RequestInfo|URL,init?:RequestInit,transport?:AssistantTransport){
  return (transport?.fetch || fetch)(input,init);
}
