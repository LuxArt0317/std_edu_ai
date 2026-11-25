import {languageOnlyRequest} from '../src/services/assistantLanguage.js';
// Explain the previous assistant message; history never establishes account facts.
// This narrow route needs no records, web search, model call or write permission.
export function assistantConversationFollowup(question,history=[]){
  const requestedLanguage=languageOnlyRequest(question);
  if(requestedLanguage)return {status:'answered',answer:requestedLanguage==='en'
    ?'Of course—I’ll reply in English and keep my suggested questions in English too.'
    :'好的，我會用繁體中文回覆，建議問題也會使用繁體中文。',citations:[],suggestedQuestions:[],
    grounding:{source:'conversation',webSearched:false},activity:[{kind:'conversation-language',label:requestedLanguage==='en'?'Updated conversation language':'已更新對話語言',
      detail:requestedLanguage==='en'?'No record lookup or web search was needed.':'不需要查詢紀錄或搜尋網路。',status:'complete'}]};
  if(typeof question!=='string'||question.length>200)return null;
  const text=question.normalize('NFKC').trim().replace(/[?.!。！？]+$/u,'');
  if(!/^(?:why (?:do i (?:need|have) to wait|should i wait|do i need to try again|should i try again)|what (?:am i|are we) waiting for|為什麼(?:我)?(?:需要|要)?(?:等|等待|再試)(?:一下|一會|一次)?|为什么(?:我)?(?:需要|要)?(?:等|等待|再试)(?:一下|一会|一次)?)$/iu.test(text))return null;
  const previous=history.at(-1);
  if(previous?.role!=='assistant'||typeof previous.content!=='string')return null;
  const message=previous.content.trim();
  const quota=message.startsWith('Sorry, the AI service has run out of credits.')||message.startsWith('抱歉，AI 服務目前的額度已用完。');
  const temporary=message==='Sorry, I’m having trouble checking that information right now. Could you try again in a moment?'
    ||message==='抱歉，我現在暫時無法核對這項資訊。可以稍後再試一次嗎？';
  const timeout=message==='Sorry, the lookup took too long, so I couldn’t finish checking that. Would you like me to try again?'
    ||message==='抱歉，這次查詢花了太久，還沒能確認答案。要不要再試一次？';
  if(!quota&&!temporary&&!timeout)return null;
  const zh=/\p{Script=Han}/u.test(question);
  const answer=quota?(zh?'上一則訊息的意思是 AI 服務額度不足，不是你必須等待。這需要管理員恢復額度，重送問題通常沒有幫助。你仍可以查詢登入身分等不需模型的功能。'
    :'That message meant the AI service needed more credits—not that you had to wait. The administrator needs to restore those credits; asking again won’t fix that. Basic features such as checking your signed-in identity can still work.')
    :timeout?(zh?'你不一定要等。剛才那句話表示查詢超時了，不是你做錯了什麼。你可以重試，或先問一個比較具體的問題。'
      :'You don’t necessarily need to wait. My previous reply meant the lookup timed out—not that you did anything wrong. You can retry, or we can start with one specific detail.')
      :(zh?'你不一定要等。剛才我無法完成查詢，但「稍後再試」沒有說明清楚原因。單靠上一則訊息，我無法判斷何時會恢復；如果你只是想知道我是否認得你，我可以先核對目前的登入身分。'
        :'You don’t necessarily need to wait. I couldn’t complete the previous lookup, but “try again in a moment” didn’t explain why. That message alone doesn’t tell us when it will work. If you were asking whether I know you, I can check your signed-in identity instead.');
  return {status:'answered',answer,citations:[],suggestedQuestions:[],grounding:{source:'conversation',webSearched:false},
    activity:[{kind:'conversation-context',label:zh?'說明上一則回覆':'Explained the previous reply',detail:zh?'僅使用上一則對話訊息；未查詢帳戶紀錄或網路。':'Used the preceding message only; no account record or web lookup was needed.',status:'complete'}]};
}
