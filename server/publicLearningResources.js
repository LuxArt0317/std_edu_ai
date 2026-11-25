export const publicLearningResourceRoute='/school-sites/www.lib.stu.edu.tw/';

/** Recommendations are public guidance, not proof of the caller's courses. */
export function isPublicLearningResourceQuestion(question){
 if(typeof question!=='string'||question.length>2000)return false;
 const text=question.normalize('NFKC');
 return /\b(?:recommend|suggest|supplement|extra|additional)\b|推薦|推荐|補充|补充|額外|额外/iu.test(text)
  &&/\b(?:books?|videos?|reading materials?|learning resources?|study resources?)\b|書籍|书籍|影片|視頻|视频|學習資源|学习资源|教材/iu.test(text)
  &&!/\b(?:my (?:saved|assigned|uploaded|submitted|watched)|which (?:books?|videos?) (?:did|have) i|did i|have i|for me|on my behalf|another student|someone else|delete|upload|submit|download)\b|我的(?:已存|指定|上傳|上传|繳交|缴交)|我看過|我看过|幫我下載|帮我下载|代我|其他學生|其他学生|刪除|删除/iu.test(text);
}

const resourceLabels=new Set(['館藏查詢','電子資源整合查詢系統','資料庫清單','電子期刊清單','電子書清單','多媒體中心','參考諮詢']);

/** Keep actual catalog/resource labels, not duplicated navigation or an arbitrary syllabus. */
export function focusLearningResourceContext(context){
 if(!context?.contentAvailable||context.page?.route!==publicLearningResourceRoute)return context;
 try{
  const metadata=JSON.parse(context.evidence.content);
  const labels=[...new Set(metadata.excerpt.split('\n').map(line=>line.replace(/\(https?:\/\/[^)]*\)/gu,'').trim()).filter(line=>resourceLabels.has(line)))];
  if(!labels.length)return context;
  const excerpt=labels.join('\n');
  return {...context,evidence:{...context.evidence,content:JSON.stringify({...metadata,excerpt,includedCharacters:excerpt.length,excerptTruncated:true,
   selectionScope:'Selected public resource labels only. The page does not identify the user’s course, learning level or requested topic, nor establish a particular book/video recommendation, availability or access entitlement.'})}};
 }catch{return context;}
}
