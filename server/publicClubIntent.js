/** Public directory/recruitment guidance only; personal membership stays scoped. */
export function isPublicClubRecommendationQuestion(question){
 return typeof question==='string'&&question.length<=2000&&/\bclubs?\b|社團/iu.test(question)
  &&/\b(?:recommend|suggest|improve|practi[cs]e|develop|skills?|interests?|beginner)\b|推薦|建議|技能|興趣|練習|培養/iu.test(question)
  &&!/\b(?:joined|membership|my records?|my credits?|my grades?|status|complete[ds]?|enrol[l]?ed)\b|已參加|我的紀錄|我的學分|成績|狀態/iu.test(question);
}
export function isPublicClubQuestion(question){
 if(isPublicClubRecommendationQuestion(question))return true;
 return typeof question==='string'&&question.length<=2000
  &&/\b(?:clubs?|student associations?)\b|社團/iu.test(question)
  &&/\b(?:what|which|exist|available|join|apply|find|contact|where|recommend)\b|有哪些|參加|加入|申請|推薦|聯絡|在哪/iu.test(question)
  &&!/\b(?:my|mine|am i|i (?:have |had )?(?:attended|joined|participated)|their|his|her|another|other student|joined|membership status|credits?|requirements? completed)\b|我的|我已|我(?:目前|現在)?(?:加入|參加|隸屬)|其他學生|他人|學分|已參加/iu.test(question);
}

/** Keep source text, but avoid spending model context on duplicate menu/footer lines and tracking URLs. */
export function compactClubDirectoryContext(context){
 if(!context?.contentAvailable)return context;
 const data=JSON.parse(context.evidence.content);
 if(typeof data.excerpt!=='string')return context;
 const lines=data.excerpt.split('\n').map(line=>line.replace(/\s*\(https?:\/\/[^\s)]+\)/gu,'').trim()).filter(Boolean);
 const excerpt=[...new Set(lines)].join('\n');
 return {...context,evidence:{...context.evidence,content:JSON.stringify({...data,excerpt,includedCharacters:excerpt.length,
  coverage:String(data.coverage||'')+' Repeated identical lines and parenthesized link URLs were removed; linked labels remain. This excerpt does not establish recruitment availability or successful membership.'})}};
}
