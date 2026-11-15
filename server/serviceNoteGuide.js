import {schoolServiceEntries} from '../src/features/public/affairs/studentServices.js';

const services=new Map(schoolServiceEntries.map(entry=>[entry.id,entry]));
const recordPaths=keys=>keys.map(key=>services.get(key)).filter(Boolean);

function serviceNoteCitation(entry,zh,requestSignIn){
  const url=requestSignIn?'/school-affairs/login?next='+encodeURIComponent(entry.localUrl):entry.localUrl;
  const title=requestSignIn?(zh?'登入後開啟 '+entry.title:'Sign in to open '+entry.title):entry.title;
  return {chunkId:'directory:service-note:'+entry.id,title,url,claim:title,sourceName:'School Affairs',locator:null,effectiveAt:null,reviewedAt:null};
}

export function serviceNoteNavigationAnswer(question,key,signedIn,trackingNotes=true){
  const entry=services.get(key);
  if(!entry||entry.localUrl!=='/school-affairs/services/'+key)return null;
  const zh=/[\u3400-\u9fff]/u.test(question);
  const citation=serviceNoteCitation(entry,zh,!signedIn);
  const intro=trackingNotes?(zh?'您可以在此開啟服務頁面並管理私人備註。':'Open the service page to manage your private tracking notes.')
    :(zh?'開啟此服務頁面，查看校方入口及私人追蹤備註。':'Open this service page to find the school service and manage your private tracking notes.');
  return {status:'answered',answer:intro+'\n\n['+citation.title+']('+citation.url+')',citations:[citation],
    suggestedQuestions:[],grounding:{source:'directory',webSearched:false}};
}

/** Local links and capability boundaries, with no record access. */
export function serviceNoteGuide(question,scope,signedIn){
  const zh=/[\u3400-\u9fff]/u.test(question);
  const entries=recordPaths(scope.officialOnly?scope.boundaryKeys:scope.keys);
  const citations=scope.foreign?[]:entries.map(entry=>serviceNoteCitation(entry,zh,!signedIn&&!scope.officialOnly));
  const links=citations.map(({title,url})=>'['+title+']('+url+')').join(' · ');
  const answer=scope.foreign
    ?(zh?'我只能查詢您登入的 stu.best 帳戶，無法存取其他學生的私人備註。':'I can only check your signed-in stu.best account. I can’t show another student’s private notes.')
    :scope.invalidService
      ?(zh?'請提供正確的服務編號，或開啟對應的服務頁面再試一次。':'I couldn’t match that service number. Check it or open the intended service page and try again.')
    :scope.officialOnly
      ?scope.operation
        ?(zh?'我無法在對話中修改備註或代您向校方提交。您可在服務頁面管理私人備註。':'I cannot change the note in chat, and I cannot submit it to the university. You can edit your private note on the service page.')
        :(zh?'這些服務在 stu.best 備有私人追蹤備註。校方結果、資格、核准或送件狀態無法在此確認。':'These services store private tracking notes in stu.best. I can’t verify an official decision, eligibility, approval or submission here.')
      :scope.keys.length
        ?(zh?'登入 School Affairs 後，我可以查看您儲存的私人追蹤備註。':'Sign in to School Affairs and I can check the private tracking notes you saved.')
        :(zh?'已略過您要求不要查看的私人備註。':'I skipped the private notes you asked me to leave out.');
  return {status:'handoff',answer:[answer,links].filter(Boolean).join('\n\n'),citations,suggestedQuestions:[],
    grounding:{source:signedIn?'account':'assistant-help',webSearched:false}};
}
