/** A receipt of the request, never a claim that records or tools were accessed. */
export function assistantAcknowledgment(question:string):string {
 const chinese=/\p{Script=Han}/u.test(question);
 const choices=chinese?['好，我來看看。','收到，我幫您查看一下。','我來幫您確認一下。']:["Sure, I’ll take a look.","Let me check that for you.","I’ll look into that for you."];
 const index=[...question].reduce((sum,char)=>(sum+char.codePointAt(0)!)%choices.length,0);
 return choices[index];
}
