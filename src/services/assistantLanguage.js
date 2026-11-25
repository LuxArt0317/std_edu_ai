export function requestedAssistantLanguage(text){
  if(typeof text!=='string'||text.length>2000)return null;
  if(/\b(?:answer|reply|respond|speak|write|use).{0,45}\b(?:english|英文)\b|(?:請|请).{0,10}(?:用|使用|以)英文/iu.test(text))return 'en';
  if(/\b(?:answer|reply|respond|speak|write|use).{0,45}\b(?:traditional chinese|chinese)\b|(?:請|请).{0,10}(?:用|使用|以)(?:中文|繁體|繁体)/iu.test(text))return 'zh-Hant';
  return null;
}
export function assistantLanguage(question='',history=[]){
  const current=requestedAssistantLanguage(question);if(current)return current;
  for(const message of (Array.isArray(history)?history:[]).slice().reverse()){
    if(message?.role==='user'){const selected=requestedAssistantLanguage(message.content);if(selected)return selected;}
  }
  // Quoted interface labels do not override the language of an English request.
  const surrounding=question.replace(/\([^)]*\)|（[^）]*）|「[^」]*」|“[^”]*”/gu,' ');
  const englishWords=surrounding.match(/\b[a-z]+(?:'[a-z]+)?\b/giu)||[];
  if(englishWords.length>=3&&!/\p{Script=Han}/u.test(surrounding))return 'en';
  return /\p{Script=Han}/u.test(question)?'zh-Hant':'en';
}
export function languageOnlyRequest(text){
  const language=requestedAssistantLanguage(text);if(!language||text.length>300)return null;
  const clean=text.toLowerCase().trim();
  const words=/^(?:(?:please|just|from now on|can you|could you|also|and|your|all|the|my|me|in|pure|only|always|to|be|should|suggestionshould|suggestions?|follow.up|questions?|responses?|replies|answers?|answer|reply|respond|speak|write|use|english|traditional chinese|chinese|language|as well|too|text|everything|throughout|this|conversation)[\s,?.!;:-]*)+$/u;
  return words.test(clean)||/^(?:請|请)?(?:都|之後|之后|以後|以后)?(?:用|使用|以)(?:英文|中文|繁體中文|繁体中文)(?:回答|回覆|回复|和建議|及建議|包括建議|回答和建議|回答及建議)?[。！？?！\s]*$/u.test(clean)?language:null;
}
