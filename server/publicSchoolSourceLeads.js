import {createHash} from 'node:crypto';
import {announcements,observedAt} from '../src/features/public/dtm/noticeCatalog.js';
import {safeWebSource} from './schoolWebSearch.js';
import {findOfficialLibraryServiceLeads,libraryAnswerLanguage} from './publicLibrarySources.js';

const schoolHost=host=>host==='stu.edu.tw'||host.endsWith('.stu.edu.tw');
const loginPath=/(?:^|\/)(?:(?:wp-)?login|signin|asp(?:net)?login|asploginstu|sso|cas\/login)(?:[/.]|$)|^\/auth\/realms\/[^/]+\/(?:protocol\/(?:saml|openid-connect\/auth)|login-actions)(?:\/|$)/iu;
const identityHost=new Set(['accounts.google.com','login.microsoftonline.com','login.live.com']);
const unsafeQuery=/token|password|secret|saml|session|ticket|authorization|api.?key|relaystate|redirect|return|continue|nonce|signature|^(?:state|code|sid|user|uid|otp|key)$/iu;

/** The destination can contain an opaque login challenge. Only the category is kept. */
export function isSchoolSignInDestination(value){
  try{
    const url=new URL(value);
    if(url.protocol!=='https:'||url.username||url.password||url.port&&url.port!=='443')return false;
    return identityHost.has(url.hostname)||schoolHost(url.hostname)&&loginPath.test(decodeURIComponent(url.pathname));
  }catch{return false;}
}

export function officialSchoolLeadUrl(value){
  const canonical=safeWebSource(value);
  if(!canonical||canonical.length>1200||isSchoolSignInDestination(canonical))return null;
  const url=new URL(canonical);
  if(!schoolHost(url.hostname)||[...url.searchParams].some(([key,param])=>
    unsafeQuery.test(key)||!/[\p{L}\d]/u.test(key)||!/^[\p{L}\d._,-]{1,160}$/u.test(param)))return null;
  return canonical;
}

const segmenter=new Intl.Segmenter('zh-Hant',{granularity:'word'});
const neutral=new Set(['a','about','and','are','by','can','do','for','from','give','have','i','in','is','it','me','my','of','on','or','please',
  'that','the','this','to','use','was','what','when','where','which','with','you','announcement','announced','date','notice','current','latest',
  'school','stu','shu','te','university','campus','student','students','account','accounts','dtm','moodle','guide','using',
  '我','你','請','學校','本校','這','哪裡','怎麼','通過','目前','最新','公告','通知','學期','日期','學生','同學','樹德','教材','系統']);
const terms=value=>{
  const text=String(value??'').normalize('NFKC').toLowerCase().replace(/\boffice\s+365\b/gu,'office365')
    .replace(/\bone[\s-]+drive\b/gu,'onedrive').replace(/\b(?:allowance|quotas|limits)\b/gu,'quota')
    .replace(/\b(?:two[\s-]*step|two[\s-]*factor|2fa|mfa)\b/gu,'twostep');
  return new Set([...segmenter.segment(text)].filter(token=>token.isWordLike&&token.segment.length>1&&!neutral.has(token.segment)
    &&!/^[\d]+$/u.test(token.segment)).map(token=>token.segment));
};
const overlap=(query,target)=>[...target].filter(term=>query.has(term));
const specificity=new Set(['onedrive','office365','twostep','雙重','二步','跨網站']);
const catalog=announcements.map(([titleZh,url,titleEn])=>({titleZh,titleEn,url:officialSchoolLeadUrl(url),terms:terms(titleZh+' '+titleEn)}));
const frequency=new Map();
for(const row of catalog)for(const term of row.terms)frequency.set(term,(frequency.get(term)??0)+1);

/** Indexed headlines locate a notice. They are not its body or publication date. */
export function findOfficialDtmNoticeLeads(question){
  const query=terms(question),scores=catalog.flatMap(row=>{
    if(!row.url)return [];
    const matching=overlap(query,row.terms);
    const strong=matching.some(term=>specificity.has(term));
    if(!strong&&(matching.length<2||!matching.some(term=>frequency.get(term)===1)))return [];
    const score=matching.reduce((total,term)=>total+(specificity.has(term)?4:1/frequency.get(term)),0);
    const {titleZh,titleEn,url}=row;
    return [{score,lead:{id:'notice:'+createHash('sha256').update(url).digest('hex').slice(0,24),url,titleZh,titleEn,observedAt}}];
  }).sort((a,b)=>b.score-a.score||a.lead.url.localeCompare(b.lead.url));
  return scores.filter(({score})=>score>=scores[0].score*.7).slice(0,2).map(({lead})=>lead);
}

/** Keep navigation leads beside the verified answer, outside citations and evidence. */
export function createPublicSchoolSourceLeads(question){
  const library=findOfficialLibraryServiceLeads(question);
  const indexed=new Map([...library,...findOfficialDtmNoticeLeads(question)].map(lead=>[lead.url,lead]));
  const blocked=new Set(),readable=new Set(),dynamic=new Map(),query=terms(question);
  const sameLanguage=library.length?libraryAnswerLanguage(question)==='zh-Hant':/\p{Script=Han}/u.test(question);
  return {
    indexed:[...indexed.values()],
    isBlocked(url){
      const original=officialSchoolLeadUrl(url);
      return blocked.has(original)&&!readable.has(original);
    },
    recordAccessRequired({url,title}){
      const original=officialSchoolLeadUrl(url);
      if(!original)return;
      blocked.add(original);
      if(indexed.has(original))return;
      const urlWords=new URL(original).pathname.replace(/[\/_-]+/gu,' ');
      const shared=overlap(query,terms(title+' '+urlWords));
      if(shared.length>=2||shared.some(term=>specificity.has(term)))dynamic.set(original,{url:original});
    },
    recordReadable(url){
      const original=officialSchoolLeadUrl(url);
      if(original)readable.add(original);
    },
    append(reply){
      const cited=new Set((reply.citations??[]).map(item=>officialSchoolLeadUrl(item.url)));
      const selected=[...indexed.values(),...dynamic.values()].filter(lead=>!readable.has(lead.url)&&!cited.has(lead.url)).slice(0,2);
      if(!selected.length)return {reply,step:null};
      const anyBlocked=selected.some(lead=>blocked.has(lead.url));
      const hasLibrary=selected.some(lead=>lead.kind==='library-service');
      let answer=reply.answer;
      // If the caller asked about a specific notice and the sources are behind
      // sign-in, the original notice is the useful handoff. Preserve any answer
      // or limitation that has already been supported by readable evidence.
      if(reply.status==='handoff'&&reply.grounding?.source==='helpful-fallback'&&!cited.size
        &&selected.every(lead=>lead.id?.startsWith('notice:')&&blocked.has(lead.url))){
        const quota=query.has('quota')||/配額|容量/u.test(question);
        const date=/\b(?:date|cutoff|deadline)\b|日期|截止|期限/iu.test(question.normalize('NFKC'));
        if(sameLanguage)answer=quota&&date?'我無法從可讀取的公開資料核實儲存空間配額與日期。':'我無法從可讀取的公開資料核實您詢問的公告內容。';
        else answer=quota&&date?'I couldn’t verify the storage quota or the date you asked about from public sources.'
          :'I couldn’t verify the notice details you asked about from the public pages I could read.';
      }
      const title=sameLanguage?'校方相關連結':'Official source links';
      const rows=selected.map(lead=>{
        const name=(sameLanguage?lead.titleZh:lead.titleEn)??(sameLanguage?'開啟校方來源':'Open the school source');
        const url=lead.url.replace(/[()<>\\]/gu,char=>'%'+char.charCodeAt(0).toString(16).toUpperCase());
        const state=lead.kind==='library-service'?(
          blocked.has(lead.url)?(sameLanguage?'需校方登入，頁面內容尚未核實。':'School sign-in is required. I could not verify the page contents.')
            :(sameLanguage?'目前無法讀取這個頁面以核實詳情。':'I could not read this page to verify the details.')
        ):blocked.has(lead.url)?(sameLanguage?'需校方登入，公告內容尚未核實。':'School sign-in is required. I could not verify the notice contents.')
          :(sameLanguage?'公告索引列出此連結，公告內容尚未核實。':'The school’s notice index lists this link. I could not verify the notice contents.');
        return `- [${name}](${url}) · ${state}`;
      });
      const step={kind:'school-source-lead',label:title,status:'complete',detail:hasLibrary
        ?(sameLanguage?'保留相關圖書館頁面連結供查閱。':'Kept the relevant library pages available to open.')
        :anyBlocked
        ?(sameLanguage?'保留需要校方登入的原始連結。':'Kept the original school link that requires sign-in.')
        :(sameLanguage?'保留校方公告索引的原始連結。':'Kept the original link listed in the school notice index.')};
      return {reply:{...reply,answer:[answer,`**${title}**\n${rows.join('\n')}`].filter(Boolean).join('\n\n'),
        activity:[...(reply.activity??[]).filter(item=>item.kind!==step.kind),step]},step};
    },
  };
}
