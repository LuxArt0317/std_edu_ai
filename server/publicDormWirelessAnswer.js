import source from './data/wirelessGuide.json' with {type:'json'};
import {assistantLanguage} from '../src/services/assistantLanguage.js';

export function publicDormWirelessAnswer(question){
 if(typeof question!=='string'||question.length>2000||!/\b(?:dorm(?:itory)?|residence hall)\b|宿舍/iu.test(question)||!/\b(?:wi[ -]?fi|wireless|internet|network)\b|無線|網路/iu.test(question))return null;
 if(/\b(?:tuition|housing fees?|dorm fees?|scholarship|move out|check.?out|bed assignment|grades?|assignments?)\b|學費|住宿費|退宿|獎學金|床位分配|成績|作業/iu.test(question))return null;
 if(/\b(?:my|his|her|their)\b.{0,24}\b(?:ip address|password|credentials?|registration status)\b|我的.{0,12}(?:IP|密碼|註冊狀態)/iu.test(question))return null;
 const zh=assistantLanguage(question)==='zh-Hant';
 const [wireless,setup]=source.documents;
 const networks=source.networks.map(name=>'**'+name+'**').join(zh?' 或 ':' or ');
 const missing=!source.registrationCaptured?(zh?'此網站尚未收錄宿舍網路登錄系統；以下設定教學不是註冊頁面。':'The dorm network registration system is not captured on this website; the setup guide below is not a registration page.') : '';
 const answer=zh?`宿舍無線網路需要先在獨立的宿舍網路登錄系統註冊服務。${missing}\n\n開啟[無線網路設定教學](${setup.url})，選擇「電腦」、Windows 或 macOS，再選「宿舍」。依裝置支援情況選擇 ${networks}，並依教學使用802.1X認證；如裝置需要憑證，請完成相應步驟，不要猜測共用密碼。\n\n若無法註冊或連線，請查看[無線網路說明](${wireless.url})，或聯絡電算中心 **07-6158000分機${source.extension}**、**${source.email}**。`:
 `Dorm Wi-Fi requires registration through the separate dorm network system first. ${missing}\n\nOpen the [wireless setup guide](${setup.url}), choose **Computer → Windows or macOS → Dorm**, then follow the instructions for ${networks}, depending on your device. These use **802.1X authentication**; complete any required certificate setup rather than guessing a shared password.\n\nIf registration or connection fails, use the [wireless service information](${wireless.url}) or contact the Computing Center at **07-6158000 ext. ${source.extension}**, **${source.email}**.`;
 return {status:'answered',answer,citations:source.documents.map((document,index)=>({chunkId:'dorm-wireless:'+index,title:document.title,url:document.url,sourceName:document.title,claim:'Public wireless registration prerequisite, network names, setup choices and support contact from checked source pages.',locator:null,effectiveAt:null,reviewedAt:null})),suggestedQuestions:[],grounding:{source:'public-page-context',webSearched:false,capturedOn:wireless.capturedOn},activity:[{kind:'dorm-wireless-guide',label:'Checked dorm wireless instructions',detail:'Used checksum-verified wireless and device-setup pages. Registration is a separate service; no account credentials or personal network status were read.',status:'complete'}]};
}
